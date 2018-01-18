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
import { addRemoteSubscription } from '../../remote_subscriptions';
import route from '../../../common/route';

const SetWindowPosition = {
    SWP_HIDEWINDOW: 0x0080,
    SWP_SHOWWINDOW: 0x0040
};

const SysCommands = {
    SC_MAXIMIZE: 0xF030,
    SC_MINIMIZE: 0xF020,
    SC_RESTORE: 0xF120
};

const WindowsMessages = {
    WM_DESTROY: 0x0002,
    WM_SETFOCUS: 0x0007,
    WM_KILLFOCUS: 0x0008,
    WM_WINDOWPOSCHANGED: 0x0047,
    WM_SYSCOMMAND: 0x0112,
    WM_NCLBUTTONDBLCLK: 0x00A3,
    WM_SIZING: 0x0214,
    WM_MOVING: 0x0216,
    WM_ENTERSIZEMOVE: 0x0231,
    WM_EXITSIZEMOVE: 0x0232
};

let successAck = {
    success: true
};

module.exports.applicationApiMap = {
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
    'register-external-window': registerExternalWindow,
    'register-user': registerUser,
    'relaunch-on-close': relaunchOnClose,
    'remove-tray-icon': removeTrayIcon,
    'restart-application': restartApplication,
    'run-application': runApplication,
    'set-shortcuts': { apiFunc: setShortcuts, apiPath: '.setShortcuts' },
    'set-tray-icon': setTrayIcon,
    'terminate-application': terminateApplication,
    'wait-for-hung-application': waitForHungApplication
};

module.exports.init = function() {
    apiProtocolBase.registerActionMap(module.exports.applicationApiMap, 'Application');
};

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
    const payload = message.payload;
    const dataAck = _.clone(successAck);
    let appIdentity;

    // When manifest URL is provided, will be retrieving a remote manifest
    if (!payload.hasOwnProperty('manifestUrl')) {
        appIdentity = apiProtocolBase.getTargetApplicationIdentity(payload);
    }

    Application.getManifest(appIdentity, payload.manifestUrl, manifest => {
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
        .filter(function(c) { return c.name !== c.uuid; })
        .map(function(c) { return c.name; })
        .value();
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
    const { payload } = message;
    const { manifestUrl } = payload;
    const appIdentity = apiProtocolBase.getTargetApplicationIdentity(payload);
    const { uuid } = appIdentity;
    let remoteSubscriptionUnSubscribe;
    const remoteSubscription = {
        uuid,
        name: uuid,
        listenType: 'once',
        className: 'window',
        eventName: 'fire-constructor-callback'
    };

    ofEvents.once(route.window('fire-constructor-callback', uuid, uuid), loadInfo => {
        if (loadInfo.success) {
            const successReturn = _.clone(successAck);
            successReturn.data = loadInfo.data;
            ack(successReturn);
        } else {
            const theErr = new Error(loadInfo.data.message);
            theErr.networkErrorCode = loadInfo.data.networkErrorCode;
            nack(theErr);
        }

        if (typeof remoteSubscriptionUnSubscribe === 'function') {
            remoteSubscriptionUnSubscribe();
        }
    });

    if (manifestUrl) {
        addRemoteSubscription(remoteSubscription).then((unSubscribe) => {
            remoteSubscriptionUnSubscribe = unSubscribe;
            Application.runWithRVM(identity, manifestUrl).catch(nack);
        });
    } else {
        Application.run(appIdentity);
    }
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

    ofEvents.emit(route.externalWindow('close', windowIdentity.uuid, windowIdentity.name));
    ack(successAck);
}

function externalWindowAction(identity, message, ack) {
    /* jshint bitwise: false */
    const { payload, payload: { type, uuid, name } } = message;

    switch (type) {
        case WindowsMessages.WM_DESTROY:
            ofEvents.emit(route.externalWindow('close', uuid, name));
            break;
        case WindowsMessages.WM_SETFOCUS:
            ofEvents.emit(route.externalWindow('focus', uuid, name));
            break;
        case WindowsMessages.WM_KILLFOCUS:
            ofEvents.emit(route.externalWindow('blur', uuid, name));
            break;
        case WindowsMessages.WM_WINDOWPOSCHANGED:
            let flags = payload.flags;

            ofEvents.emit(route.externalWindow('bounds-changed', uuid, name));

            // dispatch show and hide events
            if (flags & SetWindowPosition.SWP_SHOWWINDOW) {
                ofEvents.emit(route.externalWindow('visibility-changed', uuid, name), true);
            } else if (flags & SetWindowPosition.SWP_HIDEWINDOW) {
                ofEvents.emit(route.externalWindow('visibility-changed', uuid, name), false);
            }
            break;
        case WindowsMessages.WM_SYSCOMMAND:
            let commandType = payload.wParam;
            let stateChange = (
                commandType === SysCommands.SC_MAXIMIZE ||
                commandType === SysCommands.SC_MINIMIZE ||
                commandType === SysCommands.SC_RESTORE
            );

            if (!stateChange) {
                break;
            }
            /* falls through */
        case WindowsMessages.WM_NCLBUTTONDBLCLK:
            ofEvents.emit(route.externalWindow('state-change', uuid, name));
            break;
        case WindowsMessages.WM_SIZING:
            ofEvents.emit(route.externalWindow('sizing', uuid, name));
            break;
        case WindowsMessages.WM_MOVING:
            ofEvents.emit(route.externalWindow('moving', uuid, name));
            break;
        case WindowsMessages.WM_ENTERSIZEMOVE:
            ofEvents.emit(route.externalWindow('begin-user-bounds-change', uuid, name), {
                x: payload.mouseX,
                y: payload.mouseY
            });
            break;
        case WindowsMessages.WM_EXITSIZEMOVE:
            ofEvents.emit(route.externalWindow('end-user-bounds-change', uuid, name));
            break;
        default:
            // Do nothing
            break;
    }

    ack(successAck);
    /* jshint bitwise: true */
}

function registerUser(identity, message, ack, nack) {
    const payload = message.payload;
    const appIdentity = apiProtocolBase.getTargetApplicationIdentity(payload);

    Application.registerUser(appIdentity, payload.userName, payload.appName, () => {
        ack(successAck);
    }, nack);
}

function relaunchOnClose(identity, message, ack, nack) {
    const appIdentity = apiProtocolBase.getTargetApplicationIdentity(message.payload);

    Application.scheduleRestart(appIdentity, () => {
        ack(successAck);
    }, nack);
}
