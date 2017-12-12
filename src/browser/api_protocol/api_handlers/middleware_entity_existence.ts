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

import RequestHandler from '../transport_strategy/base_handler';
import { appByUuid, windowExists } from '../../core_state';
import { applicationApiMap } from './application.js';
import { MessagePackage } from '../transport_strategy/api_transport_base';
import { windowApiMap } from './window.js';

const apisToIgnore = new Set([
    // Application
    'create-application',
    'create-child-window',
    'is-application-running',
    //TODO: we do not check run for .NET, the adapter will create an application then run it without waiting for the ack.
    'run-application',
    // Window
    'window-exists',
    'window-is-notification-type'
]);

/**
 * Verifies that API is called on applications and windows that exist,
 * otherwise a proper error callback is executed.
 */
function verifyEntityExistence(msg: MessagePackage, next: () => void): void {
    const { data, nack } = msg;
    const payload = data && data.payload;
    const uuid = payload && payload.uuid;
    const name = payload && payload.name;
    const action = data && data.action;

    // When the user wraps non-existing application or window and tries to make an API
    // call on it, uuid in those cases is provided in the payload. So if no UUID found
    // just ignore checking further and continue
    if (!uuid || apisToIgnore.has(action)) {
        return next();
    }

    if (applicationApiMap.hasOwnProperty(action)) {
        // Application API

        const appExists = !!appByUuid(uuid);

        if (!appExists) {

            // Ignore cases where an app was created from a manifest and RVM is being asked to run it.
            // In those cases the app doesn't exist yet at the time 'run' is called on it, hence, no
            // need to error out this call in those cases.
            if (action === 'run-application' && payload.manifestUrl) {
                return next();
            }

            return nack('Could not locate the requested application');
        }

    } else if (windowApiMap.hasOwnProperty(action)) {
        // Window API

        const wndExists = windowExists(uuid, name);

        if (!wndExists) {
            return nack('Could not locate the requested window');
        }
    }

    next();
}

export function registerMiddleware(requestHandler: RequestHandler<MessagePackage>): void {
    requestHandler.addPreProcessor(verifyEntityExistence);
}
