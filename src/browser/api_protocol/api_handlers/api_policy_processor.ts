/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/

import { MessagePackage } from '../transport_strategy/api_transport_base';
const coreState = require('../../core_state');
const system = require('../../api/system').System;
import { getDefaultRequestHandler, actionMap } from './api_protocol_base';
import { ApiPath } from '../shapes';
const rvmBus = require('../../rvm/rvm_message_bus').rvmMessageBus;  // retrieve permission setting from registry
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

function getApiPath(action: string) : string {
    return actionMap[action] ? actionMap[action].apiPath : '';
}

function debugLog(method: string, message: any) : void {
    system.debugLog(1, `${method} ${message.toString().trim()}`);
}

/**
 * Checks if action needs to be listed in permissions option of the window
 *
 * Example of permissions
 *
 *  permissions": {
 *      "System": { "launchExternalProcess": true },
 *      "System": { "Clipboard" : { "availableFormats": true } },
 *      "Window": { "getNativeId": true }
 *  }
 *
 * For an app, if an API is not listed in its 'permissions' section, reject.
 *
 * For a child window, if an API is not listed in its 'permissions' section, check parent app.
 *
 * @param apiPath array of strings such as  ['Window', 'getNativeId']
 * @param windowPermissions permissions options for the window or app
 * @param isChildWindow true if being called for a child window
 * @returns {boolean} true means permitted
 */
function checkWindowPermissions(apiPath: ApiPath, windowPermissions: any, isChildWindow: boolean) : boolean {
    let permitted: boolean = isChildWindow;  // defaults to true of child window
    if (windowPermissions) {
        const parts: string[] = apiPath.split('.');
        const levels: number = parts.length;
        let level: number;
        let lastValue: any = windowPermissions;
        for (level = 0; level < levels; level += 1) {
            const part: string = parts[level];
            if (lastValue.hasOwnProperty(part)) {
                lastValue = lastValue[part];
            } else {
                break;
            }
        }
        debugLog('checkWindowPermissions', `level ${level}`);
        if (level === levels && typeof lastValue === 'boolean') {
            permitted = lastValue;
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
    vlog('');
    const apiPath: ApiPath = getApiPath(action);
    let allowed: boolean = true;

    if (apiPath) {  // if listed in the map, has to be checked
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
                vlog(`checks parent ${parentUuid}`);
                allowed = authorizeActionFromWindowOptions(parentOpts, parentObject.parentUuid, action);
                return;
            } else {
                vlog(`missing parent options ${parentUuid}`);
            }
        } else {
            vlog(`missing parent ${parentUuid}`);
        }
    }

    return allowed;

    function vlog(message: string) : void {
        debugLog('authorizeAction', `${message} '${action}' for ${windowOpts.uuid} ${windowOpts.name}`);
    }
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
    vlog('');
    const apiPath: ApiPath = getApiPath(action);
    return new Promise((resolve, reject) => {
        if (desktopOwnerSettingEnabled === true) {
            const configUrl = coreState.getConfigUrlByUuid(windowOpts.uuid);
            if (configUrl) {
                vlog(`checking with config url ${configUrl}`);
                requestAppPermissions(configUrl).then((resultByUrl: any) => {
                    if (resultByUrl.permissions) {
                        resolve(checkWindowPermissions(apiPath, resultByUrl.permissions, false) ?
                            POLICY_AUTH_RESULT.Allowed : POLICY_AUTH_RESULT.Denied);
                    } else {  // check default permissions defined with CONFIG_URL_WILDCARD
                        vlog(`checking with RVM ${CONFIG_URL_WILDCARD}`);
                        requestAppPermissions(CONFIG_URL_WILDCARD).then((resultByDefault: any) => {
                            if (resultByDefault.permissions) {
                                resolve(checkWindowPermissions(apiPath, resultByDefault.permissions, false) ? POLICY_AUTH_RESULT.Allowed :
                                    POLICY_AUTH_RESULT.Denied);
                            } else {
                                resolve(POLICY_AUTH_RESULT.NotDefined);  // config URL not defined in policy
                            }
                        }).catch((error: any) => {
                            vlog(`query for permissions failed ${CONFIG_URL_WILDCARD}`);
                            reject(false);
                        });
                    }
                }).catch((error: any) => {
                    vlog(`query for permissions failed ${configUrl}`);
                    reject(false);
                });
            } else {
                vlog('configUrl not defined');
                resolve(POLICY_AUTH_RESULT.NotDefined);  // config URL not defined in policy
            }
        } else {
            vlog(`desktopOwnerSettingEnabled ${desktopOwnerSettingEnabled}`);
            resolve(POLICY_AUTH_RESULT.NotDefined);  // config URL not defined in policy
        }
    });

    function vlog(message: string) : void {
        debugLog('authorizeActionFromPolicy', `${message} '${action}' for ${windowOpts.uuid} ${windowOpts.name}`);
    }
}

