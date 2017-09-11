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
const BrowserWindow = require('electron').BrowserWindow;
const electronApp = require('electron').app;

// npm modules
const _ = require('underscore');

// local modules
const Application = require('../../api/application.js').Application;
const apiProtocolBase = require('./api_protocol_base.js');
const coreState = require('../../core_state.js');
import ofEvents from '../../of_events';
import { addRemoteSubscription } from '../../remote_subscriptions';
import route from '../../../common/route';
import { WindowsMessages, SetWindowPosition, SysCommands } from '../../../microsoft';

// some local sugar
const getTargetAppId = message => apiProtocolBase.getTargetApplicationIdentity(message.payload);

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
    'register-custom-data': registerCustomData,
    'register-external-window': registerExternalWindow,
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

function setTrayIcon(identity, rawMessage) {
    return new Promise((resolve, reject) => {
        const message = JSON.parse(JSON.stringify(rawMessage));
        Application.setTrayIcon(getTargetAppId(message), message.payload.enabledIcon, resolve, reject);
    });
}

function getTrayIconInfo(identity, message) {
    return new Promise((resolve, reject) => {
        Application.getTrayIconInfo(getTargetAppId(message), resolve, reject);
    });
}

function removeTrayIcon(identity, message) {
    Application.removeTrayIcon(getTargetAppId(message));
}

function waitForHungApplication(identity, message) {
    Application.wait(getTargetAppId(message));
}

function terminateApplication(identity, message) {
    return new Promise(resolve => {
        Application.terminate(getTargetAppId(message), resolve);
    });
}

function restartApplication(identity, message) {
    Application.restart(getTargetAppId(message));
}

function createChildWindow(identity, message) {
    const { payload, targetUuid: uuid, targetUuid: name } = message;
    const targetIdentity = { uuid, name };
    //This feature defers execution to the application's main window.
    const createChildPayload = { action: 'create-child-window', payload };
    apiProtocolBase.sendToIdentity(targetIdentity, createChildPayload);
}

function pingChildWindow(identity, message) {
    //TODO:send back an error saying its deprecated.
}

function isApplicationRunning(identity, message) {
    return Application.isRunning(getTargetAppId(message));
}

function getApplicationManifest(identity, message) {
    return new Promise((resolve, reject) => {
        let appIdentity;

        // When manifest URL is provided, will be retrieving a remote manifest
        if (!message.payload.hasOwnProperty('manifestUrl')) {
            appIdentity = getTargetAppId(message);
        }

        Application.getManifest(appIdentity, message.payload.manifestUrl, resolve, reject);
    });
}

function getApplicationGroups(identity, message) {
    const { uuid } = getTargetAppId(message);

    // NOTE: the Window API returns a wrapped window with 'name' as a member,
    // while the adaptor expects it to be 'windowName'
    const groups = _.filter(Application.getGroups(), windowGroup => {
        return _.some(windowGroup, window => {
            return window.uuid === uuid;
        });
    });

    return _.map(groups, groupOfWindows => {
        return _.map(groupOfWindows, window => {
            const windowName = window.name;
            if (message.payload.crossApp === true) {
                return Object.assign({}, window, { windowName });
            } else {
                return windowName; // backward compatible
            }
        });
    });
}

function getChildWindows(identity, message) {
    return _.chain(Application.getChildWindows(getTargetAppId(message)))
        .filter(function(c) {
            return c.name !== c.uuid;
        })
        .map(function(c) {
            return c.name;
        }).value();
}

function getInfo(identity, message) {
    return new Promise((resolve, reject) => {
        Application.getInfo(getTargetAppId(message), resolve, reject);
    });
}

function getParentApplication(identity, message) {
    const parentUuid = Application.getParentApplication(getTargetAppId(message));

    if (!parentUuid) {
        throw new Error('No parent application found');
    }

    return parentUuid;
}

function getShortcuts(identity, message) {
    return new Promise((resolve, reject) => {
        Application.getShortcuts(getTargetAppId(message), resolve, reject);
    });
}

function setShortcuts(identity, message) {
    return new Promise((resolve, reject) => {
        Application.setShortcuts(getTargetAppId(message), message.payload.data, resolve, reject);
    });
}

function closeApplication(identity, message) {
    return new Promise(resolve => {
        Application.close(getTargetAppId(message), !!message.payload.force, resolve);
    });
}

function createApplication(identity, message) {
    Application.create(message.payload, undefined, identity);
}

function notifyOnAppConnected(identity, message) {
    const { targetUuid: uuid, name } = message.payload;
    const targetIdentity = { uuid, name };
    Application.notifyOnAppConnected(targetIdentity, identity);
}

function notifyOnContentLoaded(identity, message) {
    const { targetUuid: uuid, name } = message.payload;
    const targetIdentity = { uuid, name };
    Application.notifyOnContentLoaded(targetIdentity, identity);
}

function runApplication(identity, message) {
    return new Promise((resolve, reject) => {
        const { manifestUrl } = message.payload;
        const appIdentity = getTargetAppId(message);
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
                resolve(loadInfo.data);
            } else {
                const theErr = new Error(loadInfo.data.message);
                theErr.networkErrorCode = loadInfo.data.networkErrorCode;
                reject(theErr);
            }

            if (typeof remoteSubscriptionUnSubscribe === 'function') {
                remoteSubscriptionUnSubscribe();
            }
        });

        if (manifestUrl) {
            addRemoteSubscription(remoteSubscription).then((unSubscribe) => {
                remoteSubscriptionUnSubscribe = unSubscribe;
                Application.runWithRVM(identity, manifestUrl).catch(reject);
            });
        } else {
            Application.run(appIdentity);
        }
    });
}

function registerExternalWindow(identity, message) {
    const { name, uuid, hwnd } = message.payload;
    const childWindowOptions = { name, uuid, hwnd };
    const parent = coreState.getWindowByUuidName(uuid, uuid);
    const parentBw = parent && parent.browserWindow;
    const childBw = new BrowserWindow(childWindowOptions);

    electronApp.emit('child-window-created', parentBw.id, childBw.id, childWindowOptions);
}

function deregisterExternalWindow(identity, message) {
    const windowIdentity = apiProtocolBase.getTargetWindowIdentity(message.payload);
    ofEvents.emit(route.externalWindow('close', windowIdentity.uuid, windowIdentity.name));
}

function externalWindowAction(identity, message) {
    const { payload } = message;
    const { uuid, name } = payload;

    switch (payload.type) {
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
            const flags = payload.flags;

            ofEvents.emit(route.externalWindow('bounds-changed', uuid, name));

            // dispatch show and hide events
            /* jshint bitwise: false */
            if (flags & SetWindowPosition.SWP_SHOWWINDOW) {
                ofEvents.emit(route.externalWindow('visibility-changed', uuid, name), true);
            } else if (flags & SetWindowPosition.SWP_HIDEWINDOW) {
                ofEvents.emit(route.externalWindow('visibility-changed', uuid, name), false);
            }
            /* jshint bitwise: true */
            break;
        case WindowsMessages.WM_SYSCOMMAND:
            const commandType = payload.wParam;
            const stateChange = (
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
}

function registerCustomData(identity, message) {
    return new Promise((resolve, reject) => {
        Application.registerCustomData(getTargetAppId(message), message.payload.data, resolve, reject);
    });
}

function relaunchOnClose(identity, message) {
    return new Promise((resolve, reject) => {
        Application.scheduleRestart(getTargetAppId(message), resolve, reject);
    });
}
