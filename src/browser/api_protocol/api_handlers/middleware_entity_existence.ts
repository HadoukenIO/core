
import RequestHandler from '../transport_strategy/base_handler';
import { appByUuid, windowExists, getBrowserViewByIdentity, viewExists } from '../../core_state';
import { applicationApiMap } from './application.js';
import { MessagePackage } from '../transport_strategy/api_transport_base';
import { windowApiMap } from './window.js';
import { browserViewActionMap } from './browser_view';
import { webContentsApiMap } from './webcontents';

const apisToIgnore = new Set([
    // Application
    'create-application',
    'create-child-window',
    'is-application-running',
    'register-window-name',
    //TODO: we do not check run for .NET, the adapter will create an application then run it without waiting for the ack.
    'run-application',
    // Window
    'window-exists',
    'entity-exists',
    'window-is-notification-type',
    //BrowserView
    'create-browser-view'
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

    } else if (webContentsApiMap.hasOwnProperty(action)) {
         // Window API

        const wndExists = windowExists(uuid, name);
        const browserViewExists = viewExists(uuid, name);

        if (!wndExists && !browserViewExists) {
            return nack('Could not locate the requested contents');
        }
    } else if (windowApiMap.hasOwnProperty(action)) {
        // Window API

        const wndExists = windowExists(uuid, name);

        if (!wndExists) {
            return nack('Could not locate the requested window');
        }
    } else if (browserViewActionMap.hasOwnProperty(action)) {
        const exists = getBrowserViewByIdentity({uuid, name});
        if (!exists) {
            return nack('Could not locate the requested view');
        }
    }

    next();
}

export function registerMiddleware(requestHandler: RequestHandler<MessagePackage>): void {
    requestHandler.addPreProcessor(verifyEntityExistence);
}