/**
 * Message pre-processor
 *
 * @param msg message package to check
 * @param next function to call if ok to proceed
 */
function apiPolicyPreProcessor(msg: MessagePackage, next: () => void): void {
    const { identity, data, nack } = msg;
    const action = data && data.action;
    const apiPath: ApiPath = getApiPath(action);

    if (typeof identity === 'object' && apiPath) {  // only check if included in the map
        vlog('');
        const originWindow = coreState.getWindowByUuidName(identity.uuid, identity.name);
        if (originWindow) {
            const appObject = coreState.getAppObjByUuid(identity.uuid);
            // parentUuid for child windows is uuid of the app
            const parentUuid = identity.uuid === identity.name ? appObject.parentUuid : identity.uuid;
            authorizeActionFromPolicy(coreState.getWindowOptionsById(originWindow.id), action).then((result: POLICY_AUTH_RESULT) => {
                if (result === POLICY_AUTH_RESULT.Allowed) {
                    next();
                } else if (result === POLICY_AUTH_RESULT.Denied) {
                    bail('rejecting from policy');
                } else if (authorizeActionFromWindowOptions(coreState.getWindowOptionsById(originWindow.id), parentUuid, action)) {
                    next();
                } else {
                    bail('rejecting from win opts');
                }
            }).catch(() => {
                bail('rejecting from error');
            });
        } else {
            vlog('missing origin window');
            next();
        }
    } else {
        next();
    }

    function vlog(message: string) : void {
        debugLog('apiPolicyPreProcessor', `${message} '${action}' from ${identity.uuid} ${identity.name}`);
    }

    function bail(message: string) : void {
        vlog(message);
        nack('Rejected, action is not authorized');
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
    vlog(configUrl);
    return new Promise((resolve, reject) => {
        if (configUrlPermissionsMap[configUrl]) {
            vlog(`cached ${configUrl} `);
            resolve(configUrlPermissionsMap[configUrl]);
        } else {
            rvmBus.send('application', { action: 'get-desktop-owner-settings', sourceUrl: configUrl }, (rvmResponse: any) => {
                vlog(`from RVM ${JSON.stringify(rvmResponse)}`);
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

    function vlog(message: string) : void {
        debugLog('requestAppPermissions', message);
    }
}

if (coreState.argo['enable-strict-api-permissions']) {
    system.log('info', `Installing API policy PreProcessor ${JSON.stringify(coreState.getStartManifest())}`);
    getDefaultRequestHandler().addPreProcessor(apiPolicyPreProcessor);
    desktopOwnerSettingEnabled = !!coreState.argo[ENABLE_DESKTOP_OWNER_SETTINGS];
    debugLog('desktopOwnerSettingEnabled', desktopOwnerSettingEnabled);
    if (desktopOwnerSettingEnabled === true && coreState.argo[DESKTOP_OWNER_SETTINGS_TIMEOUT]) {
        desktopOwnerSettingsTimeout = Number(coreState.argo[DESKTOP_OWNER_SETTINGS_TIMEOUT]);
        debugLog('desktopOwnerSettingsTimeout', desktopOwnerSettingsTimeout);
    }
}

export {apiPolicyPreProcessor};
