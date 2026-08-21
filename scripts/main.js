import { Config } from './config.js';
import { Logger } from './logger.js';
import { PartyCrunchHUD } from './hud.js';

export class PartyCruncher {
    static FLAG_SCOPE = "jenne-party-crunch";
    static FLAG_KEY_MEMBERS = "members";
    static FLAG_KEY_CRUNCHED = "isCrunched";
    static FLAG_KEY_PARTY_ID = "partyId";

    // Backwards compatibility alias
    static FLAG_KEY = "members";

    /**
     * Returns all party token documents in the current scene.
     * @returns {Array<TokenDocument>}
     */
    static getCrunchedTokens() {
        if (!canvas.scene) return [];
        return canvas.scene.tokens.filter(t => t.flags?.[this.FLAG_SCOPE]?.[this.FLAG_KEY_MEMBERS] !== undefined);
    }

    /**
     * Returns all individual tokens on canvas and stored members.
     */
    static getIndividuals() {
        if (!canvas.scene) return [];
        
        const parties = this.getCrunchedTokens();
        const partyMap = new Map(parties.map(p => [p.id, p]));

        // 1. Tokens currently on the canvas that are NOT party tokens
        let individuals = canvas.scene.tokens
            .filter(t => t.flags?.[this.FLAG_SCOPE]?.[this.FLAG_KEY_MEMBERS] === undefined)
            .map(t => {
                const assignedPartyId = t.getFlag(this.FLAG_SCOPE, this.FLAG_KEY_PARTY_ID);
                const assignedParty = assignedPartyId ? partyMap.get(assignedPartyId) : null;
                return {
                    id: t.id,
                    name: t.name,
                    img: t.texture?.src || t.document?.texture?.src || t.actor?.img || "icons/svg/mystery-man.svg",
                    inParty: assignedParty ? assignedParty.id : false,
                    partyName: assignedParty ? assignedParty.name : null,
                    isCrunched: false,
                    sceneToken: t
                };
            });

        // 2. Tokens stored inside CRUNCHED parties (not currently present on canvas)
        parties.forEach(partyToken => {
            const isCrunched = partyToken.getFlag(this.FLAG_SCOPE, this.FLAG_KEY_CRUNCHED) ?? false;
            if (isCrunched) {
                const members = partyToken.getFlag(this.FLAG_SCOPE, this.FLAG_KEY_MEMBERS) || [];
                members.forEach(memberData => {
                    // Only add if not already in individuals list
                    if (!individuals.some(i => i.id === memberData._id)) {
                        individuals.push({
                            id: memberData._id,
                            name: memberData.name,
                            img: memberData.texture?.src || memberData.img || "icons/svg/mystery-man.svg",
                            inParty: partyToken.id,
                            partyName: partyToken.name,
                            isCrunched: true,
                            storedData: memberData
                        });
                    }
                });
            }
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

    /**
     * Creates a new Party Token on the current scene.
     * Initial status is Uncrunched so users can add members without immediate deletion.
     * @param {string} [actorIdentifier]
     */
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
            hidden: false,
            flags: {
                [this.FLAG_SCOPE]: {
                    [this.FLAG_KEY_MEMBERS]: [],
                    [this.FLAG_KEY_CRUNCHED]: false
                }
            }
        });
        
        const tokenData = tokenDocument.toObject();
        const created = await canvas.scene.createEmbeddedDocuments("Token", [tokenData]);
        ui.notifications.info(`Created new party "${actor.name}".`);
        return created;
    }

    /**
     * Adds / assigns individual tokens to a party.
     * Does NOT auto-crunch if the party is currently uncrunched.
     * @param {string} partyTokenId
     * @param {Array<string>} sceneTokenIds
     */
    static async addTokensToParty(partyTokenId, sceneTokenIds) {
        const partyToken = canvas.scene.tokens.get(partyTokenId);
        if (!partyToken) return;

        const isCrunched = partyToken.getFlag(this.FLAG_SCOPE, this.FLAG_KEY_CRUNCHED) ?? false;
        let members = partyToken.getFlag(this.FLAG_SCOPE, this.FLAG_KEY_MEMBERS) || [];
        members = foundry.utils.deepClone(members);
        
        const tokensToDelete = [];
        for (const id of sceneTokenIds) {
            const token = canvas.scene.tokens.get(id);
            if (token) {
                const tokenData = token.toObject();
                // Store member data
                if (!members.some(m => m._id === token.id)) {
                    members.push(tokenData);
                }
                // Tag the individual token with the party ID
                await token.setFlag(this.FLAG_SCOPE, this.FLAG_KEY_PARTY_ID, partyTokenId);

                // Only delete from canvas if the party is ALREADY crunched
                if (isCrunched) {
                    tokensToDelete.push(id);
                }
            }
        }

        await partyToken.setFlag(this.FLAG_SCOPE, this.FLAG_KEY_MEMBERS, members);
        if (tokensToDelete.length > 0) {
            await canvas.scene.deleteEmbeddedDocuments("Token", tokensToDelete);
        }
        ui.notifications.info(`Assigned ${sceneTokenIds.length} token(s) to "${partyToken.name}".`);
    }

