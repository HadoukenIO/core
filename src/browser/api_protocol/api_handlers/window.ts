
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
    SavedDiskBounds,
    GroupWindow
} from '../../../shapes';
import { ActionSpecMap } from '../shapes';
import {hijackMovesForGroupedWindows} from './grouped_window_moves';
import { argo } from '../../core_state';
import { System } from '../../api/system';

const successAck: APIPayloadAck = { success: true };

export const windowApiMap = {
    'animate-window': animateWindow,
    'blur-window': blurWindow,
    'bring-window-to-front': bringWindowToFront,
    'center-window': centerWindow,
    'close-window': closeWindow,
    'disable-window-frame': disableUserMovement,
    'dock-window': dockWindow,
    'enable-window-frame': enableUserMovement,
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
    'hide-window': hideWindow,
    'is-window-showing': isWindowShowing,
    'join-window-group': joinWindowGroup,
    'leave-window-group': leaveWindowGroup,
    'maximize-window': maximizeWindow,
    'merge-window-groups': mergeWindowGroups,
    'minimize-window': minimizeWindow,
    'move-window': moveWindow,
    'move-window-by': moveWindowBy,
    'register-window-name': registerWindowName,
    'redirect-window-to-url': redirectWindowToUrl, // Deprecated
    'resize-window': resizeWindow,
    'resize-window-by': resizeWindowBy,
    'restore-window': restoreWindow,
    'show-menu': showMenu,
    'show-window': showWindow,
    'set-foreground-window': setForegroundWindow,
    'set-window-bounds': setWindowBounds,
    'show-at-window': showAtWindow,
    'stop-flash-window': stopFlashWindow,
    'undock-window': undockWindow,
    'update-window-options': updateWindowOptions,
    'window-authenticate': windowAuthenticate,
    'window-embedded': windowEmbedded,
    'window-exists': windowExists,
    'window-get-views': getViews,
    'window-get-cached-bounds': getCachedBounds
};

export function init() {
    const registerThis = !argo['use-legacy-window-groups']
       ? hijackMovesForGroupedWindows(windowApiMap)
       : windowApiMap;
    registerActionMap(registerThis, 'Window');
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

function setWindowBounds(identity: Identity, message: APIMessage, ack: Acker, nack: Nacker): void {
    const { payload } = message;
    const { top, left, width, height } = payload;
    const {uuid, name} = getTargetWindowIdentity(payload);
    Window.setBounds({ uuid, name }, left, top, width, height, () => ack(successAck), nack);
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

function resizeWindow(identity: Identity, message: APIMessage, ack: Acker, nack: Nacker): void {
    const { payload } = message;
    const { width, height, anchor } = payload;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.resizeTo(windowIdentity, width, height, anchor, () => ack(successAck), nack);
}

function resizeWindowBy(identity: Identity, message: APIMessage, ack: Acker, nack: Nacker): void {
    const { payload } = message;
    const { deltaHeight, deltaWidth, anchor } = payload;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.resizeBy(windowIdentity, deltaWidth, deltaHeight, anchor, () => ack(successAck), nack);
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

function minimizeWindow(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.minimize(windowIdentity);
    ack(successAck);
}

function mergeWindowGroups(identity: Identity, message: APIMessage, ack: Acker): Promise<void> {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);
    const groupingIdentity = getGroupingWindowIdentity(payload);

    return Window.mergeGroups(windowIdentity, groupingIdentity).then(() => ack(successAck));
}

function maximizeWindow(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.maximize(windowIdentity);
    ack(successAck);
}

function leaveWindowGroup(identity: Identity, message: APIMessage, ack: Acker): Promise<void> {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);

    return Window.leaveGroup(windowIdentity).then(() => ack(successAck));
}

function joinWindowGroup(identity: Identity, message: APIMessage, ack: Acker, nack: (error: Error) => void): Promise<void> {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);
    const groupingIdentity = getGroupingWindowIdentity(payload);
    if (System.getAllExternalWindows().some(w => w.uuid === groupingIdentity.uuid)) {
        // nack if joining an ExternalWindow since certain methods don't work without injection
        nack(new Error('Joining a group with an ExternalWindow is not supported'));
        return;
    }
    return Window.joinGroup(windowIdentity, groupingIdentity).then(() => ack(successAck));
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
    const windowGroup: GroupWindow[] = Window.getGroup(windowIdentity);

    // NOTE: the Window API returns a wrapped window with 'name' as a member,
    // while the adaptor expects it to be 'windowName'
    dataAck.data = windowGroup.map(({ uuid, name, isExternalWindow }) => {
        if (crossApp === true) {
            return { uuid, name, windowName: name, isExternalWindow };
        } else {
            return name; // backwards compatible
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

function enableUserMovement(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.enableUserMovement(windowIdentity);
    ack(successAck);
}

function disableUserMovement(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.disableUserMovement(identity, windowIdentity);
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

function animateWindow(identity: Identity, message: APIMessage, ack: Acker, nack: Nacker): void {
    const { payload } = message;
    const { options, transitions } = payload;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.animate(windowIdentity, transitions, options, () => ack(successAck), nack);
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

function registerWindowName(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.registerWindowName(windowIdentity);
    ack(successAck);
}

function centerWindow(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);

    Window.center(windowIdentity);
    ack(successAck);
}

function getViews(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);
    return Window.getViews(windowIdentity);
}
