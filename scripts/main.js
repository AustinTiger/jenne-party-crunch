import { Config } from './config.js';
import { Logger } from './logger.js';
import { PartyCrunchHUD } from './hud.js';

export class PartyCruncher {
    static FLAG_SCOPE = "jenne-party-crunch";
    static FLAG_KEY = "members";

    static getCrunchedTokens() {
        if (!canvas.scene) return [];
        return canvas.scene.tokens.filter(t => t.flags?.[this.FLAG_SCOPE]?.[this.FLAG_KEY] !== undefined);
    }

    static getIndividuals() {
        if (!canvas.scene) return [];
        
        // Scene tokens that are NOT crunched tokens
        let individuals = canvas.scene.tokens
            .filter(t => t.flags?.[this.FLAG_SCOPE]?.[this.FLAG_KEY] === undefined)
            .map(t => ({
                id: t.id,
                name: t.name,
                img: t.texture?.src || t.document?.texture?.src || t.actor?.img || "icons/svg/mystery-man.svg",
                inParty: false,
                sceneToken: t
            }));

        // Tokens stored inside crunched tokens
        this.getCrunchedTokens().forEach(partyToken => {
            const members = partyToken.getFlag(this.FLAG_SCOPE, this.FLAG_KEY) || [];
            members.forEach(memberData => {
                individuals.push({
                    id: memberData._id, // original stored id
                    name: memberData.name,
                    img: memberData.texture?.src || memberData.img || "icons/svg/mystery-man.svg",
                    inParty: partyToken.id,
                    partyName: partyToken.name,
                    storedData: memberData
                });
            });
        });

        // Sort alphabetically
        individuals.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        return individuals;
    }

    /**
     * Resolves an Actor from a UUID, ID, or Name.
     * @param {string} [actorIdentifier] - Specific actor UUID/ID to resolve. If omitted, uses setting.
     * @returns {Promise<Actor|null>}
     */
    static async resolveActor(actorIdentifier) {
        let identifier = (actorIdentifier || game.settings.get(Config.data.modID, "partyActorId") || "").trim();
        if (!identifier) return null;

        // 1. Try fromUuidSync / fromUuid (supports "Actor.id" and compendium UUIDs)
        try {
            let actor = fromUuidSync(identifier) || (await fromUuid(identifier));
            if (actor?.documentName === "Actor") return actor;
            if (actor instanceof Actor) return actor;
        } catch (err) {
            Logger.debug("fromUuid lookup failed:", err);
        }

        // 2. Try stripping "Actor." prefix for local actors collection
        const cleanId = identifier.replace(/^Actor\./, "");
        let localActor = game.actors.get(cleanId);
        if (localActor) return localActor;

        // 3. Try lookup by raw ID
        localActor = game.actors.get(identifier);
        if (localActor) return localActor;

        // 4. Try lookup by Actor Name
        localActor = game.actors.getName(identifier);
        if (localActor) return localActor;

        return null;
    }

    static async createPartyToken(actorIdentifier = null) {
        if (!canvas.ready || !canvas.scene) {
            ui.notifications.warn("Please open a Scene before creating a Party Token.");
            return;
        }

        const actor = await this.resolveActor(actorIdentifier);
        if (!actor) {
            ui.notifications.warn("Please select an Actor to create the party token.");
            return;
        }
        
        // Compute center of current viewport / canvas
        const center = canvas.stage?.pivot ?? { x: canvas.dimensions?.width / 2 ?? 0, y: canvas.dimensions?.height / 2 ?? 0 };
        let point = { x: center.x, y: center.y };
        if (canvas.grid?.getSnappedPoint) {
            point = canvas.grid.getSnappedPoint(center, { mode: CONST.GRID_SNAPPING_MODES?.CENTER });
        } else if (canvas.grid?.getSnappedPosition) {
            point = canvas.grid.getSnappedPosition(center.x, center.y);
        }
        
        const tokenDocument = await actor.getTokenDocument({
            x: point.x,
            y: point.y,
            flags: {
                [this.FLAG_SCOPE]: {
                    [this.FLAG_KEY]: []
                }
            }
        });
        
        const tokenData = tokenDocument.toObject();
        const created = await canvas.scene.createEmbeddedDocuments("Token", [tokenData]);
        ui.notifications.info(`Created Party Token for "${actor.name}".`);
        return created;
    }

