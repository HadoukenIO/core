/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/

import {MessagePackage} from '../transport_strategy/api_transport_base';
const coreState = require('../../core_state');
const electronApp = require('electron').app;
const system = require('../../api/system').System;
const apiProtocolBase = require('./api_protocol_base');
const rvmBus = require('../../rvm/rvm_message_bus').rvmMessageBus;  // retrieve permission setting from registry
import { GetDesktopOwnerSettings } from '../../rvm/rvm_message_bus';

const configUrlPermissionsMap : { [url: string]: any } = {};  // cached configUrl => permission object, retrieved from RVM
                                            // if a configUrl is mapped to a boolean true, request to RVM is successful
                                            // did not return permissions
const CONFIG_URL_WILDCARD = 'default';  // can set as default for all applications.  Checked ONLY IF permissions
                                  // for a particular URL is not defined
const ENABLE_DESKTOP_OWNER_SETTINGS: string = 'enable-desktop-owner-settings'; // RVM adds this to runtime->arguments
                                                        // if settings are detected in Registry
const DESKTOP_OWNER_SETTINGS_TIMEOUT: string = 'desktop-owner-settings-timeout'; // timeout for requesting from RVM in ms
let desktopOwnerSettingsTimeout: number = 2000;  // in ms
let desktopOwnerSettingEnabled: boolean = false;

enum POLICY_AUTH_RESULT {
    Allowed = 1,
    Denied,
    NotDefined // config URL not found in policy.  Check window options instead
}

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
        electronApp.vlog(1, `checkWindowPermissions level ${level}`);
        if (level === apiPath.length && typeof lastValue === 'boolean') {
            permitted = !!lastValue;
        }
    }
    return permitted;
}

/**
 * Authorize the action for a window sending the action based on window options
 *
 * @param windowOpts window options
 * @param parentUuid uuid of parent app
 * @param action in message
 * @returns {Promise<boolean>} resolves true if authorized
 */
