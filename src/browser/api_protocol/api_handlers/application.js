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

// built-in modules
let BrowserWindow = require('electron').BrowserWindow;
let electronApp = require('electron').app;

// npm modules
let _ = require('underscore');

// local modules
let Application = require('../../api/application.js').Application;
let apiProtocolBase = require('./api_protocol_base.js');
let coreState = require('../../core_state.js');
import ofEvents from '../../of_events';


function ApplicationApiHandler() {
    let successAck = {
        success: true
    };
    let appExternalApiMap = {
        'close-application': closeApplication,
        'create-application': createApplication,
        'create-child-window': createChildWindow,
        'deregister-external-window': deregisterExternalWindow,
        'external-window-action': externalWindowAction,
        'get-application-groups': getApplicationGroups,
        'get-application-manifest': getApplicationManifest,
        'get-child-windows': getChildWindows,
        'get-info': getInfo,
        'get-parent-application': getParentApplication,
        'get-shortcuts': getShortcuts,
        'get-tray-icon-info': getTrayIconInfo,
        'is-application-running': isApplicationRunning,
        'notify-on-app-connected': notifyOnAppConnected,
        'notify-on-content-loaded': notifyOnContentLoaded,
        'ping-child-window': pingChildWindow,
        'register-custom-data': registerCustomData,
        'register-external-window': registerExternalWindow,
        'relaunch-on-close': relaunchOnClose,
        'remove-tray-icon': removeTrayIcon,
        'restart-application': restartApplication,
        'run-application': runApplication,
        'set-shortcuts': setShortcuts,
        'set-tray-icon': setTrayIcon,
        'terminate-application': terminateApplication,
        'wait-for-hung-application': waitForHungApplication
    };

    apiProtocolBase.registerActionMap(appExternalApiMap);

    function setTrayIcon(identity, rawMessage, ack, nack) {
        let message = JSON.parse(JSON.stringify(rawMessage));
        let payload = message.payload;
        let appIdentity = apiProtocolBase.getTargetApplicationIdentity(payload);

        Application.setTrayIcon(appIdentity, payload.enabledIcon, () => {
            ack(successAck);
        }, nack);
    }

    function getTrayIconInfo(identity, message, ack, nack) {
        const dataAck = _.clone(successAck);
        const appIdentity = apiProtocolBase.getTargetApplicationIdentity(message.payload);

        Application.getTrayIconInfo(appIdentity, response => {
            dataAck.data = response;
            ack(dataAck);
        }, nack);
    }

    function removeTrayIcon(identity, message, ack) {
        const appIdentity = apiProtocolBase.getTargetApplicationIdentity(message.payload);

        Application.removeTrayIcon(appIdentity);
        ack(successAck);
    }

    function waitForHungApplication(identity, message, ack) {
        const appIdentity = apiProtocolBase.getTargetApplicationIdentity(message.payload);

        Application.wait(appIdentity);
        ack(successAck);
    }

    function terminateApplication(identity, message, ack) {
        const appIdentity = apiProtocolBase.getTargetApplicationIdentity(message.payload);

        Application.terminate(appIdentity, () => {
            ack(successAck);
        });

    }

    function restartApplication(identity, message, ack) {
        const appIdentity = apiProtocolBase.getTargetApplicationIdentity(message.payload);

        Application.restart(appIdentity);
        ack(successAck);
    }

    function createChildWindow(identity, message, ack) {
        let payload = message.payload;
        let targetIdentity = {
            uuid: payload.targetUuid,
            name: payload.targetUuid
        };
        //This feature defers execution to the application's main window.
        let createChildPayload = {
            action: 'create-child-window',
            payload
        };
        apiProtocolBase.sendToIdentity(targetIdentity, createChildPayload);
        ack(successAck);
    }

    function pingChildWindow(identity, message, ack) {
        //TODO:send back an error saying its deprecated.
        ack(successAck);
    }

    function isApplicationRunning(identity, message, ack) {
        const dataAck = _.clone(successAck);
        const appIdentity = apiProtocolBase.getTargetApplicationIdentity(message.payload);

        dataAck.data = Application.isRunning(appIdentity);
        ack(dataAck);
    }

    function getApplicationManifest(identity, message, ack, nack) {
        const dataAck = _.clone(successAck);
        const appIdentity = apiProtocolBase.getTargetApplicationIdentity(message.payload);

        Application.getManifest(appIdentity, manifest => {
            dataAck.data = manifest;
            ack(dataAck);
        }, nack);
    }

    function getApplicationGroups(identity, message, ack) {
        const payload = message.payload;
        const dataAck = _.clone(successAck);
        const appIdentity = apiProtocolBase.getTargetApplicationIdentity(payload);

        // NOTE: the Window API returns a wrapped window with 'name' as a member,
        // while the adaptor expects it to be 'windowName'
        let groups = _.filter(Application.getGroups(), windowGroup => {
            return _.some(windowGroup, window => {
                return window.uuid === appIdentity.uuid;
            });
        });
        dataAck.data = _.map(groups, groupOfWindows => {
            return _.map(groupOfWindows, window => {
                if (payload.crossApp === true) {
                    var _window = _.clone(window);
                    _window.windowName = window.name;
                    return _window;
                } else {
                    return window.name; // backward compatible
                }
            });
        });
        ack(dataAck);
    }

    function getChildWindows(identity, message, ack) {
        const dataAck = _.clone(successAck);
        const appIdentity = apiProtocolBase.getTargetApplicationIdentity(message.payload);

        dataAck.data = _.chain(Application.getChildWindows(appIdentity))
            .filter(function(c) {
                return c.name !== c.uuid;
            })
            .map(function(c) {
                return c.name;
            }).value();
        ack(dataAck);
    }

    function getInfo(identity, message, ack, nack) {
        const dataAck = _.clone(successAck);
        const appIdentity = apiProtocolBase.getTargetApplicationIdentity(message.payload);

        Application.getInfo(appIdentity, response => {
            dataAck.data = response;
            ack(dataAck);
        }, nack);
    }

    function getParentApplication(identity, message, ack, nack) {
        const dataAck = _.clone(successAck);
        const appIdentity = apiProtocolBase.getTargetApplicationIdentity(message.payload);
        const parentUuid = Application.getParentApplication(appIdentity);

        if (parentUuid) {
            dataAck.data = parentUuid;
            ack(dataAck);
        } else {
            nack(new Error('No parent application found'));
        }
    }

    function getShortcuts(identity, message, ack, nack) {
        const dataAck = _.clone(successAck);
        const appIdentity = apiProtocolBase.getTargetApplicationIdentity(message.payload);

        Application.getShortcuts(appIdentity, response => {
            dataAck.data = response;
            ack(dataAck);
        }, nack);
    }

    function setShortcuts(identity, message, ack, nack) {
        const payload = message.payload;
        const dataAck = _.clone(successAck);
        const appIdentity = apiProtocolBase.getTargetApplicationIdentity(payload);

        Application.setShortcuts(appIdentity, payload.data, response => {
            dataAck.data = response;
            ack(dataAck);
        }, nack);
    }

    function closeApplication(identity, message, ack) {
        const payload = message.payload;
        const appIdentity = apiProtocolBase.getTargetApplicationIdentity(payload);
        const force = !!payload.force;

        Application.close(appIdentity, force, () => {
            ack(successAck);
        });
    }

    function createApplication(identity, message, ack) {
        let payload = message.payload;
        Application.create(payload, undefined, identity);
        ack(successAck);
    }

    function notifyOnAppConnected(identity, message, ack) {
        var payload = message.payload;
        Application.notifyOnAppConnected({
            uuid: payload.targetUuid,
            name: payload.name
        }, identity);
        ack(successAck);
    }

    function notifyOnContentLoaded(identity, message, ack) {
        var payload = message.payload;
        Application.notifyOnContentLoaded({
            uuid: payload.targetUuid,
            name: payload.name
        }, identity);
        ack(successAck);
    }

    function runApplication(identity, message, ack, nack) {
        const payload = message.payload;
        /*jshint unused:false */
        const appIdentity = apiProtocolBase.getTargetApplicationIdentity(payload);
        const uuid = appIdentity.uuid;

        ofEvents.once(`window/fire-constructor-callback/${uuid}-${uuid}`, loadInfo => {
            if (loadInfo.success) {
                const successReturn = _.clone(successAck);
                successReturn.data = loadInfo.data;
                ack(successReturn);
            } else {
                const theErr = new Error(loadInfo.data.message);
                theErr.networkErrorCode = loadInfo.data.networkErrorCode;
                nack(theErr);
            }
        });

        Application.run(appIdentity);
    }

    function registerExternalWindow(identity, message, ack) {
        let payload = message.payload;
        let childWindowOptions = {
            name: payload.name,
            uuid: payload.uuid,
            hwnd: payload.hwnd
        };
        let parent = coreState.getWindowByUuidName(payload.uuid, payload.uuid);
        let parentBw = parent && parent.browserWindow;
        let childBw = new BrowserWindow(childWindowOptions);

        electronApp.emit('child-window-created', parentBw.id, childBw.id, childWindowOptions);
        ack(successAck);
    }

    function deregisterExternalWindow(identity, message, ack) {
        const windowIdentity = apiProtocolBase.getTargetWindowIdentity(message.payload);

        ofEvents.emit(`external-window/close/${windowIdentity.uuid}-${windowIdentity.name}`);
        ack(successAck);
    }

    function externalWindowAction(identity, message, ack) {
        /* jshint bitwise: false */
        let payload = message.payload;
        let uuidname = `${payload.uuid}-${payload.name}`;

        const SWP_HIDEWINDOW = 128;
        const SWP_SHOWWINDOW = 64;
        const SC_MAXIMIZE = 61488;
        const SC_MINIMIZE = 61472;
        const SC_RESTORE = 61728;

        switch (payload.type) {
            case 2:
                // WM_DESTROY
                ofEvents.emit(`external-window/close/${uuidname}`);
                break;
            case 7:
                // WM_SETFOCUS
                ofEvents.emit(`external-window/focus/${uuidname}`);
                break;
            case 8:
                // WM__KILLFOCUS
                ofEvents.emit(`external-window/blur/${uuidname}`);
                break;
            case 71:
                // WM_WINDOWPOSCHANGED
                let flags = payload.flags;

                ofEvents.emit(`external-window/bounds-changed/${uuidname}`);

                // dispatch show and hide events
                if (flags & SWP_SHOWWINDOW) {
                    ofEvents.emit(`external-window/visibility-changed/${uuidname}`, true);
                } else if (flags & SWP_HIDEWINDOW) {
                    ofEvents.emit(`external-window/visibility-changed/${uuidname}`, false);
                }
                break;
            case 274:
                // WM_SYSCOMMAND
                let commandType = payload.wParam;
                let stateChange = commandType === SC_MAXIMIZE || commandType === SC_MINIMIZE || commandType === SC_RESTORE;

                if (!stateChange) {
                    break;
                }
                /* falls through */
            case 163:
                // WM_NCLBUTTONDBLCLK
                ofEvents.emit(`external-window/state-change/${uuidname}`);
                break;
            case 532:
                // WM_SIZING
                ofEvents.emit(`external-window/sizing/${uuidname}`);
                break;
            case 534:
                // WM_MOVING
                ofEvents.emit(`external-window/moving/${uuidname}`);
                break;
            case 561:
                // WM_ENTERSIZEMOVE
                ofEvents.emit(`external-window/begin-user-bounds-change/${uuidname}`, {
                    x: payload.mouseX,
                    y: payload.mouseY
                });
                break;
            case 562:
                // WM_EXITSIZEMOVE
                ofEvents.emit(`external-window/end-user-bounds-change/${uuidname}`);
                break;
            default:
                // Do nothing
                break;
        }

        ack(successAck);
        /* jshint bitwise: true */
    }

    function registerCustomData(identity, message, ack, nack) {
        const payload = message.payload;
        const appIdentity = apiProtocolBase.getTargetApplicationIdentity(payload);

        Application.registerCustomData(appIdentity, payload.data, () => {
            ack(successAck);
        }, nack);
    }

    function relaunchOnClose(identity, message, ack, nack) {
        const appIdentity = apiProtocolBase.getTargetApplicationIdentity(message.payload);

        Application.scheduleRestart(appIdentity, () => {
            ack(successAck);
        }, nack);
    }
}

module.exports.ApplicationApiHandler = ApplicationApiHandler;
