import { OpenFinWindow } from '../shapes';
import of_events from './of_events';
import route from '../common/route';
import { BrowserWindow } from 'electron';
import WindowGroups from './window_groups';
const WindowTransaction = require('electron').windowTransaction;
import {RectangleBase, Rectangle} from './rectangle';
import {createRectangleFromBrowserWindow} from './normalized_rectangle';
const isWin32 = process.platform === 'win32';
const getState = (browserWindow: BrowserWindow) => {
    if (browserWindow && browserWindow.isMinimized()) {
        return 'minimized';
    } else if (browserWindow && browserWindow.isMaximized()) {
        return 'maximized';
    } else {
        return 'normal';
    }
};
/*
Edge cases
respect max
whether to restore frame on leave
disabled window moving
event propagation
*/
type WinId = string;
interface GroupInfo {
    boundsChanging: boolean;
    payloadCache: [OpenFinWindow, any, RectangleBase, number][];
    interval?: any;
}
//const groupTrackerCache = new Map<string, GroupTracker>();
const listenerCache: Map<WinId, (...args: any[]) => void> = new Map();
const groupInfoCache: Map<string, GroupInfo> = new Map();

function emitChange(
    [win, rect] : [OpenFinWindow, Rectangle],
    changeType: number,
    eventType: 'changing' | 'changed' = 'changing'
) {
    const topic = `bounds-${eventType}`;
    const uuid = win.uuid;
    const name = win.name;
    of_events.emit(route.window(topic, uuid, name), {
        ...rect.eventBounds,
        changeType,
        uuid,
        name,
        topic,
        type: 'window',
        deffered: true
    });
}

function handleBatchedMove(moves: [OpenFinWindow, Rectangle][]) {
    if (isWin32) {
        const { flag: { noZorder, noSize, noActivate } } = WindowTransaction;
        const flags = noZorder + noActivate;
        const wt = new WindowTransaction.Transaction(0);
        moves.forEach(([win, rect]) => {
            const hwnd = parseInt(win.browserWindow.nativeId, 16);
            wt.setWindowPos(hwnd, { ...rect.transactionBounds, flags });
        });
        wt.commit();
    } else {
        moves.forEach(([win, rect]) => {
            win.browserWindow.setBounds(rect.bounds);
        });
    }
}

function handleBoundsChanging(
    win: OpenFinWindow,
    e: any,
    payloadBounds: RectangleBase,
    changeType: number
): Array<[OpenFinWindow, Rectangle]> {
    let moves: [OpenFinWindow, Rectangle][] = [];
    const thisRect = createRectangleFromBrowserWindow(win.browserWindow);
    const newBounds = thisRect.applyOffset(payloadBounds);
    switch (changeType) {
        case 0: {
            const delta = thisRect.delta(newBounds);
            moves = [];
            WindowGroups.getGroup(win.groupUuid).forEach((win: OpenFinWindow) => {
                const bounds = win.browserWindow.getBounds();
                const rect = Rectangle.CREATE_FROM_BOUNDS(bounds).shift(delta);
                moves.push([win, rect]);
            });
        } break;
        default: {
            WindowGroups.getGroup(win.groupUuid).forEach((win: OpenFinWindow) => {
                const baseRect = createRectangleFromBrowserWindow(win.browserWindow);
                const movedRect = baseRect.move(thisRect, newBounds);
                if (baseRect.moved(movedRect)) {
                    moves.push([win, movedRect]);
                }
            });
        } break;
    }
    handleBatchedMove(moves);
    return moves;
}
function getGroupInfoCacheForWindow(win: OpenFinWindow): GroupInfo {
    let groupInfo: GroupInfo = groupInfoCache.get(win.groupUuid);
    if (!groupInfo) {
        groupInfo = {
            boundsChanging: false,
            payloadCache: []
        };
        //merging of groups of windows that are not in a group will be late in producing a window group.
        if (win.groupUuid) {
            groupInfoCache.set(win.groupUuid, groupInfo);
        }
    }

    return groupInfo;
}

export function addWindowToGroup(win: OpenFinWindow) {
    win.browserWindow.setUserMovementEnabled(false);
    const listener = (e: any, newBounds: RectangleBase, changeType: number) => {
        const groupInfo = getGroupInfoCacheForWindow(win);
        if (groupInfo.boundsChanging) {
            groupInfo.payloadCache.push([win, e, newBounds, changeType]);
        } else {
            const uuid = win.uuid;
            const name = win.name;
            const rect = createRectangleFromBrowserWindow(win.browserWindow);
            const moved = new Set();
            of_events.emit(route.window('begin-user-bounds-changing', uuid, name), {
                ...rect.eventBounds,
                uuid,
                name,
                topic: 'begin-user-bounds-changing',
                type: 'window',
                windowState: getState(win.browserWindow)
            });
            groupInfo.boundsChanging = true;
            handleBoundsChanging(win, e, newBounds, changeType);
            groupInfo.interval = setInterval(() => {
                if (groupInfo.payloadCache.length) {
                    const [a, b, c, d] = groupInfo.payloadCache.pop();
                    const moves = handleBoundsChanging(a, b, c, d);
                    moves.forEach((pair) => {
                        moved.add(pair[0]);
                        emitChange(pair, d);
                    });
                groupInfo.payloadCache = [];
                }
            }, 16);
            win.browserWindow.once('disabled-frame-bounds-changed', (e: any, newBounds: RectangleBase, changeType: number) => {
                groupInfo.boundsChanging = false;
                clearInterval(groupInfo.interval);
                groupInfo.payloadCache = [];
                handleBoundsChanging(win, e, newBounds, changeType);
                moved.forEach((win) => {
                    const rect = createRectangleFromBrowserWindow(win.browserWindow);
                    emitChange([win, rect], changeType, 'changed');
                });
            });
        }
    };

    listenerCache.set(win.browserWindow.nativeId, listener);
    win.browserWindow.on('disabled-frame-bounds-changing', listener);
}

export function removeWindowFromGroup(win: OpenFinWindow) {
    win.browserWindow.setUserMovementEnabled(true);
    const winId = win.browserWindow.nativeId;
    win.browserWindow.removeListener('disabled-frame-bounds-changing', listenerCache.get(winId));
    listenerCache.delete(winId);
}

export function deleteGroupInfoCache(groupUuid: string) {
    groupInfoCache.delete(groupUuid);
}
