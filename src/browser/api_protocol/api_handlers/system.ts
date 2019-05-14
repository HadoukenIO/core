import { getMeshUuid } from '../../connection_manager';
import { registerActionMap } from './api_protocol_base.js';
import { System } from '../../api/system.js';
import * as log from '../../log';
import {
    Acker,
    APIHandlerMap,
    APIMessage,
    APIPayloadAck,
    Cookie,
    Entity,
    FileStatInfo,
    Identity,
    Nacker,
    NackerError,
    NackerErrorString,
    PreloadScript,
    StartManifest
} from '../../../shapes';
import { DownloadResult } from '../../../browser/preload_scripts';

const successAck: APIPayloadAck = { success: true };

const ReadRegistryValuePolicyDelegate = {
    //checkPermissions(ApiPolicyDelegateArgs): boolean;
    checkPermissions: (args: any): boolean => {
        // permissionSettings has following format
        // { "enabled": true, "registryKeys": [ "HKEY_CURRENT_USER\\Software\\OpenFin\\RVM" ] }
        let permitted = false; // default to false
        if (args.payload && args.permissionSettings && args.permissionSettings.enabled === true) {
            if (Array.isArray(args.permissionSettings.registryKeys)) {
                let fullPath = args.payload.rootKey;
                if (args.payload.subkey) {
                    fullPath = fullPath.concat('\\' + args.payload.subkey);
                }
                if (args.payload.value) {
                    fullPath = fullPath.concat('\\' + args.payload.value);
                }
                permitted = args.permissionSettings.registryKeys.some((specKey: string) => fullPath.startsWith(specKey));
            }
        }
        log.writeToLog(1, `ReadRegistryValueDelegate returning ${permitted}`, true);
        return permitted;
    }
};

export const SystemApiMap: APIHandlerMap = {
    'clear-cache': { apiFunc: clearCache, apiPath: '.clearCache' },
    'create-proxy-socket': createProxySocket,
    'authenticate-proxy-socket': authenticateProxySocket,
    'convert-options': convertOptions,
    'delete-cache-request': { apiFunc: deleteCacheRequest, apiPath: '.deleteCacheOnExit' },
    'download-asset': { apiFunc: downloadAsset, apiPath: '.downloadAsset' },
    'download-preload-scripts': { apiFunc: downloadPreloadScripts, apiPath: '.downloadPreloadScripts'},
    'download-runtime': { apiFunc: downloadRuntime, apiPath: '.downloadRuntime' },
    'exit-desktop': { apiFunc: exitDesktop, apiPath: '.exit' },
    'flush-cookie-store': { apiFunc: flushCookieStore, apiPath: '.flushCookieStore' },
    'generate-guid': generateGuid,
    'get-all-applications': getAllApplications,
    'get-all-external-applications': getAllExternalApplications,
    'get-all-external-windows': getAllExternalWindows,
    'get-all-windows': getAllWindows,
    'get-app-asset-info': getAppAssetInfo,
    'get-command-line-arguments': { apiFunc: getCommandLineArguments, apiPath: '.getCommandLineArguments' },
    'get-config': { apiFunc: getConfig, apiPath: '.getConfig' },
    'get-crash-reporter-state': getCrashReporterState,
    'get-device-id': { apiFunc: getDeviceId, apiPath: '.getDeviceId' },
    'get-device-user-id': { apiFunc: getDeviceUserId, apiPath: '.getDeviceUserId' },
    'get-entity-info': getEntityInfo,
    'get-environment-variable': { apiFunc: getEnvironmentVariable, apiPath: '.getEnvironmentVariable' },
    'get-focused-window': getFocusedWindow,
    'get-focused-external-window': getFocusedExternalWindow,
    'get-host-specs': { apiFunc: getHostSpecs, apiPath: '.getHostSpecs' },
    'get-machine-id': { apiFunc: getMachineId, apiPath: '.getMachineId' },
    'get-min-log-level': getMinLogLevel,
    'get-monitor-info': { apiFunc: getMonitorInfo, apiPath: '.getMonitorInfo' },
    'get-mouse-position': { apiFunc: getMousePosition, apiPath: '.getMousePosition' },
    'get-nearest-display-root': getNearestDisplayRoot,
    'get-proxy-settings': getProxySettings,
    'get-remote-config': { apiFunc: getRemoteConfig, apiPath: '.getRemoteConfig' },
    'get-runtime-info': getRuntimeInfo,
    'get-rvm-info': getRvmInfo,
    'get-service-configuration': getServiceConfiguration,
    'get-preload-scripts': getPreloadScripts,
    'get-version': getVersion,
    'launch-external-process': { apiFunc: launchExternalProcess, apiPath: '.launchExternalProcess' },
    'list-logs': { apiFunc: listLogs, apiPath: '.getLogList' },
    'monitor-external-process': { apiFunc: monitorExternalProcess, apiPath: '.monitorExternalProcess' },
    'open-url-with-browser': openUrlWithBrowser,
    'process-snapshot': { apiFunc: processSnapshot, apiPath: '.getProcessList' },
    'raise-event': raiseEvent,
    'raise-many-events': raiseManyEvents,
    'read-registry-value': {
        apiFunc: readRegistryValue,
        apiPath: '.readRegistryValue',
        apiPolicyDelegate: ReadRegistryValuePolicyDelegate
    },
    'release-external-process': { apiFunc: releaseExternalProcess, apiPath: '.releaseExternalProcess' },
    'resolve-uuid': resolveUuid,
    'resource-fetch-authenticate': { apiFunc: authenticateResourceFetch },
    //'set-clipboard': setClipboard, -> moved to clipboard.ts
    'get-cookies': { apiFunc: getCookies, apiPath: '.getCookies' },
    'set-cookie': setCookie,
    'set-min-log-level': setMinLogLevel,
    'show-developer-tools': showDeveloperTools,
    'start-crash-reporter': startCrashReporter,
    'terminate-external-process': { apiFunc: terminateExternalProcess, apiPath: '.terminateExternalProcess' },
    'update-proxy': updateProxy,
    'view-log': { apiFunc: viewLog, apiPath: '.getLog' },
    'write-to-log': writeToLog
};

