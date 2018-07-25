import { app } from 'electron';
import { writeToLog } from '../browser/log';
import * as path from 'path';
import ofEvents from '../browser/of_events';
import route from './route';

// Error titles
export const ERROR_TITLE_APP_INITIALIZATION = 'A JavaScript error occured during app initialization';
export const ERROR_TITLE_MAIN_PROCESS = 'A JavaScript error occurred in the main process';
export const ERROR_TITLE_RENDERER_CRASH = 'Renderer Crash';

// Window types
export const ERROR_TYPE_APP_INITIALIZATION = 'OF_error_box:app_initialization';
export const ERROR_TYPE_MAIN_PROCESS = 'OF_error_box:main_process';
export const ERROR_TYPE_RENDERER_CRASH = 'OF_error_box:renderer_crash';

/**
 * Interface of a converted JS error into a plain object
 */
interface ErrorPlainObject {
    stack: string;
    message: string;
    toString(): string;
}

interface ErrorBox {
    error: Error; // error printed to logs
    message?: string; // optional custom error message instead of error.stack
    title?: string; // optional blue error title
    type: string; // type of the error to add to window
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
export function initSafeErrors(argo: any): void {
    // Safety check to make sure to process safe errors only once
    // at first runtime instance initialization
    if (isInitSafeErrors) {
        return;
    }

    if (!argo['disable-safe-errors']) {
        process.on('uncaughtException', (error: Error) => {
            const title = ERROR_TITLE_MAIN_PROCESS;
            const type = ERROR_TYPE_MAIN_PROCESS;
            showErrorBox({ error, title, type });
        });
    }

    isInitSafeErrors = true;
}

export function showErrorBox(data: ErrorBox): Promise<void> {
    return new Promise((resolve) => {

        // prevent issue with circular dependencies.
        const { Application } = require('../browser/api/application');
        const { argo, deleteApp } = require('../browser/core_state');

        const { error, message, title = '', type } = data;
        const uuid = `error-app-${app.generateGUID()}`;

        writeToLog('info', error);

        if (argo.noerrdialogs) {
            return resolve();
        }

        try {
            const options = {
                _type: type,
                url: `file:///${path.resolve(`${__dirname}/../../assets/error.html`)}`,
                uuid,
                name: uuid,
                mainWindowOptions: {
                    icon: `file:///${path.resolve(`${__dirname}/../../assets/error-icon.png`)}`,
                    defaultHeight: 150, // size increased later to fully fit error message
                    defaultWidth: 570,
                    defaultCentered: true,
                    saveWindowState: false,
                    showTaskbarIcon: false,
                    autoShow: false, // shown later after resizing is done
                    alwaysOnTop: true,
                    resizable: false,
                    contextMenu: true,
                    minimizable: false,
                    maximizable: false,
                    nonPersistent: true,
                    experimental: {
                        v2Api: true
                    },
                    customData: {
                        error: message || error.stack,
                        title
                    }
                }
            };

            Application.create(options);

            ofEvents.once(route.application('closed', uuid), () => {
                deleteApp(uuid);
                resolve();
            });

            Application.run({ uuid });

        } catch (error) {
            writeToLog('info', error);
        }
    });
}