    static async uncrunchParty(partyTokenId) {
        const partyToken = canvas.scene.tokens.get(partyTokenId);
        if (!partyToken) return;
        
        const members = partyToken.getFlag(this.FLAG_SCOPE, this.FLAG_KEY) || [];
        const toCreate = members.map(m => {
            const clone = foundry.utils.deepClone(m);
            clone.x = partyToken.x;
            clone.y = partyToken.y;
            delete clone._id; 
            return clone;
        });

        if (toCreate.length > 0) {
            await canvas.scene.createEmbeddedDocuments("Token", toCreate);
        }
        await partyToken.delete();
    }

    static async addTokensToParty(partyTokenId, sceneTokenIds) {
        const partyToken = canvas.scene.tokens.get(partyTokenId);
        if (!partyToken) return;

        let members = partyToken.getFlag(this.FLAG_SCOPE, this.FLAG_KEY) || [];
        members = foundry.utils.deepClone(members);
        
        const tokensToDelete = [];
        for (const id of sceneTokenIds) {
            const token = canvas.scene.tokens.get(id);
            if (token) {
                const tokenData = token.toObject();
                members.push(tokenData);
                tokensToDelete.push(id);
            }
        }

        await partyToken.setFlag(this.FLAG_SCOPE, this.FLAG_KEY, members);
        if (tokensToDelete.length > 0) {
            await canvas.scene.deleteEmbeddedDocuments("Token", tokensToDelete);
        }
    }

    static async removeTokensFromParty(partyTokenId, storedMemberIds) {
        const partyToken = canvas.scene.tokens.get(partyTokenId);
        if (!partyToken) return;

        let members = partyToken.getFlag(this.FLAG_SCOPE, this.FLAG_KEY) || [];
        const toCreate = [];
        members = members.filter(m => {
            if (storedMemberIds.includes(m._id)) {
                const clone = foundry.utils.deepClone(m);
                clone.x = partyToken.x;
                clone.y = partyToken.y;
                delete clone._id;
                toCreate.push(clone);
                return false;
            }
            return true;
        });

        if (toCreate.length > 0) {
            await canvas.scene.createEmbeddedDocuments("Token", toCreate);
        }
        await partyToken.setFlag(this.FLAG_SCOPE, this.FLAG_KEY, members);
    }
}

Hooks.once('init', () => {
    Config.init();
    Logger.init();
});

let hudInstance = null;

Hooks.on('getSceneControlButtons', (controls) => {
    if (!game.user.isGM) return;

    let jenneSuite;
    const isArray = Array.isArray(controls);
    if (isArray) {
        jenneSuite = controls.find(c => c.name === "jenne-suite");
    } else {
        jenneSuite = controls["jenne-suite"];
    }

    if (!jenneSuite) {
        jenneSuite = {
            name: "jenne-suite",
            title: "Jenne Suite",
            icon: "jenne-gothic-j-icon",
            layer: "jenneSuite",
            visible: true,
            tools: isArray ? [] : {}
        };
        if (isArray) {
            controls.push(jenneSuite);
        } else {
            controls["jenne-suite"] = jenneSuite;
        }
        console.log("Jenne Party Crunch | Initialized 'jenne-suite' control group fallback");
    }

    // Ensure tools is properly initialized
    if (!jenneSuite.tools) {
        jenneSuite.tools = isArray ? [] : {};
    }

    const tool = {
        name: "party-crunch",
        title: "Party Crunch",
        icon: "fa-solid fa-users-viewfinder",
        button: true,
        onClick: () => {
            if (!hudInstance) hudInstance = new PartyCrunchHUD();
            hudInstance.render(true);
        },
        onChange: () => {
            if (!hudInstance) hudInstance = new PartyCrunchHUD();
            hudInstance.render(true);
        }
    };

    const isToolsArray = Array.isArray(jenneSuite.tools);
    if (isToolsArray) {
        if (!jenneSuite.tools.some(t => t.name === tool.name)) {
            jenneSuite.tools.push(tool);
        }
    } else {
        jenneSuite.tools[tool.name] = tool;
    }
});
