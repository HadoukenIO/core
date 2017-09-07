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
let apiProtocolBase = require('./api_protocol_base.js');
let System = require('../../api/system.js').System;

function SystemApiHandler() {
    let SystemApiHandlerMap = {
        'clear-cache': { apiFunc: clearCache, apiPath: '.clearCache' },
        'convert-options': convertOptions,
        'delete-cache-request': deleteCacheRequest, // apiPath: '.deleteCacheOnRestart' -> deprecated
        'download-asset': { apiFunc: downloadAsset, apiPath: '.downloadAsset' },
        'download-runtime': { apiFunc: downloadRuntime, apiPath: '.downloadRuntime' },
        'exit-desktop': { apiFunc: exitDesktop, apiPath: '.exitDesktop' },
        'generate-guid': generateGuid,
        'get-all-applications': getAllApplications,
        'get-all-external-applications': getAllExternalApplications,
        'get-all-windows': getAllWindows,
        'get-app-asset-info': getAppAssetInfo,
        'get-command-line-arguments': { apiFunc: getCommandLineArguments, apiPath: '.getCommandLineArguments' },
        'get-config': { apiFunc: getConfig, apiPath: '.getConfig' },
        'get-crash-reporter-state': getCrashReporterState,
        'get-device-id': { apiFunc: getDeviceId, apiPath: '.getDeviceId' },
        'get-device-user-id': getDeviceUserId,
        'get-el-ipc-config': getElIPCConfig,
        'get-environment-variable': { apiFunc: getEnvironmentVariable, apiPath: '.getEnvironmentVariable' },
        'get-host-specs': { apiFunc: getHostSpecs, apiPath: '.getHostSpecs' },
        'get-min-log-level': getMinLogLevel,
        'get-monitor-info': getMonitorInfo, // apiPath: '.getMonitorInfo' -> called by js adapter during init so can't be disabled
        'get-mouse-position': { apiFunc: getMousePosition, apiPath: '.getMousePosition' },
        'get-nearest-display-root': getNearestDisplayRoot,
        'get-proxy-settings': getProxySettings,
        'get-remote-config': { apiFunc: getRemoteConfig, apiPath: '.getRemoteConfig' },
        'get-rvm-info': getRvmInfo,
        'get-selected-preload-scripts': getSelectedPreloadScripts,
        'get-version': getVersion,
        'get-websocket-state': getWebSocketState,
        'launch-external-process': { apiFunc: launchExternalProcess, apiPath: '.launchExternalProcess' },
        'list-logs': { apiFunc: listLogs, apiPath: '.getLogList' },
        'monitor-external-process': { apiFunc: monitorExternalProcess, apiPath: '.monitorExternalProcess' },
        'open-url-with-browser': openUrlWithBrowser,
        'process-snapshot': processSnapshot,
        'raise-event': raiseEvent,
        'release-external-process': { apiFunc: releaseExternalProcess, apiPath: '.releaseExternalProcess' },
        'resolve-uuid': resolveUuid,
        //'set-clipboard': setClipboard, -> moved to clipboard.ts
        'set-cookie': setCookie,
        'set-min-log-level': setMinLogLevel,
        'show-developer-tools': showDeveloperTools,
        'start-crash-reporter': startCrashReporter,
        'terminate-external-process': { apiFunc: terminateExternalProcess, apiPath: '.terminateExternalProcess' },
        'update-proxy': updateProxy,
        'view-log': { apiFunc: viewLog, apiPath: '.getLog' },
        'write-to-log': writeToLog,
        'download-preload-scripts': downloadPreloadScripts //internal function
    };

    apiProtocolBase.registerActionMap(SystemApiHandlerMap, 'System');

    function didFail(e) {
        return e !== undefined && e.constructor === Error;
    }

    function setMinLogLevel(identity, message) {
        return new Promise((resolve, reject) => {
            const response = System.setMinLogLevel(message.payload.level);
            if (didFail(response)) {
                reject(response);
            } else {
                resolve();
            }
        });
    }

    function getMinLogLevel(identity, message) {
        return new Promise((resolve, reject) => {
            const response = System.getMinLogLevel();
            if (didFail(response)) {
                reject(response);
            } else {
                resolve(response);
            }
        });
    }

    function startCrashReporter(identity, message) {
        const { payload } = message;
        return System.startCrashReporter(identity, payload, false);
    }

    function getCrashReporterState(identity, message) {
        return System.getCrashReporterState();
    }

    function downloadPreloadScripts(identity, message) {
        return new Promise((resolve, reject) => {
            const { payload: { uuid, name, scripts } } = message;
            const windowIdentity = { uuid, name };

            System.downloadPreloadScripts(windowIdentity, scripts, err => {
                if (!err) {
                    resolve();
                } else {
                    reject(err);
                }
            });
        });
    }

    function getAppAssetInfo(identity, message) {
        return new Promise((resolve, reject) => {
            const options = message.payload;
            System.getAppAssetInfo(identity, options, data => {
                //remove `path` due to security concern
                delete data.path;
                resolve(data);
            }, reject);
        });
    }

    function getDeviceUserId(identity, message) {
        return System.getDeviceUserId();
    }

    function getAllExternalApplications(identity, message) {
        return System.getAllExternalApplications();
    }

    function raiseEvent(identity, message) {
        const { payload: { eventName, eventArgs } } = message;
        System.raiseEvent(eventName, eventArgs);
    }

    function getElIPCConfig(identity, message) {
        return System.getElIPCConfiguration();
    }

    function convertOptions(identity, message) {
        return System.convertOptions(message.payload);
    }

    function getWebSocketState(identity, message) {
        return System.getWebSocketServerState();
    }

    function generateGuid(identity, message) {
        return System.generateGUID();
    }

    function showDeveloperTools(identity, message) {
        System.showDeveloperTools(message.payload.uuid, message.payload.name);
    }

    function clearCache(identity, message) {
        return new Promise((resolve, reject) => {
            System.clearCache(message.payload, err => {
                if (!err) {
                    resolve();
                } else {
                    reject(err);
                }
            });
        });
    }

    function deleteCacheRequest(identity, message) {
        // deleteCacheOnRestart has been deprecated; redirects
        // to deleteCacheOnExit

        return new Promise((resolve, reject) => {
            System.deleteCacheOnExit(resolve, reject);
        });
    }

    function exitDesktop(identity, message) {
        setTimeout(() => System.exit());
    }

    function getAllApplications(identity, message) {
        return System.getAllApplications();
    }

    function getAllWindows(identity, message) {
        return System.getAllWindows(identity);
    }

    function getCommandLineArguments(identity, message) {
        return System.getCommandLineArguments();
    }

    function getConfig(identity, message) {
        return System.getConfig().data;
    }

    function getDeviceId(identity, message) {
        return System.getDeviceId();
    }

    function getRemoteConfig(identity, message) {
        return new Promise((resolve, reject) => {
            System.getRemoteConfig(message.payload.url, resolve, reject);
        });
    }

    function getEnvironmentVariable(identity, message) {
        return System.getEnvironmentVariable(message.payload.environmentVariables);
    }

    function viewLog(identity, message) {
        return new Promise((resolve, reject) => {
            System.getLog((message.payload || {}).name || '', (err, contents) => {
                if (!err) {
                    resolve(contents);
                } else {
                    reject(err);
                }
            });
        });
    }

    function listLogs(identity, message) {
        return new Promise((resolve, reject) => {
            System.getLogList((err, logList) => {
                if (!err) {
                    resolve(logList);
                } else {
                    reject(err);
                }
            });
        });
    }

    function getMonitorInfo(identity, message) {
        return System.getMonitorInfo();
    }

    function getMousePosition(identity, message) {
        return System.getMousePosition();
    }

    function processSnapshot(identity, message) {
        return System.getProcessList();
    }

    function getProxySettings(identity, message) {
        return System.getProxySettings();
    }

    function getVersion(identity, message) {
        return System.getVersion();
    }

    function getRvmInfo(identity, message) {
        return new Promise((resolve, reject) => {
            System.getRvmInfo(identity, resolve, reject);
        });
    }

    function launchExternalProcess(identity, message) {
        return new Promise((resolve, reject) => {
            System.launchExternalProcess(identity, message.payload, (err, res) => {
                if (!err) {
                    resolve(res);
                } else {
                    reject(err);
                }
            });
        });
    }

    function writeToLog(identity, message) {
        const logData = message.payload || {};
        const err = System.log(logData.level || '', logData.message || '');
        if (err) {
            throw err;
        }
    }

    function openUrlWithBrowser(identity, message) {
        System.openUrlWithBrowser(message.payload.url);
    }


    function releaseExternalProcess(identity, message) {
        System.releaseExternalProcess(message.payload.uuid);
    }

    function monitorExternalProcess(identity, message) {
        return new Promise((resolve, reject) => {
            System.monitorExternalProcess(identity, message.payload, resolve, reject);
        });
    }

    function setCookie(identity, message) {
        return new Promise((resolve, reject) => {
            System.setCookie(message.payload, resolve, reject);
        });
    }

    function terminateExternalProcess(identity, message) {
        const payload = message.payload || {};
        return System.terminateExternalProcess(payload.uuid, payload.timeout, payload.child);
    }

    function updateProxy(identity, message) {
        const { payload: { type, proxyAddress, proxyPort } } = message;
        const err = System.updateProxySettings(type, proxyAddress, proxyPort);
        if (err) {
            throw err;
        }
    }

    function getNearestDisplayRoot(identity, message) {
        return System.getNearestDisplayRoot(message.payload);
    }

    function downloadAsset(identity, message) {
        return new Promise((resolve, reject) => {
            System.downloadAsset(identity, message.payload, err => {
                if (!err) {
                    resolve();
                } else {
                    reject(err);
                }
            });
        });
    }

    function downloadRuntime(identity, message) {
        return new Promise((resolve, reject) => {
            const { payload } = message;

            System.downloadRuntime(identity, payload, err => {
                if (!err) {
                    resolve();
                } else {
                    reject(err);
                }
            });
        });
    }

    function getHostSpecs(identity, message) {
        return System.getHostSpecs();
    }

    function resolveUuid(identity, message) {
        return new Promise((resolve, reject) => {
            System.resolveUuid(identity, message.payload.entityKey, (err, entity) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(entity);
                }
            });
        });
    }

    function getSelectedPreloadScripts(identity, message) {
        return System.getSelectedPreloadScripts(message.payload);
    }
}

module.exports.SystemApiHandler = SystemApiHandler;