export function init(): void {
    registerActionMap(SystemApiMap, 'System');
}

function didFail(e: any): boolean {
    return e !== undefined && e.constructor === Error;
}

const dosURL = 'https://openfin.co/documentation/desktop-owner-settings/';

async function getServiceConfiguration(identity: Identity, message: APIMessage) {
    const { name } = message.payload;
    const response = await System.getServiceConfiguration();

    if (didFail(response)) {
        throw response;
    }

    if (!Array.isArray(response)) {
        throw new Error(`Settings in desktop owner settings are not configured correctly, please see
         ${dosURL} for configuration information`);
    }

    const config = response.find(service => service.name === name);

    if (!config) {
        throw new Error(`Service configuration for ${name} not available`);
    }

    return config;
}

function readRegistryValue(identity: Identity, message: APIMessage, ack: Acker): void {
    const dataAck = Object.assign({}, successAck);
    const { payload: { rootKey, subkey, value } } = message;
    dataAck.data = System.readRegistryValue(rootKey, subkey, value);
    ack(dataAck);
}

function setMinLogLevel(identity: Identity, message: APIMessage, ack: Acker, nack: Nacker): void {
    const { payload: { level } } = message;
    const response = System.setMinLogLevel(level);

    if (didFail(response)) {
        nack(response);
    } else {
        ack(successAck);
    }
}

function getMinLogLevel(identity: Identity, message: APIMessage, ack: Acker, nack: Nacker): void {
    const response = System.getMinLogLevel();

    if (didFail(response)) {
        nack(response);
    } else {
        const dataAck = Object.assign({}, successAck);
        dataAck.data = response;
        ack(dataAck);
    }
}

function startCrashReporter(identity: Identity, message: APIMessage, ack: Acker): void {
    const dataAck = Object.assign({}, successAck);
    const { payload } = message;
    dataAck.data = System.startCrashReporter(identity, payload);
    ack(dataAck);
}

function getCrashReporterState(identity: Identity, message: APIMessage, ack: Acker): void {
    const dataAck = Object.assign({}, successAck);
    dataAck.data = System.getCrashReporterState();
    ack(dataAck);
}

function getAppAssetInfo(identity: Identity, message: APIMessage, ack: Acker, nack: Nacker): void {
    const options = message.payload;

    System.getAppAssetInfo(identity, options, (data: any) => {
        const dataAck = Object.assign({}, successAck);
        delete data.path; // remove path due to security concern
        dataAck.data = data;
        ack(dataAck);
    }, nack);
}

function getDeviceUserId(identity: Identity, message: APIMessage, ack: Acker): void {
    const dataAck = Object.assign({}, successAck);
    dataAck.data = System.getDeviceUserId();
    ack(dataAck);
}

