import { OpenFinWindow } from '../shapes';
import of_events from './of_events';
import route from '../common/route';
import { BrowserWindow } from 'electron';
import WindowGroups from './window_groups';
const WindowTransaction = require('electron').windowTransaction;
import {getRuntimeProxyWindow} from './window_groups_runtime_proxy';
import {RectangleBase, Rectangle} from './rectangle';
import {
    moveFromOpenFinWindow,
    zeroDelta,
    getEventBounds,
    normalizeExternalBounds,
    getTransactionBounds,
    applyOffset
} from './normalized_rectangle';

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
const moveToRect = ([, rect]: Move) => rect;

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
export type Move = [OpenFinWindow, Rectangle, RectangleBase];
async function emitChange(
    [win, rect, offset] : Move,
    changeType: number,
    reason: string,
    eventType: 'changing' | 'changed' = 'changing'
) {
    const topic = `bounds-${eventType}`;
    const uuid = win.uuid;
    const name = win.name;
    const id = {uuid, name};
    const eventName = route.window(topic, uuid, name);
    const eventBounds = getEventBounds(rect, offset);
    const eventArgs = {
        ...eventBounds,
        changeType,
        uuid,
        name,
        topic,
        reason,
        type: 'window',
        deffered: true
    };
    if (win.isProxy) {
       const rt = await getRuntimeProxyWindow(id);
       const fin = rt.hostRuntime.fin;
       await fin.System.executeOnRemote(id, {action: 'raise-event', payload: {eventName, eventArgs}} );
    } else {
        of_events.emit(eventName, eventArgs);
    }

}

export function updateGroupedWindowBounds(win: OpenFinWindow, delta: Partial<RectangleBase>) {
    const shift = {...zeroDelta, ...delta};
    return handleApiMove(win, shift);
}
export function setNewGroupedWindowBounds(win: OpenFinWindow, partialBounds: Partial<RectangleBase>) {
    const [, rect, offset] = moveFromOpenFinWindow(win);
    const bounds = {...applyOffset(rect, offset), ...partialBounds};
    const newBounds = normalizeExternalBounds(bounds, offset);
    const delta = rect.delta(newBounds);
    return handleApiMove(win, delta);
}
type MoveAccumulator = { otherWindows: Move[], leader?: Move };
function handleApiMove(win: OpenFinWindow, delta: RectangleBase) {
    const [, rect, offset] = moveFromOpenFinWindow(win);
    const newBounds = rect.shift(delta);
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
    const moves = handleBoundsChanging(win, {}, applyOffset(newBounds, offset), changeType);
    const {leader, otherWindows} = moves.reduce((accum: MoveAccumulator , move) => {
        move[0] === win ? accum.leader = move : accum.otherWindows.push(move);
        return accum;
    }, <MoveAccumulator>{otherWindows: []});
    if (!leader || leader[1].moved(newBounds)) {
        //Propsed move differs from requested move
        throw new Error('Attempted move violates group constraints');
    }
    handleBatchedMove(moves);
    emitChange(leader, changeType, 'self', 'changed');
    // const otherWindows = moves.filter(([w]) => w !== win);
    otherWindows.forEach(move => emitChange(move, changeType, 'group', 'changed'));
    return leader[1];
}

