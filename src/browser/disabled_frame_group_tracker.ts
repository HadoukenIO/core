import { OpenFinWindow } from '../shapes';
import of_events from './of_events';
import route from '../common/route';
import { BrowserWindow } from 'electron';
import WindowGroups from './window_groups';
const WindowTransaction = require('electron').windowTransaction;
import {RectangleBase, Rectangle} from './rectangle';
import {createRectangleFromBrowserWindow, zeroDelta} from './normalized_rectangle';
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
type Move = [OpenFinWindow, Rectangle];
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
export function updateGroupedWindowBounds(win: OpenFinWindow, delta: Partial<RectangleBase>) {
    const shift = {...zeroDelta, ...delta};
    return convertActionToMockEvent(win, shift);
}
export function setNewGroupedWindowBounds(win: OpenFinWindow, partialBounds: Partial<RectangleBase>) {
    const rect = createRectangleFromBrowserWindow(win.browserWindow);
    const bounds = {...rect.rawBounds, ...partialBounds};
    const newBounds = rect.applyOffset(bounds);
    const delta = rect.delta(newBounds);
    return convertActionToMockEvent(win, delta);
}

function convertActionToMockEvent(win: OpenFinWindow, delta: RectangleBase) {
    const rect = createRectangleFromBrowserWindow(win.browserWindow);
    const bounds = rect.shift(delta);
    const newBounds = rect.applyOffset(bounds);
    if (!rect.moved(newBounds)) {
        return;
    }
    const moved = (delta.x && delta.x + delta.width) || (delta.y && delta.y + delta.height);
    const resized = delta.width || delta.height;
    const changeType = resized
        ? moved
            ? 2
            : 1
        : 0;
    return handleBoundsChanging(win, {}, bounds, changeType);
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
const makeTranslate = (delta: RectangleBase) => ([win, rect]: Move): Move => [win, rect.shift(delta)];
function handleBoundsChanging(
    win: OpenFinWindow,
    e: any,
    payloadBounds: RectangleBase,
    changeType: number
): Array<[OpenFinWindow, Rectangle]> {
    let moves: [OpenFinWindow, Rectangle][];
    const thisRect = createRectangleFromBrowserWindow(win.browserWindow);
    const newBounds = thisRect.applyOffset(payloadBounds);
    const initialPositions = WindowGroups
        .getGroup(win.groupUuid)
        .map((win) : Move => [win, createRectangleFromBrowserWindow(win.browserWindow)]);
    switch (changeType) {
        case 0: {
            const delta = thisRect.delta(newBounds);
            moves = initialPositions
                .map(makeTranslate(delta));
        } break;
        case 1: {
            moves = handleResizeMove(thisRect, newBounds, initialPositions);
        } break;
        case 2: {
            const delta = thisRect.delta(newBounds);
            const xShift = delta.x + delta.width;
            const yShift = delta.y + delta.height;
            const shift = { x: xShift, y: yShift, width: 0, height: 0 };
            const resizeBounds = {...newBounds, x: newBounds.x - xShift, y: newBounds.y - yShift};
            // Need to consider case where resize fails, is it better to set x-y to what they want
            // or shift by the amount it would have been in case of a succesful resize
            moves = handleResizeMove(thisRect, resizeBounds, initialPositions).map(makeTranslate(shift));
        } break;
    }
    const changed = moves.filter(([win, rect], i) => rect.moved(initialPositions[i][1]));
    handleBatchedMove(changed);
    return changed;
}
const moveToRect = ([, rect]: Move) => rect;

function handleResizeMove(start: Rectangle, end: RectangleBase, positions: [OpenFinWindow, Rectangle][]): Move[] {


    const moved = positions.map(([win, baseRect]): Move => {
        const movedRect = clipBounds(baseRect.move(start, end), win.browserWindow);
        return [win, movedRect];

    });

    const graphInitial = Rectangle.GRAPH_WITH_SIDE_DISTANCES(positions.map(moveToRect));
    const graphFinal = Rectangle.GRAPH_WITH_SIDE_DISTANCES(moved.map(moveToRect));

    if (!Rectangle.SUBGRAPH_AND_CLOSER(graphInitial, graphFinal)) {
        return positions;
    } else {
        return moved;
    }
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

interface Clamped {
    value: number;
    clampedOffset: number;
}

function clipBounds(bounds: Rectangle, browserWindow: OpenFinWindow['browserWindow']): Rectangle {
    if (!('_options' in browserWindow)) {
      return bounds;
    }

    const { minWidth, minHeight, maxWidth, maxHeight } = browserWindow._options;

    const xclamp = clamp(bounds.width, minWidth, maxWidth);
    const yclamp = clamp(bounds.height, minHeight, maxHeight);

    return new Rectangle(bounds.x + xclamp.clampedOffset, bounds.y + yclamp.clampedOffset, xclamp.value, yclamp.value);
  }

  function clamp(num: number, min: number = 0, max: number = Number.MAX_SAFE_INTEGER): Clamped {
    max = max < 0 ? Number.MAX_SAFE_INTEGER : max;
    const value = Math.min(Math.max(num, min, 0), max);
    return {
      value,
      clampedOffset: num < min ? -1 * (min - num) : 0 || num > max ? -1 * (num - max) : 0
    };
  }