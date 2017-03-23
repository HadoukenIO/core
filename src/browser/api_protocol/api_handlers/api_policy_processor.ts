/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/

import {MessagePackage} from '../transport_strategy/api_transport_base';
const coreState = require('../../core_state');
const electronApp = require('electron').app;
const apiProtocolBase = require('./api_protocol_base');

// actionAPINameMap has all APIs that must be authorized
// @todo this map should be set in group policy or some other way
const actionAPINameMap : { [index: string]: [string] } = {  // map of action sent by API -> API name.  if not listed here, always allowed
    'set-shortcuts' : ['Application', 'setShortcuts'],

    'clear-cache' : ['System', 'clearCache'],
    'get-config' : ['System', 'getConfig'],
    'get-device-id' : ['System', 'getDeviceId'],
    'get-environment-variable' : ['System', 'getEnvironmentVariable'],
    'get-host-specs' : ['System', 'getHostSpecs'],
    'view-log' : ['System', 'getLog'],
    'list-logs' : ['System', 'getLogList'],
//    'get-monitor-info' : ['System', 'getMonitorInfo'], called by js adapter during init so can't be disabled
    'get-mouse-position' : ['System', 'getMousePosition'],
    'get-remote-config' : ['System', 'getRemoteConfig'],
    'monitor-external-process' : ['System', 'monitorExternalProcess'],
    'register-external-connection' : ['System', 'registerExternalConnection'],
    'release-external-process' : ['System', 'releaseExternalProcess'],
    'set-clipboard' : ['System', 'setClipboard'],
    'launch-external-process' : ['System', 'launchExternalProcess'],
    'terminate-external-process' : ['System', 'terminateExternalProcess'],

    'clipboard-read-formats' : ['System', 'Clipboard', 'availableFormats'],
    'clipboard-read-html' : ['System', 'Clipboard', 'readHtml'],
    'clipboard-read-rtf' : ['System', 'Clipboard', 'readRtf'],
    'clipboard-read-text' : ['System', 'Clipboard', 'readText'],
    'clipboard-write' : ['System', 'Clipboard', 'write'],
    'clipboard-write-html' : ['System', 'Clipboard', 'writeHtml'],
    'clipboard-write-rtf' : ['System', 'Clipboard', 'writeRtf'],
    'clipboard-write-text' : ['System', 'Clipboard', 'writeText'],
    'delete-cache-request' : ['System', 'deleteCacheOnExit'],
//    'delete-cache-request' : ['System', 'deleteCacheOnRestart'],  deprecated
    'download-asset' : ['System', 'downloadAsset'],
    'exit-desktop' : ['System', 'exit'],
    'get-command-line-arguments' : ['System', 'getCommandLineArguments'],

    'execute-javascript-in-window' : ['Window', 'executeJavaScript'],
    'get-window-native-id' : ['Window', 'getNativeId'],
    'get-window-snapshot' : ['Window', 'getSnapshot']
};

/**
 * Checks if action needs to be listed in permissions option of the window
 *
 * Example of permissions
 *
 *  permissions": {
 *      "System": { "launchExternalProcess": true },
 *      "System": { "Clipboard" : { "availableFormats": true } },
 *      "Window": { "getNativeId": true }
 *   }
 *
 * For an app, if an API is not listed in its 'permissions' section, reject.
 *
 * For a child window, if an API is not listed in its 'permissions' section, check parent app.
 *
 * @param apiPath array of strings such as  ['Window', 'getNativeId']
 * @param windowPermissions permissions options for the window or app
 * @param isChildWindow true if being called for a child window
 * @returns {boolean} true if permitted
 */
function checkWindowPermissions(apiPath: [string], windowPermissions: any, isChildWindow: boolean) : boolean {
    let permitted: boolean = isChildWindow;  // defaults to true of child window
    if (!!windowPermissions) {
        let level: number = 0;
        let lastValue: any = windowPermissions;
        while (level < apiPath.length) {
            if (lastValue.hasOwnProperty(apiPath[level])) {
                lastValue = lastValue[apiPath[level]];
            } else {
                break;
            }
            level += 1;
        }
        electronApp.vlog(1, `checkWindowPermissions level ${level} value ${lastValue}`);
        if (level === apiPath.length && typeof lastValue === 'boolean') {
            permitted = !!lastValue;
        }
    }
    return permitted;
}

/**
 * Authorize the action for a window sending the action
 *
 * @param windowOpts window options
 * @param action in message
 * @returns {boolean} true if authorized
 */
function authorizeAction(windowOpts: any, parentUuid: string, action: string): boolean {
    electronApp.vlog(1, `authorizeAction ${action} for ${windowOpts.uuid} ${windowOpts.name}`);
    let allowed: boolean = true;
    if (actionAPINameMap.hasOwnProperty(action)) {  // if listed in the map, has to be checked
        const isChildWindow = windowOpts.uuid !== windowOpts.name;
        allowed = isChildWindow;
        const apiPath: [string] = actionAPINameMap[action];
        if (windowOpts && windowOpts.permissions) {
            allowed = checkWindowPermissions(apiPath, windowOpts.permissions, isChildWindow);
        }
    }
    if (allowed && parentUuid) {  // check parent if there is one
        const parentObject = coreState.getAppObjByUuid(parentUuid);
        if (parentObject) {
            const parentOpts = parentObject._options;
            if (parentOpts) {
                electronApp.vlog(1, `authorizeAction checks parent ${parentUuid}`);
                allowed = authorizeAction(parentOpts, parentObject.parentUuid, action);
            } else {
                electronApp.vlog(1, `authorizeAction missing parent options ${parentUuid}`);
            }
        } else {
            electronApp.vlog(1, `authorizeAction missing parent ${parentUuid}`);
        }
    }
    return allowed;
}

/**
 * Message pre-processor
 * @param msg message package to check
 * @param next function to call if ok to proceed
 */
function apiPolicyPreProcessor(msg: MessagePackage, next: () => void): void {
    const {identity, data, nack } = msg;
    const action = data && data.action;
    const hasIdentityObj = typeof (identity) === 'object';
    if (hasIdentityObj) {
        if (actionAPINameMap.hasOwnProperty(action)) {  // only check if included in the map
            electronApp.vlog(1, `apiPolicyPreProcessor ${action} from ${identity.uuid} ${identity.name}`);
            const originWindow = coreState.getWindowByUuidName(identity.uuid, identity.name);
            if (originWindow) {
                const appObject = coreState.getAppObjByUuid(identity.uuid);
                // parentUuid for child windows is uuid of the app
                const parentUuid = identity.uuid === identity.name ? appObject.parentUuid : identity.uuid;
                if (!authorizeAction(coreState.getWindowOptionsById(originWindow.id), parentUuid, action)) {
                    electronApp.vlog(1, `apiPolicyPreProcessor rejecting ${action} from ${identity.uuid} ${identity.name}`);
                    nack('Rejected, action is not authorized');
                    return;
                }
            }
        }
    }
    next();
}

if (electronApp.getCommandLineArguments().includes('--enable-strict-api-permissions')) {
    electronApp.log('info', 'Installing API policy PreProcessor');
    apiProtocolBase.getDefaultRequestHandler().addPreProcessor(apiPolicyPreProcessor);
}

export {apiPolicyPreProcessor};