    /**
     * Removes tokens from a party.
     * @param {string} partyTokenId
     * @param {Array<string>} memberIds
     */
    static async removeTokensFromParty(partyTokenId, memberIds) {
        const partyToken = canvas.scene.tokens.get(partyTokenId);
        if (!partyToken) return;

        const isCrunched = partyToken.getFlag(this.FLAG_SCOPE, this.FLAG_KEY_CRUNCHED) ?? false;
        let members = partyToken.getFlag(this.FLAG_SCOPE, this.FLAG_KEY_MEMBERS) || [];
        const toCreate = [];

        for (const memberId of memberIds) {
            // If the token is on canvas, remove partyId flag
            const canvasToken = canvas.scene.tokens.get(memberId);
            if (canvasToken) {
                await canvasToken.unsetFlag(this.FLAG_SCOPE, this.FLAG_KEY_PARTY_ID);
            } else if (isCrunched) {
                // If it was stored in flags, spawn it back
                const stored = members.find(m => m._id === memberId);
                if (stored) {
                    const clone = foundry.utils.deepClone(stored);
                    clone.x = partyToken.x;
                    clone.y = partyToken.y;
                    delete clone._id;
                    if (clone.flags?.[this.FLAG_SCOPE]) {
                        delete clone.flags[this.FLAG_SCOPE][this.FLAG_KEY_PARTY_ID];
                    }
                    toCreate.push(clone);
                }
            }
        }

        // Filter out removed members from party flags
        members = members.filter(m => !memberIds.includes(m._id));

        if (toCreate.length > 0) {
            await canvas.scene.createEmbeddedDocuments("Token", toCreate);
        }
        await partyToken.setFlag(this.FLAG_SCOPE, this.FLAG_KEY_MEMBERS, members);
        ui.notifications.info(`Removed ${memberIds.length} token(s) from "${partyToken.name}".`);
    }

    /**
     * Toggles a party between Crunched and Uncrunched states.
     * Does NOT delete the party token upon uncrunching!
     * @param {string} partyTokenId
     */
    static async toggleCrunch(partyTokenId) {
        const partyToken = canvas.scene.tokens.get(partyTokenId);
        if (!partyToken) return;

        const isCrunched = partyToken.getFlag(this.FLAG_SCOPE, this.FLAG_KEY_CRUNCHED) ?? false;
        if (isCrunched) {
            await this.uncrunchParty(partyTokenId);
        } else {
            await this.crunchParty(partyTokenId);
        }
    }

    /**
     * Uncrunch: Spawns member tokens on canvas and hides party token.
     * Preserves the party token so it can be re-crunched later!
     * @param {string} partyTokenId
     */
    static async uncrunchParty(partyTokenId) {
        const partyToken = canvas.scene.tokens.get(partyTokenId);
        if (!partyToken) return;

        const members = partyToken.getFlag(this.FLAG_SCOPE, this.FLAG_KEY_MEMBERS) || [];
        if (members.length === 0) {
            ui.notifications.warn(`"${partyToken.name}" has no members to uncrunch.`);
            return;
        }

        const toCreate = members.map((m, idx) => {
            const clone = foundry.utils.deepClone(m);
            // Arrange members near the party token
            const gridSize = canvas.grid.size || 100;
            const offsetX = (idx % 3) * gridSize;
            const offsetY = Math.floor(idx / 3) * gridSize;
            clone.x = partyToken.x + offsetX;
            clone.y = partyToken.y + offsetY;
            delete clone._id;
            
            // Link to party
            if (!clone.flags) clone.flags = {};
            if (!clone.flags[this.FLAG_SCOPE]) clone.flags[this.FLAG_SCOPE] = {};
            clone.flags[this.FLAG_SCOPE][this.FLAG_KEY_PARTY_ID] = partyTokenId;
            return clone;
        });

        // Spawn members
        const createdTokens = await canvas.scene.createEmbeddedDocuments("Token", toCreate);

        // Update stored member IDs to match the new token IDs
        const updatedMembers = createdTokens.map(t => t.toObject());

        // Hide party token and update flag
        await partyToken.update({
            hidden: true,
            [`flags.${this.FLAG_SCOPE}.${this.FLAG_KEY_MEMBERS}`]: updatedMembers,
            [`flags.${this.FLAG_SCOPE}.${this.FLAG_KEY_CRUNCHED}`]: false
        });

        ui.notifications.info(`Uncrunched party "${partyToken.name}".`);
    }

