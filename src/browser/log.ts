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

/**
 * Parses log messages and uses Electron's APIs to log them to console
 */
export function writeToLog(level: string, message: any, debug?: boolean): any {
    let parsedMessage: string;

    // Parse log message
    try {

        if (typeof message === 'object') {
            if (message instanceof Error) {

                // Properly stringify error objects
                parsedMessage = JSON.stringify(errorToPOJO(message));
            } else {

                // Stringify plain objects
                parsedMessage = JSON.stringify(message);
            }
        } else {

            // Convert non-object messages to a string
            parsedMessage = message.toString();
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