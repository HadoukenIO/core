
import { MessagePackage } from '../transport_strategy/api_transport_base';
const coreState = require('../../core_state');
import { getDefaultRequestHandler, actionMap } from './api_protocol_base';
import {ApiPath, ApiPolicyDelegate, Endpoint} from '../shapes';
import {OpenFinWindow} from '../../../shapes';
const rvmBus = require('../../rvm/rvm_message_bus').rvmMessageBus;  // retrieve permission setting from registry
import { GetDesktopOwnerSettings } from '../../rvm/rvm_message_bus';
import { writeToLog } from '../../log';
import {app as electronApp} from 'electron';

const configUrlPermissionsMap : { [url: string]: any } = {};  // cached configUrl => permission object, retrieved from RVM
                                            // if a configUrl is mapped to a boolean true, request to RVM is successful
                                            // did not return permissions
const CONFIG_URL_WILDCARD = 'default';  // can set as default for all applications.  Checked ONLY IF permissions
                                  // for a particular URL is not defined
const DESKTOP_OWNER_SETTINGS_TIMEOUT: string = 'desktop-owner-settings-timeout'; // timeout for requesting from RVM in ms
let desktopOwnerSettingsTimeout: number = 2000;  // in ms
let applicationSettingsEnabled: boolean = false;  // true, if applicationSettings is defined in desktop owner settings

type ApiPolicy = {
    // for backwards compatible, policyName can be a single config URL
    [policyName: string]: {
        urls?: [string];  // support wildcard patterns. If missing, policyName should be a single URL (no wildcard)
        permissions: any;
    }
};
let apiPolicies: ApiPolicy;  // policies for all APIs

enum POLICY_AUTH_RESULT {
    Allowed = 1,
    Denied,
    NotDefined // config URL not found in policy.  Check window options instead
}

const delegateMap: Map<ApiPath, ApiPolicyDelegate> = new Map();

function getApiPath(action: string) : string {
    return actionMap[action] ? actionMap[action].apiPath : '';
}

function getApiDefaultPermission(action: string) : boolean {
    if (actionMap[action]) {
        return actionMap[action].defaultPermission === undefined || actionMap[action].defaultPermission;
    } else {
        return true;
    }
}

function searchPolicyByConfigUrl(url: string): any {
    writeToLog(1, `searchPolicyByConfigUrl ${url}`, true);
    if (apiPolicies) {
        for (const policyName of Object.keys(apiPolicies)) {
            const policy = apiPolicies[policyName];
            if (url === CONFIG_URL_WILDCARD && url === policyName) {
                return policy;
            } else if (Array.isArray(policy.urls) &&
                    electronApp.matchesURL(url, policy.urls)) {
                writeToLog(1, `searchPolicyByConfigUrl matched by policy name ${policyName}`, true);
                return policy;
            } else if (electronApp.matchesURL(url,  [policyName])) {
                writeToLog(1, `searchPolicyByConfigUrl matched by policy name ${policyName}`, true);
                return policy;
            }
        }
    } else {
        writeToLog('error', 'searchPolicyByConfigUrl: missing API policies');
    }
}

/**
 * Checks if action is allowed based on permission definitions
 *
 * Example of permission definitions
 *
 *  permissions": {
 *      "System": { "launchExternalProcess": true },
 *      "System": { "Clipboard" : { "availableFormats": true } },
 *      "Window": { "getNativeId": true },
 *                { "readRegistryValue":
 *                      { "enabled": true,
 *                        "registryKeys": [ "HKEY_CURRENT_USER\\Software\\OpenFin\\RVM", "HKEY_CURRENT_USER\\Software\\Oracle" ]
 *                      }
 *                 }
 *  }
 *
 *
 * @param apiPath array of strings such as  ['Window', 'getNativeId']
 * @param permissionDefinitions permissions options
 * @param payload API message payload
 * @param defaultPermission default permission for the API
 * @returns {boolean} true means permitted
 */