function handleBatchedMove(moves: Move[], bringWinsToFront: boolean = false) {
    if (isWin32) {
        const { flag: { noZorder, noSize, noActivate } } = WindowTransaction;
        const flags = noZorder + noActivate;
        const wt = new WindowTransaction.Transaction(0);
        moves.forEach(([win, rect, offset]) => {
            const hwnd = parseInt(win.browserWindow.nativeId, 16);
            wt.setWindowPos(hwnd, { ...getTransactionBounds(rect, offset), flags });
            if (bringWinsToFront) { win.browserWindow.bringToFront(); }
        });
        wt.commit();
    } else {
        moves.forEach(([win, rect, offset]) => {
            win.browserWindow.setBounds(applyOffset(rect, offset));
            if (bringWinsToFront) { win.browserWindow.bringToFront(); }
        });
    }
}
const makeTranslate = (delta: RectangleBase) => ([win, rect, offset]: Move): Move => [win, rect.shift(delta), offset];
function getInitialPositions(win: OpenFinWindow) {
    return WindowGroups.getGroup(win.groupUuid).map(moveFromOpenFinWindow);
}
function handleBoundsChanging(
    win: OpenFinWindow,
    e: any,
    rawPayloadBounds: RectangleBase,
    changeType: number,
    initialPositions: Move[] = getInitialPositions(win)
): Move[] {
    let moves: Move[];
    const [, start, offset] = moveFromOpenFinWindow(win); //Corrected
    const end = normalizeExternalBounds(rawPayloadBounds, offset); //Corrected
    switch (changeType) {
        case 0: {
            const delta = start.delta(end);
            moves = initialPositions
                .map(makeTranslate(delta));
        } break;
        case 1: {
            const allMoves = initialPositions
                .map(([win, baseRect, offset]): Move => {
                    const movedRect = baseRect.move(start, end);
                    return [win, movedRect, offset];
                });
            moves = allMoves.filter((move, i) => initialPositions[i][1].moved(move[1]));

            const graphInitial = Rectangle.GRAPH_WITH_SIDE_DISTANCES(initialPositions.map(moveToRect));
            const graphFinal = Rectangle.GRAPH_WITH_SIDE_DISTANCES(allMoves.map(moveToRect));
            if (!Rectangle.SUBGRAPH_AND_CLOSER(graphInitial, graphFinal)) {
                moves = [];
            }
            const endMove = moves.find(([w]) => w === win);
            if (!endMove) {
                moves = [];
                break;
            }
            const [, final] = endMove;
            if (final.width === start.width && final.x !== start.x) {
                moves = [];
            } if (final.height === start.height && final.y !== start.y) {
                moves = [];
            }
        } break;
        case 2: {
            const delta = start.delta(end);
            const xShift = delta.x ? delta.x + delta.width : 0;
            const yShift = delta.y ? delta.y + delta.height : 0;
            const shift = { x: xShift, y: yShift, width: 0, height: 0 };
            const shifted = (xShift || yShift)
                ? handleBoundsChanging(win, e, applyOffset(start.shift(shift), offset), 0, initialPositions)
                : initialPositions;
            moves = (delta.width || delta.height)
                ? handleBoundsChanging(win, e, rawPayloadBounds, 1, shifted)
                : shifted;
            // const resizeBounds = thisRect.cloneWithNewBounds(newBounds).shift(negate(shift));
            // const resizeBounds = {...newBounds, x: newBounds.x - xShift, y: newBounds.y - yShift};
            // // Need to consider case where resize fails, is it better to set x-y to what they want
            // // or shift by the amount it would have been in case of a succesful resize
            // moves = handleResizeMove(thisRect, resizeBounds, initialPositions).map(makeTranslate(shift));
            break;
        }
        default: {
            moves = [];
        } break;
    }
    return moves;
}


export function getGroupInfoCacheForWindow(win: OpenFinWindow): GroupInfo {
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
    const listener = (e: any, rawPayloadBounds: RectangleBase, changeType: number) => {
        const groupInfo = getGroupInfoCacheForWindow(win);
        if (groupInfo.boundsChanging) {
            groupInfo.payloadCache.push([win, e, rawPayloadBounds, changeType]);
        } else {
            const uuid = win.uuid;
            const name = win.name;
            const eventBounds = getEventBounds(win.browserWindow.getBounds());
            const moved = new Set<OpenFinWindow>();
            of_events.emit(route.window('begin-user-bounds-changing', uuid, name), {
                eventBounds,
                uuid,
                name,
                topic: 'begin-user-bounds-changing',
                type: 'window',
                windowState: getState(win.browserWindow)
            });
            groupInfo.boundsChanging = true;
            const initialMoves = handleBoundsChanging(win, e, rawPayloadBounds, changeType);
            handleBatchedMove(initialMoves, true);
            initialMoves.forEach((move) => {
                emitChange(move, changeType, move[0] === win ? 'self' : 'group');
            });
            groupInfo.interval = setInterval(() => {
                if (groupInfo.payloadCache.length) {
                    const [a, b, c, d] = groupInfo.payloadCache.pop();
                    const moves = handleBoundsChanging(a, b, c, d);
                    groupInfo.payloadCache = [];
                    handleBatchedMove(moves);
                    moves.forEach((move) => {
                        moved.add(move[0]);
                        // emitChange(pair, d, pair[0] === win ? 'self' : 'group');
                    });
                }
            }, 16);
            win.browserWindow.once('disabled-frame-bounds-changed', (e: any, rawPayloadBounds: RectangleBase, changeType: number) => {
                groupInfo.boundsChanging = false;
                clearInterval(groupInfo.interval);
                groupInfo.payloadCache = [];
                const moves = handleBoundsChanging(win, e, rawPayloadBounds, changeType);
                handleBatchedMove(moves);
                moved.forEach((movedWin) => {
                    emitChange(moveFromOpenFinWindow(movedWin), changeType, movedWin === win ? 'self' : 'group', 'changed');
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