function authorizeActionFromWindowOptions(windowOpts: any, parentUuid: string, action: string): boolean {
    electronApp.vlog(1, `authorizeAction ${action} for ${windowOpts.uuid} ${windowOpts.name}`);
    const apiPath: [string] = actionAPINameMap[action];
    let allowed: boolean = true;
    if (actionAPINameMap.hasOwnProperty(action)) {  // if listed in the map, has to be checked
        const isChildWindow = windowOpts.uuid !== windowOpts.name;
        allowed = isChildWindow;
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
                allowed = authorizeActionFromWindowOptions(parentOpts, parentObject.parentUuid, action);
                return;
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
 * Authorize the action for a window sending the action based on policies supplied by RVM
 *
 * @param windowOpts
 * @param action
 * @returns {Promise<boolean>}
 * @returns {Promise<string>} resolves with POLICY_AUTH_RESULT
 */
function authorizeActionFromPolicy(windowOpts: any, action: string): Promise<POLICY_AUTH_RESULT> {
    electronApp.vlog(1, `authorizeActionFromPolicy ${action} for ${windowOpts.uuid} ${windowOpts.name}`);
    const apiPath: [string] = actionAPINameMap[action];
    return new Promise((resolve, reject) => {
        if (desktopOwnerSettingEnabled === true) {
            const configUrl = coreState.getConfigUrlByUuid(windowOpts.uuid);
            if (configUrl) {
                electronApp.vlog(1, `authorizeActionFromPolicy checking with config url ${configUrl}`);
                requestAppPermissions(configUrl).then((resultByUrl: any) => {
                    if (resultByUrl.permissions) {
                        resolve(checkWindowPermissions(apiPath, resultByUrl.permissions, false) ?
                            POLICY_AUTH_RESULT.Allowed : POLICY_AUTH_RESULT.Denied);
                    } else {  // check default permissions defined with CONFIG_URL_WILDCARD
                        electronApp.vlog(1, `authorizeActionFromPolicy checking with RVM ${CONFIG_URL_WILDCARD}`);
                        requestAppPermissions(CONFIG_URL_WILDCARD).then((resultByDefault: any) => {
                            if (resultByDefault.permissions) {
                                resolve(checkWindowPermissions(apiPath, resultByDefault.permissions, false) ? POLICY_AUTH_RESULT.Allowed :
                                    POLICY_AUTH_RESULT.Denied);
                            } else {
                                resolve(POLICY_AUTH_RESULT.NotDefined);  // config URL not defined in policy
                            }
                        }).catch((error: any) => {
                            electronApp.vlog(1, `authorizeActionFromPolicy query for permissions failed ${CONFIG_URL_WILDCARD}`);
                            reject(false);
                        });
                    }
                }).catch((error: any) => {
                    electronApp.vlog(1, `authorizeActionFromPolicy query for permissions failed ${configUrl}`);
                    reject(false);
                });
            } else {
                electronApp.vlog(1, 'authorizeActionFromPolicy configUrl not defined');
                resolve(POLICY_AUTH_RESULT.NotDefined);  // config URL not defined in policy
            }
        } else {
            electronApp.vlog(1, `authorizeActionFromPolicy desktopOwnerSettingEnabled ${desktopOwnerSettingEnabled}`);
            resolve(POLICY_AUTH_RESULT.NotDefined);  // config URL not defined in policy
        }
    });
}

/**
 * Message pre-processor
 *
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
                authorizeActionFromPolicy(coreState.getWindowOptionsById(originWindow.id), action).then((result: POLICY_AUTH_RESULT) => {
                    if (result === POLICY_AUTH_RESULT.Allowed) {
                        next();
                    } else if (result === POLICY_AUTH_RESULT.Denied) {
                        electronApp.vlog(1, `apiPolicyPreProcessor rejecting from policy ${action} from ${identity.uuid} ${identity.name}`);
                        nack('Rejected, action is not authorized');
                    } else {
                        if (authorizeActionFromWindowOptions(coreState.getWindowOptionsById(originWindow.id), parentUuid, action)) {
                            next();
                        } else {
                            electronApp.vlog(1, `apiPolicyPreProcessor rejecting from win opts ${action} from ${identity.uuid} ` +
                                                        `${identity.name}`);
                            nack('Rejected, action is not authorized');
                        }
                    }
                }).catch(() => {
                    electronApp.vlog(1, `apiPolicyPreProcessor rejecting from error ${action} from ${identity.uuid} ${identity.name}`);
                    nack('Rejected, action is not authorized');
                });
            } else {
                electronApp.vlog(1, `apiPolicyPreProcessor missing origin window ${action} from ${identity.uuid} ${identity.name}`);
                next();
            }
        } else {
            next();
        }
    } else {
        next();
    }
}

/**
 * Get application permissions from cache or RVM
 *
 * @param configUrl url of startup manifest
 * @returns {Promise<any>} resolves with permissions defined in application assets;
 *                                  reject if request to RVM failed
 */
function requestAppPermissions(configUrl: string): Promise<any> {
    electronApp.vlog(1, `requestAppPermissions ${configUrl} `);
    return new Promise((resolve, reject) => {
        if (configUrlPermissionsMap[configUrl]) {
            electronApp.vlog(1, `requestAppPermissions cached ${configUrl} `);
            resolve(configUrlPermissionsMap[configUrl]);
        } else {
            const msg: GetDesktopOwnerSettings =  {
                topic: 'application',
                action: 'get-desktop-owner-settings',
                sourceUrl: configUrl
            };

            rvmBus.publish(msg, (rvmResponse: any) => {
                electronApp.vlog(1, `requestAppPermissions from RVM ${JSON.stringify(rvmResponse)} `);
                if (rvmResponse.payload && rvmResponse.payload.success === true &&
                    rvmResponse.payload.payload) {
                    if (rvmResponse.payload.payload.permissions) {
                        configUrlPermissionsMap[configUrl] = {permissions: rvmResponse.payload.payload.permissions};
                                                                // cache it
                    } else {
                        // if permissions is missing, startup URL is not defined in desktop-owner-settings.  Not an error
                        configUrlPermissionsMap[configUrl] = {};
                    }
                    resolve(configUrlPermissionsMap[configUrl]);
                } else {
                    system.log('error', `requestAppPermissions from RVM failed ${JSON.stringify(rvmResponse)}`);
                    reject(rvmResponse);  // false indicates request to RVM failed
                }
            }, desktopOwnerSettingsTimeout / 1000);
        }
    });
}

if (coreState.argo['enable-strict-api-permissions']) {
    electronApp.log('info', `Installing API policy PreProcessor ${JSON.stringify(coreState.getStartManifest())}`);
    apiProtocolBase.getDefaultRequestHandler().addPreProcessor(apiPolicyPreProcessor);
    desktopOwnerSettingEnabled = !!coreState.argo[ENABLE_DESKTOP_OWNER_SETTINGS];
    electronApp.vlog(1, `desktopOwnerSettingEnabled ${desktopOwnerSettingEnabled}`);
    if (desktopOwnerSettingEnabled === true && coreState.argo[DESKTOP_OWNER_SETTINGS_TIMEOUT]) {
        desktopOwnerSettingsTimeout = Number(coreState.argo[DESKTOP_OWNER_SETTINGS_TIMEOUT]);
        electronApp.vlog(1, `desktopOwnerSettingsTimeout ${desktopOwnerSettingsTimeout}`);
    }
}

export {apiPolicyPreProcessor};
