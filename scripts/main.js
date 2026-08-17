import { Config } from './config.js';
import { Logger } from './logger.js';
import { PartyCrunchHUD } from './hud.js';

export class PartyCruncher {
    static FLAG_SCOPE = "jenne-party-crunch";
    static FLAG_KEY = "members";

    static getCrunchedTokens() {
        if (!canvas.scene) return [];
        return canvas.scene.tokens.filter(t => t.flags[this.FLAG_SCOPE]?.[this.FLAG_KEY] !== undefined);
    }

    static getIndividuals() {
        if (!canvas.scene) return [];
        
        // Scene tokens that are NOT crunched tokens
        let individuals = canvas.scene.tokens.filter(t => t.flags[this.FLAG_SCOPE]?.[this.FLAG_KEY] === undefined).map(t => ({
            id: t.id,
            name: t.name,
            img: t.texture?.src || t.document?.texture?.src,
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
                    img: memberData.texture?.src,
                    inParty: partyToken.id,
                    partyName: partyToken.name,
                    storedData: memberData
                });
            });
        });

        // Sort alphabetically
        individuals.sort((a, b) => a.name.localeCompare(b.name));
        return individuals;
    }

    static async createPartyToken() {
        const actorId = game.settings.get(Config.data.modID, "partyActorId");
        if (!actorId) {
            ui.notifications.warn("Please configure a Party Actor ID in the module settings.");
            return;
        }
        const actor = game.actors.get(actorId);
        if (!actor) {
            ui.notifications.error("Party Actor not found. Check your module settings.");
            return;
        }
        
        // Spawn at center of screen
        const center = canvas.clientCoordinatesFromCanvas(window.innerWidth / 2, window.innerHeight / 2);
        // V14 syntax for getting snapped position might differ, but canvas.grid.getSnappedPosition is standard
        const point = canvas.grid.getSnappedPosition(center.x, center.y);
        
        const tokenData = (await actor.getTokenDocument({
            x: point.x,
            y: point.y,
            flags: {
                [this.FLAG_SCOPE]: {
                    [this.FLAG_KEY]: []
                }
            }
        })).toObject();
        
        await canvas.scene.createEmbeddedDocuments("Token", [tokenData]);
    }

    static async uncrunchParty(partyTokenId) {
        const partyToken = canvas.scene.tokens.get(partyTokenId);
        if (!partyToken) return;
        
        const members = partyToken.getFlag(this.FLAG_SCOPE, this.FLAG_KEY) || [];
        const toCreate = members.map(m => {
            m.x = partyToken.x;
            m.y = partyToken.y;
            delete m._id; 
            return m;
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
                m.x = partyToken.x;
                m.y = partyToken.y;
                delete m._id;
                toCreate.push(m);
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
    if (!jenneSuite.activeTool) {
        jenneSuite.activeTool = tool.name;
    }
});
