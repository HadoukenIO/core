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
const connectionManager = require('../../connection_manager');
import * as log from '../../log';

const ReadRegistryValuePolicyDelegate = {
    //checkPermissions(ApiPolicyDelegateArgs): boolean;
    checkPermissions: function(args) {
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
                permitted = args.permissionSettings.registryKeys.some(specKey => fullPath.startsWith(specKey));
            }
        }
        log.writeToLog(1, `ReadRegistryValueDelegate returning ${permitted}`, true);
        return permitted;
    }
};


function SystemApiHandler() {
    let successAck = {
        success: true
    };

    let SystemApiHandlerMap = {
        'clear-cache': { apiFunc: clearCache, apiPath: '.clearCache' },
        'create-proxy-socket': createProxySocket,
        'authenticate-proxy-socket': authenticateProxySocket,
        'convert-options': convertOptions,
        'delete-cache-request': deleteCacheRequest, // apiPath: '.deleteCacheOnRestart' -> deprecated
        'download-asset': { apiFunc: downloadAsset, apiPath: '.downloadAsset' },
        'download-preload-scripts': downloadPreloadScripts,
        'download-runtime': { apiFunc: downloadRuntime, apiPath: '.downloadRuntime' },
        'exit-desktop': { apiFunc: exitDesktop, apiPath: '.exitDesktop' },
        'flush-cookie-store': { apiFunc: flushCookieStore, apiPath: '.flushCookieStore' },
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
        'get-entity-info': getEntityInfo,
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
        'get-plugin-module': getPluginModule,
        'get-plugin-modules': getPluginModules,
        'get-preload-scripts': getPreloadScripts,
        'get-version': getVersion,
        'launch-external-process': { apiFunc: launchExternalProcess, apiPath: '.launchExternalProcess' },
        'list-logs': { apiFunc: listLogs, apiPath: '.getLogList' },
        'monitor-external-process': { apiFunc: monitorExternalProcess, apiPath: '.monitorExternalProcess' },
        'open-url-with-browser': openUrlWithBrowser,
        'process-snapshot': processSnapshot,
        'raise-event': raiseEvent,
        'raise-many-events': raiseManyEvents,
        'read-registry-value': { apiFunc: readRegistryValue, apiPath: '.readRegistryValue', apiPolicyDelegate: ReadRegistryValuePolicyDelegate },
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

    apiProtocolBase.registerActionMap(SystemApiHandlerMap, 'System');

    function didFail(e) {
        return e !== undefined && e.constructor === Error;
    }

    function readRegistryValue(identity, message, ack) {
        const dataAck = _.clone(successAck);
        const { payload: { rootKey, subkey, value } } = message;
        dataAck.data = System.readRegistryValue(rootKey, subkey, value);
        ack(dataAck);
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
        dataAck.data = System.startCrashReporter(identity, payload);
        ack(dataAck);
    }

    function getCrashReporterState(identity, message, ack) {
        const dataAck = _.clone(successAck);
        dataAck.data = System.getCrashReporterState();
        ack(dataAck);
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

    function raiseManyEvents(identity, message) {
        return System.raiseManyEvents(message.payload);
    }

    function convertOptions(identity, message, ack) {
        let dataAck = _.clone(successAck);

        dataAck.data = System.convertOptions(message.payload);
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
        System.clearCache(identity, message.payload, (err) => {
            if (!err) {
                ack(successAck);
            } else {
                nack(err);
            }
        });
    }

    function createProxySocket(identity, message, ack, nack) {
        System.createProxySocket(message.payload, ack, nack);
    }

    function authenticateProxySocket(identity, message) {
        System.authenticateProxySocket(message.payload);
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
            const currentApplication = connectionManager.getMeshUuid();

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

    function getEntityInfo(identity, message, ack, nack) {
        const { uuid, name } = message.payload;

        return System.getEntityInfo({ uuid, name });
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

    function getCookies(identity, message, ack, nack) {
        System.getCookies(message.payload, function(data) {
            let dataAck = _.clone(successAck);
            dataAck.data = data;
            ack(dataAck);
        }, function(err) {
            nack(err);
        });

    }

    function flushCookieStore(identity, message, ack, nack) {
        System.flushCookieStore(() => ack(successAck));
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

    function downloadPreloadScripts(identity, message, ack, nack) {
        const { scripts } = message.payload;

        System.downloadPreloadScripts(identity, scripts)
            .then((downloadResults) => {
                const dataAck = _.clone(successAck);
                dataAck.data = downloadResults;
                ack(dataAck);
            })
            .catch(nack);
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

    function getPreloadScripts(identity, message, ack, nack) {
        System.getPreloadScripts(identity)
            .then((preloadScripts) => {
                const dataAck = _.clone(successAck);
                dataAck.data = preloadScripts;
                ack(dataAck);
            })
            .catch(nack);
    }

    function getPluginModule(identity, message, ack, nack) {
        const { payload: { plugin } } = message;

        System.getPluginModule(identity, plugin)
            .then((pluginModule) => {
                const dataAck = _.clone(successAck);
                dataAck.data = pluginModule;
                ack(dataAck);
            })
            .catch(nack);
    }

    function getPluginModules(identity, message, ack, nack) {
        System.getPluginModules(identity)
            .then((pluginModules) => {
                const dataAck = _.clone(successAck);
                dataAck.data = pluginModules;
                ack(dataAck);
            })
            .catch(nack);
    }

    function authenticateResourceFetch(identity, message, ack) {
        let dataAck = _.clone(successAck);
        dataAck.data = System.authenticateResourceFetch(identity, message.payload);
        ack(dataAck);
    }

}

module.exports.SystemApiHandler = SystemApiHandler;