function raiseEvent(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload: { eventName, eventArgs } } = message;

    System.raiseEvent(eventName, eventArgs);
    ack(successAck);
}

function raiseManyEvents(identity: Identity, message: APIMessage): void {
    const { payload } = message;
    return System.raiseManyEvents(payload);
}

function convertOptions(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const dataAck = Object.assign({}, successAck);
    dataAck.data = System.convertOptions(payload);
    ack(dataAck);
}

function generateGuid(identity: Identity, message: APIMessage, ack: Acker): void {
    const dataAck = Object.assign({}, successAck);
    dataAck.data = System.generateGUID();
    ack(dataAck);
}

function showDeveloperTools(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload: { uuid, name } } = message;
    System.showDeveloperTools(uuid, name);
    ack(successAck);
}

function clearCache(identity: Identity, message: APIMessage, ack: Acker, nack: NackerError): void {
    const { payload } = message;
    System.clearCache(identity, payload, (err: Error) => {
        if (!err) {
            ack(successAck);
        } else {
            nack(err);
        }
    });
}

function createProxySocket(identity: Identity, message: APIMessage, ack: Acker, nack: Nacker): void {
    const { payload } = message;
    System.createProxySocket(payload, ack, nack);
}

function authenticateProxySocket(identity: Identity, message: APIMessage): void {
    const { payload } = message;
    System.authenticateProxySocket(payload);
}

function deleteCacheRequest(identity: Identity, message: APIMessage, ack: Acker, nack: Nacker): void {
    // deleteCacheOnRestart has been deprecated; redirects to deleteCacheOnExit
    System.deleteCacheOnExit(() => ack(successAck), nack);
}

function exitDesktop(identity: Identity, message: APIMessage, ack: Acker): void {
    ack(successAck);
    System.exit();
}

function getAllApplications(identity: Identity, message: APIMessage, ack: Acker): void {
    const { locals } = message;
    const dataAck = Object.assign({}, successAck);

    dataAck.data = System.getAllApplications();

    if (locals && locals.aggregate) {
        const { aggregate } = locals;
        dataAck.data = [...dataAck.data, ...aggregate];
    }

    ack(dataAck);
}

function getAllExternalApplications(identity: Identity, message: APIMessage, ack: Acker): void {
    const { locals } = message;
    const dataAck = Object.assign({}, successAck);

    dataAck.data = System.getAllExternalApplications();

    if (locals && locals.aggregate) {
        const { aggregate } = locals;
        const currentApplication = getMeshUuid();

        const filteredAggregate = aggregate.filter((result: Entity) => (result.uuid !== currentApplication));
        const filteredAggregateSet = [...new Set(filteredAggregate)];
        dataAck.data = [...dataAck.data, ...filteredAggregateSet];
    }

    ack(dataAck);
}

function getAllExternalWindows(identity: Identity, message: APIMessage, ack: Acker): void {
    const dataAck = Object.assign({}, successAck);
    dataAck.data = System.getAllExternalWindows();
    ack(dataAck);
}

function getAllWindows(identity: Identity, message: APIMessage, ack: Acker): void {
    const { locals } = message;
    const dataAck = Object.assign({}, successAck);

    dataAck.data = System.getAllWindows();

    if (locals && locals.aggregate) {
        const { aggregate } = locals;
        dataAck.data = [...dataAck.data, ...aggregate];
    }

    ack(dataAck);
}

function getCommandLineArguments(identity: Identity, message: APIMessage, ack: Acker): void {
    const dataAck = Object.assign({}, successAck);
    dataAck.data = System.getCommandLineArguments();
    ack(dataAck);
}

function getConfig(identity: Identity, message: APIMessage, ack: Acker): void {
    const dataAck = Object.assign({}, successAck);
    dataAck.data = (<StartManifest>System.getConfig()).data;
    ack(dataAck);
}

function getDeviceId(identity: Identity, message: APIMessage, ack: Acker): void {
    const dataAck = Object.assign({}, successAck);
    dataAck.data = System.getDeviceId();
    ack(dataAck);
}

function getEntityInfo(identity: Identity, message: APIMessage, ack: Acker, nack: Nacker): Identity {
    const { payload: { uuid, name } } = message;
    return System.getEntityInfo({ uuid, name });
}

