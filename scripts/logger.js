import { Config } from './config.js';

export class Logger {
    static init() {
        game.settings.register(Config.data.modID, "debug", {
            name: "Debug Mode",
            hint: "Enable detailed logging in the browser console for party crunch operations.",
            scope: "client",
            config: true,
            type: Boolean,
            default: false
        });
    }

    static info(...args) {
        console.log(`${Config?.data?.modTitle ?? ""} [${Config?.data?.modID ?? ""}] | `, ...args);
    }

    static infoGreen(msg) {
        console.log(`%c${Config?.data?.modTitle ?? ""} [${Config?.data?.modID ?? ""}] | ${msg}`, 'color: green');
    }

    static debug(...args) {
        let isDebugMode = false;
        try {
            isDebugMode = Config.setting('debug');
        } catch {}
        if (isDebugMode) {
            console.debug(`${Config?.data?.modTitle ?? ""} [${Config?.data?.modID ?? ""}] | DEBUG | `, ...args);
        }
    }

    static warn(suppressUIMsg = false, ...args) {
        console.warn(`${Config?.data?.modTitle ?? ""} [${Config?.data?.modID ?? ""}] | WARNING | `, ...args);
        if (!suppressUIMsg) {
            ui.notifications.warn(`[${Config?.data?.modTitle ?? ""}] ${args[0]}`);
        }
    }

    static error(suppressUIMsg = false, ...args) {
        console.error(`${Config?.data?.modTitle ?? ""} [${Config?.data?.modID ?? ""}] | ERROR | `, ...args);
        if (!suppressUIMsg) {
            ui.notifications.error(`[${Config?.data?.modTitle ?? ""}] ${args[0]}`);
        }
    }

    static catchThrow(thrown, toastMsg = undefined) {
        console.warn(thrown);
        if (toastMsg) Logger.error(toastMsg);
    }
}