function checkPermissionDefinitions(apiPath: ApiPath, permissionDefinitions: any, payload: any, defaultPermission: boolean) : boolean {
    let permitted: boolean = defaultPermission;
    if (permissionDefinitions) {
        const parts: string[] = apiPath.split('.');
        const levels: number = parts.length;
        let level: number;
        let lastValue: any = permissionDefinitions;
        for (level = 0; level < levels; level += 1) {
            const part: string = parts[level];
            if (lastValue.hasOwnProperty(part)) {
                lastValue = lastValue[part];
            } else {
                break;
            }
        }
        writeToLog(1, `checkPermissionDefinitions level ${level} ${apiPath}`, true);
        if (level === levels) {
            if (typeof lastValue === 'boolean') {
                // simple true or false
                permitted = lastValue;
            } else if (delegateMap.has(apiPath)) {
                writeToLog(1, `checkPermissionDefinitions calling delegate ${apiPath}`, true);
                permitted = delegateMap.get(apiPath).checkPermissions({apiPath,
                                                    permissionSettings: lastValue, payload});
            } else {
                writeToLog(1, `checkPermissionDefinitions api path not defined ${apiPath}`, true);
            }
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
function authorizeActionFromWindowOptions(windowOpts: any, parentUuid: string, action: string, payload: any): boolean {
    windowOpts = windowOpts || {}; // todo Is this really needed?

    const { uuid, name, permissions } = windowOpts;
    const logSuffix = `'${action}' for ${uuid} ${name}`;
    writeToLog(1, `authorizeAction ${logSuffix}`, true);

    const apiPath: ApiPath = getApiPath(action);
    let allowed: boolean = getApiDefaultPermission(action);

    if (apiPath) {  // if listed in the map, has to be checked
        if (permissions) {
            allowed = checkPermissionDefinitions(apiPath, permissions, payload, allowed);
        }
    }

    if (allowed && parentUuid) {  // check parent if there is one
        const parentObject = coreState.getAppByUuid(parentUuid);
        if (parentObject) {
            const parentOpts = parentObject._options;
            if (parentOpts) {
                writeToLog(1, `authorizeAction checks parent ${parentUuid} ${logSuffix}`, true);
                allowed = authorizeActionFromWindowOptions(parentOpts, parentObject.parentUuid, action, payload);
            } else {
                writeToLog(1, `authorizeAction missing parent options ${parentUuid} ${logSuffix}`, true);
            }
        } else {
            writeToLog(1, `authorizeAction missing parent ${parentUuid} ${logSuffix}`, true);
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
function authorizeActionFromPolicy(windowOpts: any, action: string, payload: any): Promise<POLICY_AUTH_RESULT> {
    const { uuid, name } = windowOpts;
    const logSuffix = `'${action}' for ${uuid} ${name}`;
    writeToLog(1, `authorizeActionFromPolicy ${logSuffix}`, true);

    const apiPath: ApiPath = getApiPath(action);
    return new Promise((resolve, reject) => {
        if (applicationSettingsEnabled === true) {
            const configUrl = coreState.getConfigUrlByUuid(uuid);
            const defaultPermission: boolean = getApiDefaultPermission(action);
            if (configUrl) {
                writeToLog(1, `authorizeActionFromPolicy checking with config url ${configUrl} ${logSuffix}`, true);
                requestAppPermissions(configUrl).then((resultByUrl: any) => {
                    if (resultByUrl.permissions) {
                        resolve(checkPermissionDefinitions(apiPath, resultByUrl.permissions, payload, defaultPermission) ?
                            POLICY_AUTH_RESULT.Allowed : POLICY_AUTH_RESULT.Denied);
                    } else {  // check default permissions defined with CONFIG_URL_WILDCARD
                        writeToLog(1, `authorizeActionFromPolicy checking with RVM ${CONFIG_URL_WILDCARD} ${logSuffix}`, true);
                        requestAppPermissions(CONFIG_URL_WILDCARD).then((resultByDefault: any) => {
                            if (resultByDefault.permissions) {
                                resolve(checkPermissionDefinitions(apiPath, resultByDefault.permissions, payload, defaultPermission) ?
                                    POLICY_AUTH_RESULT.Allowed :
                                    POLICY_AUTH_RESULT.Denied);
                            } else {
                                resolve(POLICY_AUTH_RESULT.NotDefined);  // config URL not defined in policy
                            }
                        }).catch((error: any) => {
                            writeToLog(1,
                                `authorizeActionFromPolicy query for permissions failed ${CONFIG_URL_WILDCARD} ${logSuffix} ${error}`,
                                true);
                            reject(false);
                        });
                    }
                }).catch((error: any) => {
                    writeToLog(1, `authorizeActionFromPolicy query for permissions failed ${configUrl} ${logSuffix} ${error}`, true);
                    reject(false);
                });
            } else {
                writeToLog(1, `authorizeActionFromPolicy configUrl not defined ${logSuffix}`, true);
                resolve(POLICY_AUTH_RESULT.NotDefined);  // config URL not defined in policy
            }
        } else {
            writeToLog(1, `authorizeActionFromPolicy applicationSettingsEnabled ${applicationSettingsEnabled} ${logSuffix}`, true);
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
    const { identity, data, nack } = msg;
    const {action, payload} = data;
    const apiPath: ApiPath = getApiPath(action);

    if (typeof identity === 'object' && apiPath) {  // only check if included in the map
        const { uuid, name } = identity;
        const logSuffix = `'${action}' from ${uuid} ${name}`;

        writeToLog(1, `apiPolicyPreProcessor ${logSuffix}`, true);

        let originWindow : OpenFinWindow = coreState.getWindowByUuidName(uuid, name);
        if (!originWindow && identity.entityType === 'iframe') {
            const info = coreState.getInfoByUuidFrame(identity);
            if (info && info.parent) {
                originWindow = coreState.getWindowByUuidName(info.parent.uuid, info.parent.name);
            }
        }
        if (originWindow) {
            const appObject = coreState.getAppByUuid(uuid);
            // parentUuid for child windows is uuid of the app
            const parentUuid = uuid === name ? appObject.parentUuid : uuid;
            authorizeActionFromPolicy(coreState.getWindowOptionsById(originWindow.id), action, payload).
              then((result: POLICY_AUTH_RESULT) => {
                if (result === POLICY_AUTH_RESULT.Denied) {
                    writeToLog(1, `apiPolicyPreProcessor rejecting from policy ${logSuffix}`, true);
                    nack('Rejected, action is not authorized');
                } else {
                    if (result === POLICY_AUTH_RESULT.Allowed) {
                        writeToLog(1, `apiPolicyPreProcessor allowed from policy, still need to check window options ${logSuffix}`, true);
                    }
                    if (authorizeActionFromWindowOptions(coreState.getWindowOptionsById(originWindow.id), parentUuid, action, payload)) {
                        next();
                    } else {
                        writeToLog(1, `apiPolicyPreProcessor rejecting from win opts ${logSuffix}`, true);
                        nack('Rejected, action is not authorized');
                    }
                }
            }).catch(() => {
                writeToLog(1, `apiPolicyPreProcessor rejecting from error ${logSuffix}`, true);
                nack('Rejected, action is not authorized');
            });
        } else {
            writeToLog(1, `apiPolicyPreProcessor missing origin window ${logSuffix}`, true);
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
    writeToLog(1, `requestAppPermissions ${configUrl}`, true);

    return new Promise((resolve, reject) => {
        if (configUrlPermissionsMap[configUrl]) {
            writeToLog(1, 'requestAppPermissions cached', true);
            resolve(configUrlPermissionsMap[configUrl]);
        } else {
            const policy = searchPolicyByConfigUrl(configUrl);
            if (policy && policy.permissions) {
                configUrlPermissionsMap[configUrl] = {permissions: policy.permissions};
            } else {
                configUrlPermissionsMap[configUrl] = {};
            }
            resolve(configUrlPermissionsMap[configUrl]);
        }
    });
}

function registerDelegate(apiPath: ApiPath, delegate: ApiPolicyDelegate) {
    writeToLog(1, `register API policy delegate ${apiPath}`, true);
    delegateMap.set(apiPath, delegate);
}

// Example response from RVM
// { "broadcast": false, "messageId": "735267b6-0a12-4524-bf12-00ea556d74aa", "payload":
// { "action": "get-desktop-owner-settings", "applicationSettingsExists": false,
//  "desktopOwnerFileExists": true, "payload": { }, "success": true }, "topic": "application" }
function retrieveAPIPolicyContent(): Promise<any> {
    writeToLog(1, 'retrieveAPIPolicyContent', true);
    return new Promise((resolve, reject) => {
        const msg: GetDesktopOwnerSettings = {
            topic: 'application',
            action: 'get-desktop-owner-settings',
            sourceUrl: 'https://openfin.co', // ignored by RVM if isGlobal is true
            isGlobal: true, // get all polices
            timeToLive: desktopOwnerSettingsTimeout / 1000
        };
        rvmBus.publish(msg, (rvmResponse: any) => {
            writeToLog('info', `requestAppPermissions from RVM ${JSON.stringify(rvmResponse)} `);
            if (rvmResponse.payload && rvmResponse.payload.success === true &&
                rvmResponse.payload.desktopOwnerFileExists === true &&
                rvmResponse.payload.payload) {
                  if (rvmResponse.payload.applicationSettingsExists === true) {
                    resolve(rvmResponse.payload.payload);
                  } else if (rvmResponse.payload.applicationSettingsExists === false) {
                    writeToLog('info', 'requestAppPermissions applicationSettings not set in desktop-owner-settings');
                    reject(rvmResponse);
                  } else if (Object.keys(rvmResponse.payload.payload).length > 0) {
                    // older versions of RVM do not set applicationSettingsExists
                    // accept only if it is not empty
                    resolve(rvmResponse.payload.payload);
                  } else {
                    writeToLog('info', 'requestAppPermissions applicationSettings not set in desktop-owner-settings');
                    reject(rvmResponse);
                  }
            } else {
                writeToLog('error', `requestAppPermissions from RVM failed ${JSON.stringify(rvmResponse)}`);
                reject(rvmResponse);  // false indicates request to RVM failed
            }
        }, false);
    });
}

writeToLog('info', `Installing API policy PreProcessor ${JSON.stringify(coreState.getStartManifest())}`);
getDefaultRequestHandler().addPreProcessor(apiPolicyPreProcessor);
if (coreState.argo[DESKTOP_OWNER_SETTINGS_TIMEOUT]) {
    desktopOwnerSettingsTimeout = Number(coreState.argo[DESKTOP_OWNER_SETTINGS_TIMEOUT]);
    writeToLog(1, `desktopOwnerSettingsTimeout ${desktopOwnerSettingsTimeout}`, true);
}
for (const key of Object.keys(actionMap)) {
    const endPoint: Endpoint = actionMap[key];
    if (endPoint.apiPolicyDelegate) {
        registerDelegate(endPoint.apiPath, endPoint.apiPolicyDelegate);
    }
}

retrieveAPIPolicyContent().then((content: ApiPolicy) => {
    apiPolicies = content;
    if (apiPolicies) {
        applicationSettingsEnabled = true;
        if (!apiPolicies.hasOwnProperty(CONFIG_URL_WILDCARD)) {
            apiPolicies[CONFIG_URL_WILDCARD] = { permissions: {} };
            writeToLog('info', 'default policy missing, setting to {} ');
        }
    } else {
        writeToLog(1, 'API policy not defined in desktopOwnerSettings', true);
    }
}).catch(e => {
    writeToLog(1, `Error retrieveAPIPolicies ${JSON.stringify(e)}`, true);
});

export {apiPolicyPreProcessor};

