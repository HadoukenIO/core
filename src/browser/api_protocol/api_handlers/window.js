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

const apiProtocolBase = require('./api_protocol_base');
const Window = require('../../api/window').Window;
const Application = require('../../api/application').Application;

// some local sugar
const successAck = { success: true };
const dataAck = data => Object.assign({ data }, successAck);
const getWinId = message => apiProtocolBase.getTargetWindowIdentity(message.payload);
const getGroupingWinId = message => apiProtocolBase.getGroupingWindowIdentity(message.payload);

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
    'window-embedded': windowEmbedded,
    'window-exists': windowExists,
    'window-get-cached-bounds': getCachedBounds,
    'window-authenticate': windowAuthenticate
};

module.exports.init = function() {
    apiProtocolBase.registerActionMap(module.exports.windowApiMap, 'Window');
};

function windowAuthenticate(identity, message, ack, nack) {
    const { userName, password } = message.payload;
    Window.authenticate(getWinId(message), userName, password, err => {
        if (err) {
            nack(err);
        } else {
            ack(successAck);
        }
    });
}

function redirectWindowToUrl(identity, message, ack) {
    const { targetUuid: uuid, targetName: name, url } = message.payload;
    const windowIdentity = { uuid, name };
    Window.navigate(windowIdentity, url);
    ack(successAck);
}

function updateWindowOptions(identity, rawMessage, ack) {
    const message = JSON.parse(JSON.stringify(rawMessage));
    Window.updateOptions(getWinId(message), message.payload.options);
    ack(successAck);
}

function stopFlashWindow(identity, message, ack) {
    Window.stopFlashing(getWinId(message));
    ack(successAck);
}

function setWindowBounds(identity, message, ack) {
    const { left, top, width, height } = message.payload;
    Window.setBounds(getWinId(message), left, top, width, height);
    ack(successAck);
}

function setWindowPreloadState(identity, message, ack) {
    const windowIdentity = apiProtocolBase.getTargetWindowIdentity(identity);
    Window.setWindowPreloadState(windowIdentity, message.payload);
    ack(successAck);
}

function setForegroundWindow(identity, message, ack) {
    Window.setAsForeground(getWinId(message));
    ack(successAck);
}

function showAtWindow(identity, message, ack) {
    const { left, top, force } = message.payload;
    Window.showAt(getWinId(message), left, top, !!force);
    ack(successAck);
}

function showMenu(identity, message, ack) {
    const { x, y, editable, hasSelectedText } = message.payload;
    Window.showMenu(getWinId(message), x, y, editable, hasSelectedText);
    ack(successAck);
}

function showWindow(identity, message, ack) {
    Window.show(getWinId(message), !!message.payload.force);
    ack(successAck);
}

function restoreWindow(identity, message, ack) {
    Window.restore(getWinId(message));
    ack(successAck);
}

function resizeWindow(identity, message, ack) {
    const { width, height, anchor } = message.payload;
    Window.resizeTo(getWinId(message), width, height, anchor);
    ack(successAck);
}

function resizeWindowBy(identity, message, ack) {
    const { deltaWidth, deltaHeight, anchor } = message.payload;
    Window.resizeBy(getWinId(message), deltaWidth, deltaHeight, anchor);
    ack(successAck);
}

function undockWindow(identity, message, ack) {
    //TODO:Figure out what this is supposed to do.
    ack(successAck);
}

function moveWindow(identity, message, ack) {
    const { left, top } = message.payload;
    Window.moveTo(getWinId(message), left, top);
    ack(successAck);
}

function moveWindowBy(identity, message, ack) {
    const { deltaLeft, deltaTop } = message.payload;
    Window.moveBy(getWinId(message), deltaLeft, deltaTop);
    ack(successAck);
}

function navigateWindow(identity, message, ack) {
    Window.navigate(getWinId(message), message.payload.url);
    ack(successAck);
}

function navigateWindowBack(identity, message, ack) {
    Window.navigateBack(getWinId(message));
    ack(successAck);
}

function navigateWindowForward(identity, message, ack) {
    Window.navigateForward(getWinId(message));
    ack(successAck);
}

function stopWindowNavigation(identity, message, ack) {
    Window.stopNavigation(getWinId(message));
    ack(successAck);
}

function reloadWindow(identity, message, ack) {
    Window.reload(getWinId(message), !!message.payload.ignoreCache);
    ack(successAck);
}

function minimizeWindow(identity, message, ack) {
    Window.minimize(getWinId(message));
    ack(successAck);
}

