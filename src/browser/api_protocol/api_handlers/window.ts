
const { Application } = require('../../api/application');
const { Window } = require('../../api/window');
import {
    getGroupingWindowIdentity,
    getTargetWindowIdentity,
    registerActionMap
} from './api_protocol_base';
import {
    Acker,
    APIMessage,
    APIPayloadAck,
    FrameInfo,
    Identity,
    Nacker,
    SavedDiskBounds
} from '../../../shapes';

const successAck: APIPayloadAck = { success: true };

export const windowApiMap = {
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

export function init() {
    registerActionMap(windowApiMap, 'Window');
}

function windowAuthenticate(identity: Identity, message: APIMessage, ack: Acker, nack: (error: Error) => void): void {
    const { payload } = message;
    const { userName, password } = payload;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.authenticate(windowIdentity, userName, password, (err: Error) => {
        if (!err) {
            ack(successAck);
        } else {
            nack(err); // TODO: this nack doesn't follow the protocol
        }
    });
}

function redirectWindowToUrl(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const { targetUuid: uuid, targetName: name, url } = payload;
    const windowIdentity = { uuid, name };

    Window.navigate(windowIdentity, url);
    ack(successAck);
}

function updateWindowOptions(identity: Identity, rawMessage: APIMessage, ack: Acker): void {
    const message = JSON.parse(JSON.stringify(rawMessage));
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.updateOptions(windowIdentity, payload.options);
    ack(successAck);
}

function stopFlashWindow(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.stopFlashing(windowIdentity);
    ack(successAck);
}

function setWindowBounds(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const { top, left, width, height } = payload;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.setBounds(windowIdentity, left, top, width, height);
    ack(successAck);
}

function setWindowPreloadState(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(identity);

    Window.setWindowPreloadState(windowIdentity, payload);
    ack(successAck);
}

function setForegroundWindow(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.setAsForeground(windowIdentity);
    ack(successAck);
}

function showAtWindow(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const { force, left, top } = payload;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.showAt(windowIdentity, left, top, force);
    ack(successAck);
}

function showMenu(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const { x, y, editable, hasSelectedText } = payload;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.showMenu(windowIdentity, x, y, editable, hasSelectedText);
    ack(successAck);
}

function showWindow(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const { force } = payload;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.show(windowIdentity, force);
    ack(successAck);
}

function restoreWindow(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.restore(windowIdentity);
    ack(successAck);
}

function resizeWindow(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const { width, height, anchor } = payload;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.resizeTo(windowIdentity, width, height, anchor);
    ack(successAck);
}

function resizeWindowBy(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const { deltaHeight, deltaWidth, anchor } = payload;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.resizeBy(windowIdentity, deltaWidth, deltaHeight, anchor);
    ack(successAck);
}

function undockWindow(identity: Identity, message: APIMessage, ack: Acker): void {
    // TODO: Figure out what this is suposed to do.
    ack(successAck);
}

function moveWindow(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const { top, left } = payload;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.moveTo(windowIdentity, left, top);
    ack(successAck);
}

function moveWindowBy(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const { deltaTop, deltaLeft } = payload;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.moveBy(windowIdentity, deltaLeft, deltaTop);
    ack(successAck);
}

function navigateWindow(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const { url } = payload;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.navigate(windowIdentity, url);
    ack(successAck);
}

function navigateWindowBack(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.navigateBack(windowIdentity);
    ack(successAck);
}

function navigateWindowForward(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.navigateForward(windowIdentity);
    ack(successAck);
}

function stopWindowNavigation(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.stopNavigation(windowIdentity);
    ack(successAck);
}

function reloadWindow(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const { ignoreCache } = payload;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.reload(windowIdentity, ignoreCache);
    ack(successAck);
}

function minimizeWindow(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.minimize(windowIdentity);
    ack(successAck);
}

function mergeWindowGroups(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);
    const groupingIdentity = getGroupingWindowIdentity(payload);

    Window.mergeGroups(windowIdentity, groupingIdentity);
    ack(successAck);
}

function maximizeWindow(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.maximize(windowIdentity);
    ack(successAck);
}

function leaveWindowGroup(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.leaveGroup(windowIdentity);
    ack(successAck);
}

function joinWindowGroup(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);
    const groupingIdentity = getGroupingWindowIdentity(payload);

    Window.joinGroup(windowIdentity, groupingIdentity);
    ack(successAck);
}

function isWindowShowing(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const dataAck = Object.assign({}, successAck);
    const windowIdentity = getTargetWindowIdentity(payload);

    dataAck.data = Window.isShowing(windowIdentity);
    ack(dataAck);
}

function hideWindow(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.hide(windowIdentity);
    ack(successAck);
}

function getAllFrames(identity: Identity, message: APIMessage): FrameInfo[] {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);

    return Window.getAllFrames(windowIdentity);
}

