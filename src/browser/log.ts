/*
Copyright 2017 OpenFin Inc.

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
import {app} from 'electron';
import {errorToPOJO} from '../common/errors';

export const logLevelMappings = new Map<any, any>([
    ['verbose', -1],
    ['info', 0],
    ['warning', 1],
    ['error', 2],
    ['fatal', 3],
    [-1, 'verbose'],
    [0, 'info'],
    [1, 'warning'],
    [2, 'error'],
    [3, 'fatal']
]);

/**
 * Parses log messages and uses Electron's APIs to log them to console
 */
export function writeToLog(level: any, message: any, debug?: boolean): any {
    const isObj = typeof message === 'object' && message !== null;
    let parsedMessage: string;

    // Parse log message
    try {

        if (isObj && message instanceof Error) {

            // Properly stringify error objects (i.e., stack and message properties only)
            parsedMessage = JSON.stringify(errorToPOJO(message));

        } else if (isObj && message.toString === Object.prototype.toString) {

            const className = message.constructor && message.constructor.name;

            // Don't use Object's toString which just returns "[object Object]"
            parsedMessage = JSON.stringify(message);

            // Prefix object name to stringification when known
            if (className !== 'Object' && className !== 'Function') {
                parsedMessage = `${className}: ${parsedMessage}`;
            }

        } else {

            // Use object's custom toString function OR convert primitive values to string
            parsedMessage = message + ''; // concatenation better than .toString(): handles null, undefined, NaN

        }

    } catch (err) {
        return err;
    }

    if (debug) {
        return app.vlog(level, parsedMessage);
    } else {
        return app.log(level, parsedMessage);
    }
}

/**
 * Sets runtime log level to 'verbose'
 */
export function setToVerbose(): void {
    const verboseLogLevel = logLevelMappings.get('verbose');
    app.setMinLogLevel(verboseLogLevel);
}