function getFocusedWindow(identity: Identity, message: APIMessage, ack: Acker): void {
    const dataAck = Object.assign({}, successAck);
    const {locals} = message;
    if (locals && locals.aggregate) {
       const found = locals.aggregate.find((x: any) => !!x);
       if (found) {
           dataAck.data = found;
           return ack(dataAck);
       }
    }
    dataAck.data = System.getFocusedWindow();
    ack(dataAck);
}

function getFocusedExternalWindow(identity: Identity, message: APIMessage, ack: Acker): void {
    const dataAck = Object.assign({}, successAck);
    dataAck.data = System.getFocusedExternalWindow();
    ack(dataAck);
}

function getRemoteConfig(identity: Identity, message: APIMessage, ack: Acker, nack: Nacker): void {
    const { payload: { url } } = message;
    System.getRemoteConfig(url, (data: any) => {
        const dataAck = Object.assign({}, successAck);
        dataAck.data = data;
        ack(dataAck);
    }, nack);
}

function getEnvironmentVariable(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload: { environmentVariables } } = message;
    const dataAck = Object.assign({}, successAck);
    dataAck.data = System.getEnvironmentVariable(environmentVariables);
    ack(dataAck);
}

function viewLog(identity: Identity, message: APIMessage, ack: Acker, nack: NackerErrorString): void {
    const { payload: { name = '' } = {} } = message;
    System.getLog(name, (err: undefined | string, contents: string) => {
        if (!err) {
            const dataAck = Object.assign({}, successAck);
            dataAck.data = contents;
            ack(dataAck);
        } else {
            nack(err);
        }
    });
}

function listLogs(identity: Identity, message: APIMessage, ack: Acker, nack: NackerErrorString): void {
    System.getLogList((err: undefined | string, logList: FileStatInfo[]) => {
        if (!err) {
            const dataAck = Object.assign({}, successAck);
            dataAck.data = logList;
            ack(dataAck);
        } else {
            nack(err);
        }
    });
}

function getMonitorInfo(identity: Identity, message: APIMessage, ack: Acker): void {
    const dataAck = Object.assign({}, successAck);
    dataAck.data = System.getMonitorInfo();
    ack(dataAck);
}

function getMousePosition(identity: Identity, message: APIMessage, ack: Acker): void {
    const dataAck = Object.assign({}, successAck);
    dataAck.data = System.getMousePosition();
    ack(dataAck);
}

function processSnapshot(identity: Identity, message: APIMessage, ack: Acker): void {
    const { locals } = message;
    const dataAck = Object.assign({}, successAck);

    dataAck.data = System.getProcessList();

    if (locals && locals.aggregate) {
        const { aggregate } = locals;
        const aggregateSet = [...new Set(aggregate)];
        dataAck.data = [...dataAck.data, ...aggregateSet];
    }

    ack(dataAck);
}

function getProxySettings(identity: Identity, message: APIMessage, ack: Acker): void {
    const dataAck = Object.assign({}, successAck);
    dataAck.data = System.getProxySettings();
    ack(dataAck);
}

function getVersion(identity: Identity, message: APIMessage, ack: Acker): void {
    const dataAck = Object.assign({}, successAck);
    dataAck.data = System.getVersion();
    ack(dataAck);
}

function getRuntimeInfo(identity: Identity, message: APIMessage, ack: Acker, nack: Nacker): void {
    const dataAck = Object.assign({}, successAck);
    dataAck.data = System.getRuntimeInfo(identity);
    ack(dataAck);
}

function getRvmInfo(identity: Identity, message: APIMessage, ack: Acker, nack: Nacker): void {
    System.getRvmInfo(identity, (data: any) => {
        const dataAck = Object.assign({}, successAck);
        dataAck.data = data;
        ack(dataAck);
    }, nack);
}

function launchExternalProcess(identity: Identity, message: APIMessage, ack: Acker, nack: NackerError): void {
    const { payload } = message;
    System.launchExternalProcess(identity, payload, (err: undefined | Error, res: any) => {
        if (!err) {
            const dataAck = Object.assign({}, successAck);
            dataAck.data = res;
            ack(dataAck);
        } else {
            nack(err);
        }
    });
}

function writeToLog(identity: Identity, message: APIMessage, ack: Acker, nack: Nacker): void {
    const { payload = {} } = message;
    const { level: logLevel = '', message: logMessage = '' } = payload;
    const err = System.log(logLevel, logMessage);

    if (err) {
        nack(err);
    } else {
        ack(successAck);
    }
}

