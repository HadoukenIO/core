/*
Copyright 2018 OpenFin Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
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
            url: `file:///${__dirname}/../error/index.html`,
            uuid: appUuid,
            name: appUuid,
            mainWindowOptions: {
                defaultHeight: 250,
                defaultWidth: 570,
                defaultCentered: true,
                saveWindowState: false,
                showTaskbarIcon: false,
                autoShow: true,
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
