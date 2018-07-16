import ofEvents from '../browser/of_events';
import route from './route';
import { app } from 'electron';
import * as log from '../browser/log';

/**
 * Interface of a converted JS error into a plain object
 */
interface ErrorPlainObject {
    stack: string;
    message: string;
    toString(): string;
}

/**
 * This function converts JS errors into plain objects
 */
export function errorToPOJO(error: Error): ErrorPlainObject {
    return {
        stack: error.stack,
        message: error.message,
        toString: error.toString
    };
}

/*
    Safe errors
*/
let isInitSafeErrors = false;
export function initSafeErrors(argo: any) {
    // Safety check to make sure to process safe errors only once
    // at first runtime instance initialization
    if (isInitSafeErrors) {
        return;
    }

    if (!argo['disable-safe-errors']) {
        process.on('uncaughtException', createErrorUI);
    }

    isInitSafeErrors = true;
}

function createErrorUI(err: Error) {
    // prevent issue with circular dependencies.
    const Application = require('../browser/api/application').Application;
    const coreState = require('../browser/core_state');

    const appUuid = `error-app-${app.generateGUID()}`;

    try {
        const errorAppOptions = {
            url: `file:///${__dirname}/../../assets/error.html`,
            uuid: appUuid,
            name: appUuid,
            mainWindowOptions: {
                icon: `file:///${__dirname}/../../assets/error-icon.png`,
                defaultHeight: 200, // size increased later to fully fit error message
                defaultWidth: 570,
                defaultCentered: true,
                saveWindowState: false,
                showTaskbarIcon: false,
                autoShow: false, // shown later after resizing is done
                alwaysOnTop: true,
                resizable: false,
                contextMenu: false,
                minimizable: false,
                maximizable: false,
                nonPersistent: true,
                experimental: {
                    'v2Api': true
                },
                customData: {
                    error: errorToPOJO(err)
                }
            }
        };

        Application.create(errorAppOptions);

        ofEvents.once(route.application('closed', appUuid), () => {
            coreState.deleteApp(appUuid);
        });

        Application.run({ uuid: appUuid });
        log.writeToLog('info', err);

    } catch (err) {
        log.writeToLog('info', err);
    }

}