    /**
     * Crunch: Collapses active member tokens into the party token.
     * @param {string} partyTokenId
     */
    static async crunchParty(partyTokenId) {
        const partyToken = canvas.scene.tokens.get(partyTokenId);
        if (!partyToken) return;

        let members = partyToken.getFlag(this.FLAG_SCOPE, this.FLAG_KEY_MEMBERS) || [];
        const memberIds = members.map(m => m._id);

        // Find all member tokens on the canvas
        const canvasMembers = canvas.scene.tokens.filter(t => 
            t.getFlag(this.FLAG_SCOPE, this.FLAG_KEY_PARTY_ID) === partyTokenId || memberIds.includes(t.id)
        );

        if (canvasMembers.length === 0 && members.length === 0) {
            ui.notifications.warn(`"${partyToken.name}" has no members to crunch.`);
            return;
        }

        let newX = partyToken.x;
        let newY = partyToken.y;

        // If members are on canvas, save their latest state and move party token to them
        const tokensToDelete = [];
        if (canvasMembers.length > 0) {
            newX = canvasMembers[0].x;
            newY = canvasMembers[0].y;
            members = canvasMembers.map(t => {
                tokensToDelete.push(t.id);
                return t.toObject();
            });
        }

        // Delete active member tokens from canvas
        if (tokensToDelete.length > 0) {
            await canvas.scene.deleteEmbeddedDocuments("Token", tokensToDelete);
        }

        // Unhide party token and update flags
        await partyToken.update({
            x: newX,
            y: newY,
            hidden: false,
            [`flags.${this.FLAG_SCOPE}.${this.FLAG_KEY_MEMBERS}`]: members,
            [`flags.${this.FLAG_SCOPE}.${this.FLAG_KEY_CRUNCHED}`]: true
        });

        ui.notifications.info(`Crunched party "${partyToken.name}".`);
    }

    /**
     * Deletes a party token and restores any crunched members to the scene.
     * @param {string} partyTokenId
     */
    static async deleteParty(partyTokenId) {
        const partyToken = canvas.scene.tokens.get(partyTokenId);
        if (!partyToken) return;

        const isCrunched = partyToken.getFlag(this.FLAG_SCOPE, this.FLAG_KEY_CRUNCHED) ?? false;
        const members = partyToken.getFlag(this.FLAG_SCOPE, this.FLAG_KEY_MEMBERS) || [];

        // If crunched, restore members to canvas so they aren't lost
        if (isCrunched && members.length > 0) {
            const toCreate = members.map((m, idx) => {
                const clone = foundry.utils.deepClone(m);
                const gridSize = canvas.grid.size || 100;
                clone.x = partyToken.x + (idx * gridSize);
                clone.y = partyToken.y;
                delete clone._id;
                if (clone.flags?.[this.FLAG_SCOPE]) {
                    delete clone.flags[this.FLAG_SCOPE][this.FLAG_KEY_PARTY_ID];
                }
                return clone;
            });
            await canvas.scene.createEmbeddedDocuments("Token", toCreate);
        } else {
            // Unset partyId flag from any active scene tokens
            const canvasMembers = canvas.scene.tokens.filter(t => 
                t.getFlag(this.FLAG_SCOPE, this.FLAG_KEY_PARTY_ID) === partyTokenId
            );
            for (const t of canvasMembers) {
                await t.unsetFlag(this.FLAG_SCOPE, this.FLAG_KEY_PARTY_ID);
            }
        }

        const partyName = partyToken.name;
        await partyToken.delete();
        ui.notifications.info(`Deleted party "${partyName}".`);
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
