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
let _ = require('underscore');
const coreState = require('../../core_state');


function SystemApiHandler() {
    let successAck = {
        success: true
    };

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
        'get-focused-window': getFocusedWindow,
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

    function setMinLogLevel(identity, message, ack, nack) {
        const { payload: { level } } = message;
        const response = System.setMinLogLevel(level);

        if (didFail(response)) {
            nack(response);

        } else {
            ack(_.clone(successAck));
        }
    }

    function getMinLogLevel(identity, message, ack, nack) {
        const response = System.getMinLogLevel();

        if (didFail(response)) {
            nack(response);

        } else {
            const dataAck = _.clone(successAck);
            dataAck.data = response;
            ack(dataAck);
        }
    }

    function startCrashReporter(identity, message, ack) {
        const dataAck = _.clone(successAck);
        const { payload } = message;
        dataAck.data = System.startCrashReporter(identity, payload, false);
        ack(dataAck);
    }

    function getCrashReporterState(identity, message, ack) {
        const dataAck = _.clone(successAck);
        dataAck.data = System.getCrashReporterState();
        ack(dataAck);
    }

    function downloadPreloadScripts(identity, message, ack, nack) {
        const { payload } = message;
        const { uuid, name, scripts } = payload;
        const windowIdentity = { uuid, name };

        System.downloadPreloadScripts(windowIdentity, scripts, err => {
            if (!err) {
                const dataAck = _.clone(successAck);
                ack(dataAck);
            } else {
                nack(err);
            }
        });
    }

    function getAppAssetInfo(identity, message, ack, nack) {
        let options = message.payload;

        System.getAppAssetInfo(identity, options, function(data) {
            let dataAck = _.clone(successAck);
            //remove path due to security concern
            delete data.path;
            dataAck.data = data;
            ack(dataAck);
        }, nack);
    }

    function getDeviceUserId(identity, message, ack) {
        let dataAck = _.clone(successAck);

        dataAck.data = System.getDeviceUserId();
        ack(dataAck);
    }

    function raiseEvent(identity, message, ack) {
        let evt = message.payload.eventName;
        let eventArgs = message.payload.eventArgs;

        System.raiseEvent(evt, eventArgs);
        ack(successAck);
    }

    function getElIPCConfig(identity, message, ack) {
        let dataAck = _.clone(successAck);

        dataAck.data = System.getElIPCConfiguration();
        ack(dataAck);
    }

    function convertOptions(identity, message, ack) {
        let dataAck = _.clone(successAck);

        dataAck.data = System.convertOptions(message.payload);
        ack(dataAck);

    }

    function getWebSocketState(identity, message, ack) {
        let dataAck = _.clone(successAck);

        dataAck.data = System.getWebSocketServerState();
        ack(dataAck);
    }

    function generateGuid(identity, message, ack) {
        let dataAck = _.clone(successAck);
        dataAck.data = System.generateGUID();
        ack(dataAck);
    }

    function showDeveloperTools(identity, message, ack) {
        System.showDeveloperTools(message.payload.uuid, message.payload.name);
        ack(successAck);
    }

    function clearCache(identity, message, ack, nack) {
        System.clearCache(message.payload, (err) => {
            if (!err) {
                ack(successAck);
            } else {
                nack(err);
            }
        });
    }

    function deleteCacheRequest(identity, message, ack, nack) {
        // deleteCacheOnRestart has been deprecated; redirects
        // to deleteCacheOnExit
        System.deleteCacheOnExit(() => {
            ack(successAck);
        }, nack);
    }

    function exitDesktop(identity, message, ack) {
        ack(successAck);
        System.exit();
    }

    function getAllApplications(identity, message, ack) {
        const { locals } = message;
        var dataAck = _.clone(successAck);
        dataAck.data = System.getAllApplications();
        if (locals && locals.aggregate) {
            const { aggregate } = locals;
            dataAck.data = [...dataAck.data, ...aggregate];
        }
        ack(dataAck);
    }

    function getAllExternalApplications(identity, message, ack) {
        const { locals } = message;
        let dataAck = _.clone(successAck);
        dataAck.data = System.getAllExternalApplications();

        if (locals && locals.aggregate) {
            const { aggregate } = locals;
            const version = System.getVersion();
            const portInfo = coreState.getSocketServerState();
            const { port, securityRealm } = portInfo;
            const currentApplication = securityRealm ? `${version}/${port}/${securityRealm}` : `${version}/${port}/`;

            const filteredAggregate = aggregate.filter(result => (result.uuid !== currentApplication));
            const filteredAggregateSet = [...new Set(filteredAggregate)];
            dataAck.data = [...dataAck.data, ...filteredAggregateSet];
        }
        ack(dataAck);
    }

    function getAllWindows(identity, message, ack) {
        const { locals } = message;
        var dataAck = _.clone(successAck);
        dataAck.data = System.getAllWindows(identity);

        if (locals && locals.aggregate) {
            const { aggregate } = locals;
            dataAck.data = [...dataAck.data, ...aggregate];
        }
        ack(dataAck);
    }

    function getCommandLineArguments(identity, message, ack) {
        var dataAck = _.clone(successAck);
        dataAck.data = System.getCommandLineArguments();
        ack(dataAck);
    }

    function getConfig(identity, message, ack) {
        var dataAck = _.clone(successAck);
        dataAck.data = System.getConfig().data;
        ack(dataAck);
    }

    function getDeviceId(identity, message, ack) {
        var dataAck = _.clone(successAck);
        dataAck.data = System.getDeviceId();
        ack(dataAck);
    }

    function getFocusedWindow(identity, message, ack) {
        var dataAck = _.clone(successAck);
        dataAck.data = System.getFocusedWindow();
        ack(dataAck);
    }

    function getRemoteConfig(identity, message, ack, nack) {
        System.getRemoteConfig(message.payload.url,
            function(data) {
                var dataAck = _.clone(successAck);
                dataAck.data = data;
                ack(dataAck);
            },
            function(reason) {
                nack(reason);
            });
    }

    function getEnvironmentVariable(identity, message, ack) {
        var dataAck = _.clone(successAck);
        dataAck.data = System.getEnvironmentVariable(message.payload.environmentVariables);
        ack(dataAck);
    }

    function viewLog(identity, message, ack, nack) {
        System.getLog((message.payload || {}).name || '', (err, contents) => {
            if (!err) {
                var dataAck = _.clone(successAck);
                dataAck.data = contents;
                ack(dataAck);
            } else {
                nack(err);
            }
        });
    }

    function listLogs(identity, message, ack, nack) {
        System.getLogList((err, logList) => {
            if (!err) {
                var dataAck = _.clone(successAck);
                dataAck.data = logList;
                ack(dataAck);
            } else {
                nack(err);
            }
        });
    }

    function getMonitorInfo(identity, message, ack) {
        let dataAck = _.clone(successAck);
        dataAck.data = System.getMonitorInfo();
        ack(dataAck);
    }

    function getMousePosition(identity, message, ack) {
        var dataAck = _.clone(successAck);
        dataAck.data = System.getMousePosition();
        ack(dataAck);
    }

    function processSnapshot(identity, message, ack) {
        const { locals } = message;
        var dataAck = _.clone(successAck);
        dataAck.data = System.getProcessList();
        if (locals && locals.aggregate) {
            const { aggregate } = locals;
            const aggregateSet = [...new Set(aggregate)];
            dataAck.data = [...dataAck.data, ...aggregateSet];
        }
        ack(dataAck);
    }

    function getProxySettings(identity, message, ack) {
        let dataAck = _.clone(successAck);
        dataAck.data = System.getProxySettings();
        ack(dataAck);
    }

    function getVersion(identity, message, ack) {
        var dataAck = _.clone(successAck);
        dataAck.data = System.getVersion();
        ack(dataAck);
    }

    function getRvmInfo(identity, message, ack, nack) {
        System.getRvmInfo(identity, function(data) {
            let dataAck = _.clone(successAck);
            dataAck.data = data;
            ack(dataAck);
        }, function(err) {
            nack(err);
        });
    }

    function launchExternalProcess(identity, message, ack, nack) {
        let dataAck = _.clone(successAck);
        System.launchExternalProcess(identity, message.payload, (err, res) => {
            if (!err) {
                dataAck.data = res;
                ack(dataAck);
            } else {
                nack(err);
            }
        });
    }

    function writeToLog(identity, message, ack, nack) {
        var logData = message.payload || {};
        var err = System.log(logData.level || '', logData.message || '');
        if (err) {
            nack(err);
        } else {
            ack(successAck);
        }
    }

    function openUrlWithBrowser(identity, message, ack) {
        System.openUrlWithBrowser(message.payload.url);
        ack(successAck);
    }


    function releaseExternalProcess(identity, message, ack) {
        System.releaseExternalProcess(message.payload.uuid);
        ack(successAck);
    }

    function monitorExternalProcess(identity, message, ack, nack) {
        System.monitorExternalProcess(identity, message.payload, function(data) {
            let dataAck = _.clone(successAck);
            dataAck.data = data;
            ack(dataAck);
        }, function(err) {
            nack(err);
        });
    }

    function setCookie(identity, message, ack, nack) {
        System.setCookie(message.payload, function() {
            ack(successAck);
        }, function(err) {
            nack(err);
        });

    }

    function terminateExternalProcess(identity, message, ack) {
        let payload = message.payload || {};
        let dataAck = _.clone(successAck);
        dataAck.data = System.terminateExternalProcess(payload.uuid, payload.timeout, payload.child);
        ack(dataAck);
    }

    function updateProxy(identity, message, ack, nack) {
        var err = System.updateProxySettings(message.payload.type,
            message.payload.proxyAddress,
            message.payload.proxyPort);

        if (!err) {
            ack(successAck);
        } else {
            nack(err);
        }
    }

    function getNearestDisplayRoot(identity, message, ack) {
        let dataAck = _.clone(successAck);
        dataAck.data = System.getNearestDisplayRoot(message.payload);
        ack(dataAck);
    }

    function downloadAsset(identity, message, ack, errorAck) {
        let dataAck = _.clone(successAck);
        System.downloadAsset(identity, message.payload, (err) => {
            if (!err) {
                ack(dataAck);
            } else {
                errorAck(err);
            }
        });
    }

    function downloadRuntime(identity, message, ack, nack) {
        const { payload } = message;
        const dataAck = _.clone(successAck);

        System.downloadRuntime(identity, payload, (err) => {
            if (err) {
                nack(err);
            } else {
                ack(dataAck);
            }
        });
    }

    function getHostSpecs(identity, message, ack) {
        let dataAck = _.clone(successAck);
        dataAck.data = System.getHostSpecs();
        ack(dataAck);
    }

    function resolveUuid(identity, message, ack, nack) {
        let dataAck = _.clone(successAck);

        System.resolveUuid(identity, message.payload.entityKey, (err, entity) => {
            if (err) {
                nack(err);
            } else {
                dataAck.data = entity;
                ack(dataAck);
            }
        });
    }

    function getSelectedPreloadScripts(identity, message, ack, nack) {
        const { payload } = message;

        System.getSelectedPreloadScripts(payload)
            .then(scriptSet => {
                const dataAck = _.clone(successAck);
                dataAck.data = scriptSet;
                ack(dataAck);
            })
            .catch(nack);
    }
}

module.exports.SystemApiHandler = SystemApiHandler;