function mergeWindowGroups(identity, message, ack) {
    Window.mergeGroups(getWinId(message), getGroupingWinId(message));
    ack(successAck);
}

function maximizeWindow(identity, message, ack) {
    Window.maximize(getWinId(message));
    ack(successAck);
}

function leaveWindowGroup(identity, message, ack) {
    Window.leaveGroup(getWinId(message));
    ack(successAck);
}

function joinWindowGroup(identity, message, ack) {
    Window.joinGroup(getWinId(message), getGroupingWinId(message));
    ack(successAck);
}

function isWindowShowing(identity, message, ack) {
    ack(dataAck(Window.isShowing(getWinId(message))));
}

function hideWindow(identity, message, ack) {
    Window.hide(getWinId(message));
    ack(successAck);
}

function getWindowSnapshot(identity, message, ack) {
    Window.getSnapshot(getWinId(message), (err, result) => {
        if (err) {
            throw err; //todo: why not using nack?
        } else {
            ack(dataAck(result));
        }
    });
}

function getWindowState(identity, message, ack) {
    ack(dataAck(Window.getState(getWinId(message))));
}

function getWindowOptions(identity, message, ack) {
    ack(dataAck(Window.getOptions(getWinId(message))));
}

function getCurrentWindowOptions(identity, message, ack) {
    ack(dataAck(Window.getOptions(identity)));
}

function getWindowInfo(identity, message, ack) {
    ack(dataAck(Window.getWindowInfo(getWinId(message))));
}

function getWindowNativeId(identity, message, ack) {
    ack(dataAck(Window.getNativeId(getWinId(message))));
}

function getWindowGroup(identity, message, ack) {
    // NOTE: the Window API returns a wrapped window with 'name' as a member,
    // while the adaptor expects it to be 'windowName'
    ack(dataAck(Window.getGroup(getWinId(message)).map(window => {
        const windowName = window.name;
        if (message.payload.crossApp === true) {
            return Object.assign({}, window, { windowName });
        } else {
            return windowName; // backwards compatible
        }
    })));
}

function getWindowBounds(identity, message, ack) {
    ack(dataAck(Window.getBounds(getWinId(message))));
}

function focusWindow(identity, message, ack) {
    Window.focus(getWinId(message));
    ack(successAck);
}

function flashWindow(identity, message, ack) {
    Window.flash(getWinId(message));
    ack(successAck);
}

function enableWindowFrame(identity, message, ack) {
    Window.enableFrame(getWinId(message));
    ack(successAck);
}

function executeJavascript(identity, message, ack, nack) {
    let pUuid = getWinId(message).uuid;

    while (pUuid) {
        if (pUuid === identity.uuid) {
            return Window.executeJavascript(getWinId(message), message.payload.code, (err, result) => {
                if (err) {
                    nack(err);
                } else {
                    ack(dataAck(result));
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
    Window.disableFrame(getWinId(message));
    ack(successAck);
}

function windowEmbedded(identity, message, ack) {
    const { payload } = message;

    // Ensure expected shape for getTargetWindowIdentity (called by getWinId)
    payload.uuid = payload.targetUuid;

    Window.embed(getWinId(message), `0x${payload.parentHwnd}`);
    ack(successAck);
}

function closeWindow(identity, message, ack) {
    Window.close(getWinId(message), !!message.payload.force, () => {
        ack(successAck);
    });
}

function bringWindowToFront(identity, message, ack) {
    Window.bringToFront(getWinId(message));
    ack(successAck);
}

function blurWindow(identity, message, ack) {
    Window.blur(getWinId(message));
    ack(successAck);
}

function animateWindow(identity, message, ack) {
    const { transitions, options } = message.payload;
    Window.animate(getWinId(message), transitions, options, () => { ack(successAck); });
}

function dockWindow(identity, message, ack) {
    //Pending runtime.
    ack(successAck);
}

function windowExists(identity, message, ack) {
    ack(dataAck(Window.exists(getWinId(message))));
}

function getCachedBounds(identity, message, ack, nack) {
    Window.getBoundsFromDisk(getWinId(message), data => {
        ack(dataAck(data));
    }, nack);
}

function getZoomLevel(identity, message, ack) {
    Window.getZoomLevel(getWinId(message), result => {
        ack(dataAck(result));
    });
}

function setZoomLevel(identity, message, ack) {
    Window.setZoomLevel(getWinId(message), message.payload.level);
    ack(successAck);
}
