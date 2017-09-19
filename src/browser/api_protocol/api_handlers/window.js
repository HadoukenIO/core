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
const getTargetWinId = message => apiProtocolBase.getTargetWindowIdentity(message.payload);
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

function windowAuthenticate(identity, message) {
    const { userName, password } = message.payload;
    Window.authenticate(getTargetWinId(message), userName, password, err => {
        if (err) {
            throw err;
        }
    });
}

function redirectWindowToUrl(identity, message) {
    const { targetUuid: uuid, targetName: name, url } = message.payload;
    const windowIdentity = { uuid, name };
    Window.navigate(windowIdentity, url);
}

function updateWindowOptions(identity, rawMessage) {
    const message = JSON.parse(JSON.stringify(rawMessage));
    Window.updateOptions(getTargetWinId(message), message.payload.options);
}

function stopFlashWindow(identity, message) {
    Window.stopFlashing(getTargetWinId(message));
}

function setWindowBounds(identity, message) {
    const { left, top, width, height } = message.payload;
    Window.setBounds(getTargetWinId(message), left, top, width, height);
}

function setWindowPreloadState(identity, message) {
    const windowIdentity = apiProtocolBase.getTargetWindowIdentity(identity);
    Window.setWindowPreloadState(windowIdentity, message.payload);
}

function setForegroundWindow(identity, message) {
    Window.setAsForeground(getTargetWinId(message));
}

function showAtWindow(identity, message) {
    const { left, top, force } = message.payload;
    Window.showAt(getTargetWinId(message), left, top, !!force);
}

function showMenu(identity, message) {
    const { x, y, editable, hasSelectedText } = message.payload;
    Window.showMenu(getTargetWinId(message), x, y, editable, hasSelectedText);
}

function showWindow(identity, message) {
    Window.show(getTargetWinId(message), !!message.payload.force);
}

function restoreWindow(identity, message) {
    Window.restore(getTargetWinId(message));
}

function resizeWindow(identity, message) {
    const { width, height, anchor } = message.payload;
    Window.resizeTo(getTargetWinId(message), width, height, anchor);
}

function resizeWindowBy(identity, message) {
    const { deltaWidth, deltaHeight, anchor } = message.payload;
    Window.resizeBy(getTargetWinId(message), deltaWidth, deltaHeight, anchor);
}

function undockWindow(identity, message) {
    //TODO:Figure out what this is supposed to do.
}

function moveWindow(identity, message) {
    const { left, top } = message.payload;
    Window.moveTo(getTargetWinId(message), left, top);
}

function moveWindowBy(identity, message) {
    const { deltaLeft, deltaTop } = message.payload;
    Window.moveBy(getTargetWinId(message), deltaLeft, deltaTop);
}

function navigateWindow(identity, message) {
    Window.navigate(getTargetWinId(message), message.payload.url);
}

function navigateWindowBack(identity, message) {
    Window.navigateBack(getTargetWinId(message));
}

function navigateWindowForward(identity, message) {
    Window.navigateForward(getTargetWinId(message));
}

function stopWindowNavigation(identity, message) {
    Window.stopNavigation(getTargetWinId(message));
}

function reloadWindow(identity, message) {
    Window.reload(getTargetWinId(message), !!message.payload.ignoreCache);
}

function minimizeWindow(identity, message) {
    Window.minimize(getTargetWinId(message));
}

function mergeWindowGroups(identity, message) {
    Window.mergeGroups(getTargetWinId(message), getGroupingWinId(message));
}

function maximizeWindow(identity, message) {
    Window.maximize(getTargetWinId(message));
}

function leaveWindowGroup(identity, message) {
    Window.leaveGroup(getTargetWinId(message));
}

function joinWindowGroup(identity, message) {
    Window.joinGroup(getTargetWinId(message), getGroupingWinId(message));
}

function isWindowShowing(identity, message) {
    return Window.isShowing(getTargetWinId(message));
}

function hideWindow(identity, message) {
    Window.hide(getTargetWinId(message));
}

function getWindowSnapshot(identity, message) {
    return new Promise((resolve, reject) => {
        Window.getSnapshot(getTargetWinId(message), (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

function getWindowState(identity, message) {
    return Window.getState(getTargetWinId(message));
}

function getWindowOptions(identity, message) {
    return Window.getOptions(getTargetWinId(message));
}

function getCurrentWindowOptions(identity, message) {
    return Window.getOptions(identity);
}

function getWindowInfo(identity, message) {
    return Window.getWindowInfo(getTargetWinId(message));
}

function getWindowNativeId(identity, message) {
    return Window.getNativeId(getTargetWinId(message));
}

function getWindowGroup(identity, message) {
    // NOTE: the Window API returns a wrapped window with 'name' as a member,
    // while the adaptor expects it to be 'windowName'
    return Window.getGroup(getTargetWinId(message)).map(window => {
        const windowName = window.name;
        if (message.payload.crossApp === true) {
            return Object.assign({}, window, { windowName });
        } else {
            return windowName; // backwards compatible
        }
    });
}

function getWindowBounds(identity, message) {
    return Window.getBounds(getTargetWinId(message));
}

function focusWindow(identity, message) {
    Window.focus(getTargetWinId(message));
}

function flashWindow(identity, message) {
    Window.flash(getTargetWinId(message));
}

function enableWindowFrame(identity, message) {
    Window.enableFrame(getTargetWinId(message));
}

function executeJavascript(identity, message, ack, nack) {
    let pUuid = getTargetWinId(message).uuid;

    while (pUuid) {
        if (pUuid === identity.uuid) {
            return new Promise((resolve, reject) => {
                Window.executeJavascript(getTargetWinId(message), message.payload.code, (err, result) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(result);
                    }
                });
            });
        }
        pUuid = Application.getParentApplication({
            uuid: pUuid
        });
    }

    return Promise.reject(new Error('Rejected, target window is not owned by requesting identity'));
}

function disableWindowFrame(identity, message) {
    Window.disableFrame(getTargetWinId(message));
}

function windowEmbedded(identity, message) {
    const { payload } = message;

    // Ensure expected shape for getTargetWindowIdentity (called by getWinId)
    payload.uuid = payload.targetUuid;

    Window.embed(getTargetWinId(message), `0x${payload.parentHwnd}`);
}

function closeWindow(identity, message) {
    return new Promise(resolve => {
        Window.close(getTargetWinId(message), !!message.payload.force, resolve);
    });
}

function bringWindowToFront(identity, message) {
    Window.bringToFront(getTargetWinId(message));
}

function blurWindow(identity, message) {
    Window.blur(getTargetWinId(message));
}

function animateWindow(identity, message) {
    return new Promise(resolve => {
        const { transitions, options } = message.payload;
        Window.animate(getTargetWinId(message), transitions, options, resolve);
    });
}

function dockWindow(identity, message) {
    //Pending runtime.
}

function windowExists(identity, message) {
    return Window.exists(getTargetWinId(message));
}

function getCachedBounds(identity, message) {
    return new Promise((resolve, reject) => {
        Window.getBoundsFromDisk(getTargetWinId(message), resolve, reject);
    });
}

function getZoomLevel(identity, message) {
    return new Promise(resolve => {
        Window.getZoomLevel(getTargetWinId(message), resolve);
    });
}

function setZoomLevel(identity, message) {
    Window.setZoomLevel(getTargetWinId(message), message.payload.level);
}
