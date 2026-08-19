import { Logger } from './logger.js';

export const MOD_ID = "jenne-party-crunch";
export const MOD_TITLE = "Jenne Party Crunch";

export class Config {
    static data = {
        modID: MOD_ID,
        modTitle: MOD_TITLE,
        modlink: "https://github.com/AustinTiger/jenne-party-crunch"
    };

    /**
     * Helper to get the major version of the game.
     */
    static getGameMajorVersion() {
        return parseInt(game.version.split(".")[0]);
    }

    /**
     * Returns a registered setting's value.
     * @param {string} key - The setting key
     */
    static setting(key) {
        if (key === 'modVersion') {
            return game.modules.get(MOD_ID)?.version || "1.0.0";
        }
        return game.settings.get(MOD_ID, key);
    }

    /**
     * Modifies a registered setting's value.
     * @param {string} key - The setting key
     * @param {*} value - The value to assign
     */
    static async modifySetting(key, value) {
        return game.settings.set(MOD_ID, key, value);
    }

    /**
     * Helper to localize strings.
     * @param {string} key - Localization key
     */
    static localize(key) {
        return game.i18n.localize(key);
    }

    static init() {
        game.settings.register(MOD_ID, "partyActorId", {
            name: "Default Party Actor ID or UUID",
            hint: "The ID, UUID (e.g. Actor.lldsj1JYvkOs7rgo), or Name of the Actor that represents the Party Token. When you 'Create New Party', a token of this Actor will be spawned.",
            scope: "world",
            config: true,
            type: String,
            default: ""
        });
        Logger.debug("Config initialized.");
    }
}