function openUrlWithBrowser(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload: { url } } = message;
    System.openUrlWithBrowser(url);
    ack(successAck);
}

function releaseExternalProcess(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload: { uuid } } = message;
    System.releaseExternalProcess(uuid);
    ack(successAck);
}

function monitorExternalProcess(identity: Identity, message: APIMessage, ack: Acker, nack: Nacker): void {
    const { payload } = message;
    System.monitorExternalProcess(identity, payload, (data: any) => {
        const dataAck = Object.assign({}, successAck);
        dataAck.data = data;
        ack(dataAck);
    }, nack);
}

function setCookie(identity: Identity, message: APIMessage, ack: Acker, nack: Nacker): void {
    const { payload } = message;
    System.setCookie(payload, () => ack(successAck), nack);
}

function getCookies(identity: Identity, message: APIMessage, ack: Acker, nack: Nacker): void {
    const { payload } = message;
    System.getCookies(payload, (data: Cookie[]) => {
        const dataAck = Object.assign({}, successAck);
        dataAck.data = data;
        ack(dataAck);
    }, nack);
}

function flushCookieStore(identity: Identity, message: APIMessage, ack: Acker, nack: Nacker): void {
    System.flushCookieStore(() => ack(successAck));
}

function terminateExternalProcess(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload = {} } = message;
    const { uuid, timeout, child } = payload;
    const dataAck = Object.assign({}, successAck);
    dataAck.data = System.terminateExternalProcess(uuid, timeout, child);
    ack(dataAck);
}

function updateProxy(identity: Identity, message: APIMessage, ack: Acker, nack: NackerErrorString): void {
    const { payload: { type, proxyAddress, proxyPort } } = message;
    const err = System.updateProxySettings(type, proxyAddress, proxyPort);

    if (!err) {
        ack(successAck);
    } else {
        nack(err);
    }
}

function getNearestDisplayRoot(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const dataAck = Object.assign({}, successAck);
    dataAck.data = System.getNearestDisplayRoot(payload);
    ack(dataAck);
}

function downloadAsset(identity: Identity, message: APIMessage, ack: Acker, nack: NackerError): void {
    const { payload } = message;
    System.downloadAsset(identity, payload, (err: void | Error) => {
        if (!err) {
            ack(successAck);
        } else {
            nack(err);
        }
    });
}

function downloadPreloadScripts(identity: Identity, message: APIMessage, ack: Acker, nack: Nacker): void {
    const { payload: { scripts } } = message;

    System.downloadPreloadScripts(identity, scripts)
        .then((downloadResults: DownloadResult[]) => {
            const dataAck = Object.assign({}, successAck);
            dataAck.data = downloadResults;
            ack(dataAck);
        })
        .catch(nack);
}

function downloadRuntime(identity: Identity, message: APIMessage, ack: Acker, nack: NackerError): void {
    const { payload } = message;

    System.downloadRuntime(identity, payload, (err: void | Error) => {
        if (err) {
            nack(err);
        } else {
            ack(successAck);
        }
    });
}

function getHostSpecs(identity: Identity, message: APIMessage, ack: Acker): void {
    const dataAck = Object.assign({}, successAck);
    dataAck.data = System.getHostSpecs();
    ack(dataAck);
}

function getMachineId(identity: Identity, message: APIMessage, ack: Acker): void {
    const dataAck = Object.assign({}, successAck);
    dataAck.data = System.getMachineId();
    ack(dataAck);
}

function resolveUuid(identity: Identity, message: APIMessage, ack: Acker, nack: NackerError): void {
    const { payload: { entityKey } } = message;
    System.resolveUuid(identity, entityKey, (err: null | Error, entity: Entity) => {
        if (err) {
            nack(err);
        } else {
            const dataAck = Object.assign({}, successAck);
            dataAck.data = entity;
            ack(dataAck);
        }
    });
}

function getPreloadScripts(identity: Identity, message: APIMessage, ack: Acker, nack: Nacker): void {
    System.getPreloadScripts(identity)
        .then((preloadScripts: PreloadScript[]) => {
            const dataAck = Object.assign({}, successAck);
            dataAck.data = preloadScripts;
            ack(dataAck);
        })
        .catch(nack);
}

function authenticateResourceFetch(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const dataAck = Object.assign({}, successAck);
    dataAck.data = System.authenticateResourceFetch(identity, payload);
    ack(dataAck);
}
