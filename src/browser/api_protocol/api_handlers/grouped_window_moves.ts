import {ActionSpecMap} from '../shapes';
import { getWindowByUuidName } from '../../core_state';
import {setNewGroupedWindowBounds, updateGroupedWindowBounds} from '../../disabled_frame_group_tracker';
import { getTargetWindowIdentity } from './api_protocol_base';
import { RectangleBase } from '../../rectangle';
import { APIMessage } from '../../../shapes';
import { AckFunc } from '../transport_strategy/ack';
export const hijackThese: {[key: string]: (payload: any) => ChangeType} = {
    // 'animate-window': animateWindow,
    // 'blur-window': blurWindow,
    // 'bring-window-to-front': bringWindowToFront,
    // 'close-window': closeWindow,
    // TODO  'disable-window-frame': disableWindowFrame,
    // 'dock-window': dockWindow,
    // TODO  'enable-window-frame': enableWindowFrame,
    // 'execute-javascript-in-window': { apiFunc: executeJavascript, apiPath: '.executeJavaScript' },
    // 'flash-window': flashWindow,
    // 'focus-window': focusWindow,
    // 'get-current-window-options': getCurrentWindowOptions,
    // 'get-all-frames': getAllFrames,
    // 'get-window-bounds': getWindowBounds,
    // 'get-window-group': getWindowGroup,
    // 'get-window-info': getWindowInfo,
    // 'get-window-native-id': { apiFunc: getWindowNativeId, apiPath: '.getNativeId' },
    // 'get-window-options': getWindowOptions,
    // 'get-window-snapshot': { apiFunc: getWindowSnapshot, apiPath: '.getSnapshot' },
    // 'get-window-state': getWindowState,
    // 'get-zoom-level': getZoomLevel,
    // 'hide-window': hideWindow,
    // 'is-window-showing': isWindowShowing,
    // 'join-window-group': joinWindowGroup,
    // 'leave-window-group': leaveWindowGroup,
    // 'maximize-window': maximizeWindow,
    // 'merge-window-groups': mergeWindowGroups,
    // 'minimize-window': minimizeWindow,
    'move-window': makeGetChangeType(['left', 'top'], ['x', 'y'], 'absolute'),
    'move-window-by': makeGetChangeType(['deltaLeft', 'deltaTop'], ['x', 'y'], 'delta'),
    // 'navigate-window': navigateWindow,
    // 'navigate-window-back': navigateWindowBack,
    // 'navigate-window-forward': navigateWindowForward,
    // 'stop-window-navigation': stopWindowNavigation,
    // 'register-window-name': registerWindowName,
    // 'reload-window': reloadWindow,
    // 'redirect-window-to-url': redirectWindowToUrl, // Deprecated
    'resize-window': makeGetChangeType(['height', 'width'], ['height', 'width'], 'absolute'),
    'resize-window-by': makeGetChangeType(['deltaHeight', 'deltaWidth'], ['height', 'width'], 'delta'),
    // 'restore-window': restoreWindow,
    // 'show-menu': showMenu,
    // 'show-window': showWindow,
    // 'set-foreground-window': setForegroundWindow,
    'set-window-bounds': makeGetChangeType(['left', 'top', 'height', 'width'], ['x', 'y', 'height', 'width'], 'absolute'),
    // 'set-window-preload-state': setWindowPreloadState,
    // 'set-zoom-level': setZoomLevel,
    'show-at-window': makeGetChangeType(['left', 'top'], ['x', 'y'], 'absolute')
    // 'stop-flash-window': stopFlashWindow,
    // 'undock-window': undockWindow,
    // 'update-window-options': updateWindowOptions,
    // 'window-authenticate': windowAuthenticate,
    // 'window-embedded': windowEmbedded,
    // 'window-exists': windowExists,
    // 'window-get-cached-bounds': getCachedBounds
};
interface ChangeType extends Partial<RectangleBase> {
    change: 'delta' | 'absolute';
}
function makeGetChangeType(from: string[], to: (keyof ChangeType)[], change: 'delta' | 'absolute') {
    return (payload: any): ChangeType => from.reduce((accum: ChangeType, key, i) => {
        accum[to[i]] = payload[key];
        return accum;
    }, {change});
}
export function hijackMovesForGroupedWindows(actions: ActionSpecMap) {
    const specMap: ActionSpecMap = {};
    Object.entries(actions).forEach(([action, endpoint]) => {
        if (!hijackThese[action]) {
            specMap[action] = endpoint;
        } else {
            if (typeof endpoint === 'function') {
                specMap[action] = async (identity, message: APIMessage, ack: AckFunc, nack) => {
                    const {payload} = message;
                    const { top, left, width, height } = payload;
                    const { uuid, name } = getTargetWindowIdentity(payload);
                    const wrapped = getWindowByUuidName(uuid, name);
                    if (wrapped && wrapped.groupUuid) {
                        const changeType = hijackThese[action](payload);
                        const moved = changeType.change === 'delta'
                           ? updateGroupedWindowBounds(wrapped, changeType)
                           : setNewGroupedWindowBounds(wrapped, changeType);
                        ack({success: true});
                    } else {
                        endpoint(identity, message, ack, nack);
                    }
                };
            }
        }
    });
    return specMap;
}