function getWindowSnapshot(identity: Identity, message: APIMessage): Promise<string> {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);
    return Window.getSnapshot({ identity: windowIdentity, payload });
}

function getWindowState(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const dataAck = Object.assign({}, successAck);
    const windowIdentity = getTargetWindowIdentity(payload);

    dataAck.data = Window.getState(windowIdentity);
    ack(dataAck);
}

function getWindowOptions(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const dataAck = Object.assign({}, successAck);
    const windowIdentity = getTargetWindowIdentity(payload);

    dataAck.data = Window.getOptions(windowIdentity);
    ack(dataAck);
}

function getCurrentWindowOptions(identity: Identity, message: APIMessage, ack: Acker): void {
    const dataAck = Object.assign({}, successAck);

    dataAck.data = Window.getOptions(identity);
    ack(dataAck);
}

function getWindowInfo(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const dataAck = Object.assign({}, successAck);
    const windowIdentity = getTargetWindowIdentity(payload);

    dataAck.data = Window.getWindowInfo(windowIdentity);
    ack(dataAck);
}

function getWindowNativeId(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const dataAck = Object.assign({}, successAck);
    const windowIdentity = getTargetWindowIdentity(payload);

    dataAck.data = Window.getNativeId(windowIdentity);
    ack(dataAck);
}

function getWindowGroup(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const { crossApp } = payload;
    const dataAck = Object.assign({}, successAck);
    const windowIdentity = getTargetWindowIdentity(payload);
    const windowGroup = Window.getGroup(windowIdentity);

    // NOTE: the Window API returns a wrapped window with 'name' as a member,
    // while the adaptor expects it to be 'windowName'
    dataAck.data = windowGroup.map((window: Identity) => {
        if (crossApp === true) {
            return { uuid: window.uuid, name: window.name, windowName: window.name };
        } else {
            return window.name; // backwards compatible
        }
    });
    ack(dataAck);
}

function getWindowBounds(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const dataAck = Object.assign({}, successAck);
    const windowIdentity = getTargetWindowIdentity(payload);

    dataAck.data = Window.getBounds(windowIdentity);
    ack(dataAck);
}

function focusWindow(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.focus(windowIdentity);
    ack(successAck);
}

function flashWindow(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.flash(windowIdentity);
    ack(successAck);
}

function enableWindowFrame(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.enableFrame(windowIdentity);
    ack(successAck);
}

function executeJavascript(identity: Identity, message: APIMessage, ack: Acker, nack: (error: Error) => void): void {
    const { payload } = message;
    const { code } = payload;
    const dataAck = Object.assign({}, successAck);
    const windowIdentity = getTargetWindowIdentity(payload);
    let { uuid: pUuid } = windowIdentity;

    while (pUuid) {
        if (pUuid === identity.uuid) {
            return Window.executeJavascript(windowIdentity, code, (err: Error, result: any) => {
                if (err) {
                    nack(err); // TODO: this nack doesn't follow the protocol
                } else {
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

function disableWindowFrame(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.disableFrame(identity, windowIdentity);
    ack(successAck);
}

function windowEmbedded(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    payload.uuid = payload.targetUuid; // Ensure expected shape for identity utility compliance
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.embed(windowIdentity, `0x${payload.parentHwnd}`);
    ack(successAck);
}

function closeWindow(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const { force } = payload;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.close(windowIdentity, force, () => {
        ack(successAck);
    });
}

function bringWindowToFront(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.bringToFront(windowIdentity);
    ack(successAck);
}

function blurWindow(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.blur(windowIdentity);
    ack(successAck);
}

function animateWindow(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const { options, transitions } = payload;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.animate(windowIdentity, transitions, options, () => {
        ack(successAck);
    });
}

function dockWindow(identity: Identity, message: APIMessage, ack: Acker): void {
    // Pending runtime
    ack(successAck);
}

function windowExists(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const dataAck = Object.assign({}, successAck);
    const windowIdentity = getTargetWindowIdentity(payload);

    dataAck.data = Window.exists(windowIdentity);
    ack(dataAck);
}

function getCachedBounds(identity: Identity, message: APIMessage, ack: Acker, nack: Nacker): void {
    const { payload } = message;
    const dataAck = Object.assign({}, successAck);
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.getBoundsFromDisk(windowIdentity, (data: SavedDiskBounds) => {
        dataAck.data = data;
        ack(dataAck);
    }, nack);
}

function getZoomLevel(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const dataAck = Object.assign({}, successAck);
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.getZoomLevel(windowIdentity, (result: number) => {
        dataAck.data = result;
        ack(dataAck);
    });
}

function setZoomLevel(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const { level } = payload;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.setZoomLevel(windowIdentity, level);
    ack(successAck);
}

function registerWindowName(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.registerWindowName(windowIdentity);
    ack(successAck);
}
