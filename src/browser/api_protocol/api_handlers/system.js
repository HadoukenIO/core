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

function SystemApiHandler() {
    let successAck = {
        success: true
    };

    let SystemApiHandlerMap = {
        'clear-cache': clearCache,
        'convert-options': convertOptions,
        'delete-cache-request': deleteCacheRequest,
        'download-asset': downloadAsset,
        'exit-desktop': exitDesktop,
        'generate-guid': generateGuid,
        'get-all-applications': getAllApplications,
        'get-all-external-applications': getAllExternalApplications,
        'get-all-windows': getAllWindows,
        'get-command-line-arguments': getCommandLineArguments,
        'get-config': getConfig,
        'get-device-id': getDeviceId,
        'get-device-user-id': getDeviceUserId,
        'get-el-ipc-config': getElIPCConfig,
        'get-environment-variable': getEnvironmentVariable,
        'get-host-specs': getHostSpecs,
        'get-monitor-info': getMonitorInfo,
        'get-mouse-position': getMousePosition,
        'get-nearest-display-root': getNearestDisplayRoot,
        'get-proxy-settings': getProxySettings,
        'get-remote-config': getRemoteConfig,
        'get-rvm-info': getRvmInfo,
        'get-version': getVersion,
        'get-websocket-state': getWebSocketState,
        'launch-external-process': launchExternalProcess,
        'list-logs': listLogs,
        'monitor-external-process': monitorExternalProcess,
        'open-url-with-browser': openUrlWithBrowser,
        'process-snapshot': processSnapshot,
        'raise-event': raiseEvent,
        'release-external-process': releaseExternalProcess,
        'resolve-uuid': resolveUuid,
        'set-cookie': setCookie,
        'show-developer-tools': showDeveloperTools,
        'terminate-external-process': terminateExternalProcess,
        'update-proxy': updateProxy,
        'view-log': viewLog,
        'write-to-log': writeToLog
        //'set-clipboard': setClipboard, this has moved to clipboard_external_api
    };

    apiProtocolBase.registerActionMap(SystemApiHandlerMap);

    function getDeviceUserId(identity, message, ack) {
        let dataAck = _.clone(successAck);

        dataAck.data = System.getDeviceUserId();
        ack(dataAck);
    }

    function getAllExternalApplications(identity, message, ack) {
        let dataAck = _.clone(successAck);

        dataAck.data = System.getAllExternalApplications();
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
        var dataAck = _.clone(successAck);
        dataAck.data = System.getAllApplications();
        ack(dataAck);
    }

    function getAllWindows(identity, message, ack) {
        var dataAck = _.clone(successAck);
        dataAck.data = System.getAllWindows(identity);
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
        var dataAck = _.clone(successAck);
        dataAck.data = System.getProcessList();
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
        System.downloadAsset(identity, message.payload, (err, dlId) => {
            if (!err) {
                dataAck.data = {
                    dlId
                };
                ack(dataAck);
            } else {
                errorAck(err);
            }
        });
    }

    function getHostSpecs(identity, message, ack) {
        let dataAck = _.clone(successAck);
        dataAck.data = System.getHostSpecs();
        ack(dataAck);
    }

    function resolveUuid(idenity, message, ack, nack) {
        let dataAck = _.clone(successAck);

        System.resolveUuid(idenity, message.payload.entityKey, (err, entity) => {
            if (err) {
                nack(err);
            } else {
                dataAck.data = entity;
                ack(dataAck);
            }
        });

    }
}

module.exports.SystemApiHandler = SystemApiHandler;
