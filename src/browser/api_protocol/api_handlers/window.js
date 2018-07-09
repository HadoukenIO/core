/*
Copyright 2018 OpenFin Inc.

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

const apiProtocolBase = require('./api_protocol_base');
const Window = require('../../api/window').Window;
const Application = require('../../api/application').Application;
const _ = require('underscore');

let successAck = {
    success: true
};

module.exports.windowApiMap = {
    'animate-window': animateWindow,
    'blur-window': blurWindow,
    'bring-window-to-front': bringWindowToFront,
    'close-window': closeWindow,
    'disable-window-frame': disableWindowFrame,
    'dock-window': dockWindow,
    'enable-window-frame': enableWindowFrame,
    'execute-javascript-in-window': { apiFunc: executeJavascript, apiPath: '.executeJavaScript' },
    'flash-window': flashWindow,
    'focus-window': focusWindow,
    'get-current-window-options': getCurrentWindowOptions,
    'get-all-frames': getAllFrames,
    'get-window-bounds': getWindowBounds,
    'get-window-group': getWindowGroup,
    'get-window-info': getWindowInfo,
    'get-window-native-id': { apiFunc: getWindowNativeId, apiPath: '.getNativeId' },
    'get-window-options': getWindowOptions,
    'get-window-snapshot': { apiFunc: getWindowSnapshot, apiPath: '.getSnapshot' },
    'get-window-state': getWindowState,
    'get-zoom-level': getZoomLevel,
    'hide-window': hideWindow,
    'is-window-showing': isWindowShowing,
    'join-window-group': joinWindowGroup,
    'leave-window-group': leaveWindowGroup,
    'maximize-window': maximizeWindow,
    'merge-window-groups': mergeWindowGroups,
    'minimize-window': minimizeWindow,
    'move-window': moveWindow,
    'move-window-by': moveWindowBy,
    'navigate-window': navigateWindow,
    'navigate-window-back': navigateWindowBack,
    'navigate-window-forward': navigateWindowForward,
    'stop-window-navigation': stopWindowNavigation,
    'register-window-name': registerWindowName,
    'reload-window': reloadWindow,
    'redirect-window-to-url': redirectWindowToUrl, // Deprecated
    'resize-window': resizeWindow,
    'resize-window-by': resizeWindowBy,
    'restore-window': restoreWindow,
    'show-menu': showMenu,
    'show-window': showWindow,
    'set-foreground-window': setForegroundWindow,
    'set-window-bounds': setWindowBounds,
    'set-window-preload-state': setWindowPreloadState,
    'set-zoom-level': setZoomLevel,
    'show-at-window': showAtWindow,
    'stop-flash-window': stopFlashWindow,
    'undock-window': undockWindow,
    'update-window-options': updateWindowOptions,
    'window-authenticate': windowAuthenticate,
    'window-embedded': windowEmbedded,
    'window-exists': windowExists,
    'window-get-cached-bounds': getCachedBounds
};

module.exports.init = function() {
    apiProtocolBase.registerActionMap(module.exports.windowApiMap, 'Window');
};

function windowAuthenticate(identity, message, ack, nack) {
    let payload = message.payload,
        { userName, password } = payload;

    let windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    Window.authenticate(windowIdentity, userName, password, err => {
        if (!err) {
            ack(successAck);
        } else {
            nack(err);
        }
    });
}

function redirectWindowToUrl(identity, message, ack) {
    var payload = message.payload,
        windowIdentity = {
            uuid: payload.targetUuid,
            name: payload.targetName
        };

    Window.navigate(windowIdentity, payload.url);
    ack(successAck);
}

function updateWindowOptions(identity, rawMessage, ack) {
    let message = JSON.parse(JSON.stringify(rawMessage));
    let payload = message.payload;
    let windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    Window.updateOptions(windowIdentity, payload.options);
    ack(successAck);
}

function stopFlashWindow(identity, message, ack) {
    var payload = message.payload,
        windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    Window.stopFlashing(windowIdentity);
    ack(successAck);
}

function setWindowBounds(identity, message, ack) {
    var payload = message.payload,
        windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    Window.setBounds(windowIdentity, payload.left, payload.top, payload.width, payload.height);
    ack(successAck);
}

function setWindowPreloadState(identity, message, ack) {
    const payload = message.payload;
    const windowIdentity = apiProtocolBase.getTargetWindowIdentity(identity);

    Window.setWindowPreloadState(windowIdentity, payload);
    ack();
}

function setForegroundWindow(identity, message, ack) {
    var payload = message.payload,
        windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    Window.setAsForeground(windowIdentity);
    ack(successAck);
}

function showAtWindow(identity, message, ack) {
    let payload = message.payload;
    let windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);
    let force = !!payload.force;

    Window.showAt(windowIdentity, payload.left, payload.top, force);
    ack(successAck);
}

function showMenu(identity, message, ack) {
    var payload = message.payload;
    var windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    Window.showMenu(windowIdentity, payload.x, payload.y, payload.editable, payload.hasSelectedText);
    ack(successAck);
}

function showWindow(identity, message, ack) {
    let payload = message.payload;
    let windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);
    let force = !!payload.force;

    Window.show(windowIdentity, force);
    ack(successAck);
}

function restoreWindow(identity, message, ack) {
    var payload = message.payload,
        windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    Window.restore(windowIdentity);
    ack(successAck);
}

function resizeWindow(identity, message, ack) {
    var payload = message.payload,
        windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    Window.resizeTo(windowIdentity, payload.width, payload.height, payload.anchor);
    ack(successAck);
}

function resizeWindowBy(identity, message, ack) {
    var payload = message.payload,
        windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    Window.resizeBy(windowIdentity, payload.deltaWidth, payload.deltaHeight, payload.anchor);
    ack(successAck);
}

function undockWindow(identity, message, ack) {
    //TODO:Figure out what this is suposed to do.
    ack(successAck);
}

function moveWindow(identity, message, ack) {
    var payload = message.payload,
        windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    Window.moveTo(windowIdentity, payload.left, payload.top);
    ack(successAck);
}

function moveWindowBy(identity, message, ack) {
    var payload = message.payload,
        windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    Window.moveBy(windowIdentity, payload.deltaLeft, payload.deltaTop);
    ack(successAck);
}

function navigateWindow(identity, message, ack) {
    let payload = message.payload;
    let windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);
    let url = payload.url;

    Window.navigate(windowIdentity, url);
    ack(successAck);
}

function navigateWindowBack(identity, message, ack) {
    let payload = message.payload;
    let windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    Window.navigateBack(windowIdentity);
    ack(successAck);
}

function navigateWindowForward(identity, message, ack) {
    let payload = message.payload;
    let windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    Window.navigateForward(windowIdentity);
    ack(successAck);
}

function stopWindowNavigation(identity, message, ack) {
    let payload = message.payload;
    let windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    Window.stopNavigation(windowIdentity);
    ack(successAck);
}

function reloadWindow(identity, message, ack) {
    let payload = message.payload;
    let windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);
    let ignoreCache = !!payload.ignoreCache;

    Window.reload(windowIdentity, ignoreCache);
    ack(successAck);
}

function minimizeWindow(identity, message, ack) {
    var payload = message.payload,
        windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    Window.minimize(windowIdentity);
    ack(successAck);
}

function mergeWindowGroups(identity, message, ack) {
    var payload = message.payload,
        windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload),
        groupingIdentity = apiProtocolBase.getGroupingWindowIdentity(payload);

    Window.mergeGroups(windowIdentity, groupingIdentity);
    ack(successAck);
}

function maximizeWindow(identity, message, ack) {
    var payload = message.payload,
        windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    Window.maximize(windowIdentity);
    ack(successAck);
}

function leaveWindowGroup(identity, message, ack) {
    var payload = message.payload,
        windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    Window.leaveGroup(windowIdentity);
    ack(successAck);
}

function joinWindowGroup(identity, message, ack) {
    var payload = message.payload,
        windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload),
        groupingIdentity = apiProtocolBase.getGroupingWindowIdentity(payload);

    Window.joinGroup(windowIdentity, groupingIdentity);
    ack(successAck);
}

function isWindowShowing(identity, message, ack) {
    var payload = message.payload,
        dataAck = _.clone(successAck),
        windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    dataAck.data = Window.isShowing(windowIdentity);
    ack(dataAck);
}

function hideWindow(identity, message, ack) {
    var payload = message.payload,
        windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    Window.hide(windowIdentity);
    ack(successAck);
}


function getAllFrames(identity, message) {
    const { payload } = message;
    const windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    return Window.getAllFrames(windowIdentity);
}

function getWindowSnapshot(identity, message, ack) {
    var payload = message.payload,
        windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    Window.getSnapshot(windowIdentity, (err, result) => {
        if (err) {
            throw err;
        } else {
            let dataAck = _.clone(successAck);
            dataAck.data = result;
            ack(dataAck);
        }
    });
}

function getWindowState(identity, message, ack) {
    var payload = message.payload,
        dataAck = _.clone(successAck),
        windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    dataAck.data = Window.getState(windowIdentity);
    ack(dataAck);
}

function getWindowOptions(identity, message, ack) {
    var payload = message.payload,
        dataAck = _.clone(successAck),
        windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    dataAck.data = Window.getOptions(windowIdentity);
    ack(dataAck);
}

function getCurrentWindowOptions(identity, message, ack) {
    let dataAck = _.clone(successAck);

    dataAck.data = Window.getOptions(identity);
    ack(dataAck);
}

function getWindowInfo(identity, message, ack) {
    var payload = message.payload,
        dataAck = _.clone(successAck),
        windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    dataAck.data = Window.getWindowInfo(windowIdentity);
    ack(dataAck);
}

function getWindowNativeId(identity, message, ack) {
    var payload = message.payload,
        dataAck = _.clone(successAck),
        windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    dataAck.data = Window.getNativeId(windowIdentity);
    ack(dataAck);
}

function getWindowGroup(identity, message, ack) {
    var payload = message.payload,
        dataAck = _.clone(successAck),
        windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    // NOTE: the Window API returns a wrapped window with 'name' as a member,
    // while the adaptor expects it to be 'windowName'
    dataAck.data = _.map(Window.getGroup(windowIdentity), (window) => {
        if (payload.crossApp === true) {
            return { uuid: window.uuid, name: window.name, windowName: window.name };
        } else {
            return window.name; // backwards compatible
        }
    });
    ack(dataAck);
}

function getWindowBounds(identity, message, ack) {
    var payload = message.payload,
        dataAck = _.clone(successAck),
        windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    dataAck.data = Window.getBounds(windowIdentity);
    ack(dataAck);
}

function focusWindow(identity, message, ack) {
    var payload = message.payload,
        windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    Window.focus(windowIdentity);
    ack(successAck);
}

function flashWindow(identity, message, ack) {
    var payload = message.payload,
        windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    Window.flash(windowIdentity);
    ack(successAck);
}

function enableWindowFrame(identity, message, ack) {
    var payload = message.payload,
        windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    Window.enableFrame(windowIdentity);
    ack(successAck);
}

function executeJavascript(identity, message, ack, nack) {
    let payload = message.payload;
    let windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);
    let pUuid = windowIdentity.uuid;

    while (pUuid) {
        if (pUuid === identity.uuid) {
            return Window.executeJavascript(windowIdentity, payload.code, (err, result) => {
                if (err) {
                    nack(err);
                } else {
                    let dataAck = _.clone(successAck);
                    dataAck.data = result;
                    ack(dataAck);
                }
            });
        }
        pUuid = Application.getParentApplication({
            uuid: pUuid
        });

    }
    return nack(new Error('Rejected, target window is not owned by requesting identity'));
}

function disableWindowFrame(identity, message, ack) {
    var payload = message.payload,
        windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    Window.disableFrame(identity, windowIdentity);
    ack(successAck);
}

function windowEmbedded(identity, message, ack) {
    let payload = message.payload;
    // Ensure expected shape for identity utility compliance
    payload.uuid = payload.targetUuid;

    let windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);
    Window.embed(windowIdentity, `0x${payload.parentHwnd}`);
    ack(successAck);
}

function closeWindow(identity, message, ack) {
    let payload = message.payload;
    let windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);
    let force = !!payload.force;

    Window.close(windowIdentity, force, () => {
        ack(successAck);
    });
}

function bringWindowToFront(identity, message, ack) {
    var payload = message.payload,
        windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    Window.bringToFront(windowIdentity);
    ack(successAck);
}

function blurWindow(identity, message, ack) {
    var payload = message.payload,
        windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    Window.blur(windowIdentity);
    ack(successAck);
}

function animateWindow(identity, message, ack) {
    let windowIdentity = apiProtocolBase.getTargetWindowIdentity(message.payload);
    let transitions = message.payload.transitions;
    let options = message.payload.options;

    Window.animate(windowIdentity, transitions, options, () => {
        ack(successAck);
    });
}

function dockWindow(identity, message, ack) {
    //Pending runtime.
    ack(successAck);
}

function windowExists(identity, message, ack) {
    let windowIdentity = apiProtocolBase.getTargetWindowIdentity(message.payload);
    let dataAck = _.clone(successAck);

    dataAck.data = Window.exists(windowIdentity);
    ack(dataAck);
}

function getCachedBounds(identity, message, ack, nack) {
    let payload = message.payload;
    let windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);
    let dataAck = _.clone(successAck);

    Window.getBoundsFromDisk(windowIdentity, data => {
        dataAck.data = data;
        ack(dataAck);
    }, nack);
}

function getZoomLevel(identity, message, ack) {
    let payload = message.payload;
    let windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    Window.getZoomLevel(windowIdentity, result => {
        let dataAck = _.clone(successAck);
        dataAck.data = result;
        ack(dataAck);
    });
}

function setZoomLevel(identity, message, ack) {
    let payload = message.payload;
    let windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);
    let level = payload.level;

    Window.setZoomLevel(windowIdentity, level);
    ack(successAck);
}

function registerWindowName(identity, message, ack) {
    const payload = message.payload;
    const windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);

    Window.registerWindowName(windowIdentity);
    ack(successAck);
}
