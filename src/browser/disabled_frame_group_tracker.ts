import { OpenFinWindow, GroupWindow } from '../shapes';
import of_events from './of_events';
import route from '../common/route';
import { BrowserWindow } from 'electron';
import WindowGroups from './window_groups';
const WindowTransaction = require('electron').windowTransaction;
import { getRuntimeProxyWindow } from './window_groups_runtime_proxy';
import { RectangleBase, Rectangle } from './rectangle';
import {
    moveFromOpenFinWindow,
    zeroDelta,
    getEventBounds,
    normalizeExternalBounds,
    getTransactionBounds,
    applyOffset
} from './normalized_rectangle';
import { writeToLog } from './log';

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
const moveToRect = ({ rect }: Move) => rect;
enum ChangeType {
    POSITION = 0,
    SIZE = 1,
    POSITION_AND_SIZE = 2
}
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
    payloadCache: [GroupWindow, any, RectangleBase, number][];
    interval?: any;
}
const listenerCache: Map<WinId, (...args: any[]) => void> = new Map();
const groupInfoCache: Map<string, GroupInfo> = new Map();
export interface Move {
    ofWin: GroupWindow;
    rect: Rectangle;
    offset: RectangleBase;
}
async function emitChange(
    { ofWin, rect, offset }: Move,
    changeType: ChangeType,
    reason: string
) {
    const eventBounds = getEventBounds(rect, offset);
    const eventArgs = {
        ...eventBounds,
        changeType,
        reason,
        deferred: true
    };
    raiseEvent(ofWin, 'bounds-changed', eventArgs);

}
async function raiseEvent(groupWindow: GroupWindow, topic: string, payload: any) {
    const { uuid, name } = groupWindow;
    const id = { uuid, name };
    let eventName;

    if (groupWindow.isExternalWindow) {
        eventName = route.nativeWindow(topic, uuid, name);
    } else {
        eventName = route.window(topic, uuid, name);
    }

    const eventArgs = {
        ...payload,
        uuid,
        name,
        topic,
        type: 'window'
    };

    if (groupWindow.isProxy) {
        const rt = await getRuntimeProxyWindow(id);
        const fin = rt.hostRuntime.fin;
        await fin.System.executeOnRemote(id, { action: 'raise-event', payload: { eventName, eventArgs } });
    } else {
        of_events.emit(eventName, eventArgs);
    }
}

export function updateGroupedWindowBounds(win: GroupWindow, delta: Partial<RectangleBase>) {
    const shift = { ...zeroDelta, ...delta };
    return handleApiMove(win, shift);
}
export function setNewGroupedWindowBounds(win: GroupWindow, partialBounds: Partial<RectangleBase>) {
    const { rect, offset } = moveFromOpenFinWindow(win);
    const bounds = { ...applyOffset(rect, offset), ...partialBounds };
    const newBounds = normalizeExternalBounds(bounds, offset);
    const delta = rect.delta(newBounds);
    return handleApiMove(win, delta);
}
type MoveAccumulator = { otherWindows: Move[], leader?: Move };
async function handleApiMove(win: GroupWindow, delta: RectangleBase) {
    const { rect, offset } = moveFromOpenFinWindow(win);
    const newBounds = rect.shift(delta);
    if (!rect.moved(newBounds)) {
        return;
    }
    const moved = (delta.x && delta.x + delta.width) || (delta.y && delta.y + delta.height);
    const resized = delta.width || delta.height;
    const changeType = resized
        ? moved
            ? ChangeType.POSITION_AND_SIZE
            : ChangeType.SIZE
        : ChangeType.POSITION;
    const moves = handleBoundsChanging(win, {}, applyOffset(newBounds, offset), changeType);
    const { leader, otherWindows } = moves.reduce((accum: MoveAccumulator, move) => {
        move.ofWin === win ? accum.leader = move : accum.otherWindows.push(move);
        return accum;
    }, <MoveAccumulator>{ otherWindows: [] });
    if (!leader || leader.rect.moved(newBounds)) {
        //Proposed move differs from requested move
        throw new Error('Attempted move violates group constraints');
    }
    handleBatchedMove(moves);
    await Promise.all([
        emitChange(leader, changeType, 'self'),
        ...otherWindows.map(move => emitChange(move, changeType, 'group'))
    ]);
    return leader.rect;
}

function handleBatchedMove(moves: Move[], bringWinsToFront: boolean = false) {
    if (isWin32) {
        const { flag: { noZorder, noSize, noActivate } } = WindowTransaction;
        const flags = noZorder + noActivate;
        const wt = new WindowTransaction.Transaction(0);
        moves.forEach(({ ofWin, rect, offset }) => {
            const hwnd = parseInt(ofWin.browserWindow.nativeId, 16);
            wt.setWindowPos(hwnd, { ...getTransactionBounds(rect, offset), flags });
            if (bringWinsToFront) { ofWin.browserWindow.bringToFront(); }
        });
        wt.commit();
    } else {
        moves.forEach(({ ofWin, rect, offset }) => {
            ofWin.browserWindow.setBounds(applyOffset(rect, offset));
            if (bringWinsToFront) { ofWin.browserWindow.bringToFront(); }
        });
    }
}
const makeTranslate = (delta: RectangleBase) => ({ ofWin, rect, offset }: Move): Move => {
    return { ofWin, rect: rect.shift(delta), offset };
};
function getInitialPositions(win: GroupWindow) {
    return WindowGroups.getGroup(win.groupUuid).map(moveFromOpenFinWindow);
}
function handleBoundsChanging(
    win: GroupWindow,
    e: any,
    rawPayloadBounds: RectangleBase,
    changeType: ChangeType,
    treatBothChangedAsJustAResize: boolean = false
): Move[] {
    const initialPositions: Move[] = getInitialPositions(win);
    const leaderRectIndex = initialPositions.map(x => x.ofWin).indexOf(win);
    let moves: Move[];
    const startMove = moveFromOpenFinWindow(win); //Corrected
    const start = startMove.rect;
    const { offset } = startMove;
    const end = normalizeExternalBounds(rawPayloadBounds, offset); //Corrected
    switch (changeType) {
        case ChangeType.POSITION:
            moves = handleMoveOnly(start, end, initialPositions);
            break;
        case ChangeType.SIZE:
            moves = handleResizeOnly(leaderRectIndex, startMove, end, initialPositions);
            break;
        case ChangeType.POSITION_AND_SIZE:
            const delta = start.delta(end);
            const xShift = delta.x ? delta.x + delta.width : 0;
            const yShift = delta.y ? delta.y + delta.height : 0;
            const shift = { x: xShift, y: yShift, width: 0, height: 0 };
            const resizeDelta = {x: delta.x - xShift, y: delta.y - yShift, width: delta.width, height: delta.height};
            const resized = (delta.width || delta.height);
            moves = resized
                ? handleResizeOnly(leaderRectIndex, startMove, start.shift(resizeDelta), initialPositions)
                : initialPositions;
            const moved = (xShift || yShift);
            //This flag is here because sometimes the runtime lies and says we moved on a resize
            //This flag should always be set to true when relying on runtime events. It should be false on api moves.
            //Setting it to false on runtime events can cause a growing window bug.
            moves = moved && !treatBothChangedAsJustAResize
                ? handleMoveOnly(start, start.shift(shift), moves)
                : moves;

            break;
        default: {
            moves = [];
        } break;
    }
    return moves;
}

function handleResizeOnly(leaderRectIndex: number, startMove: Move, end: RectangleBase, initialPositions: Move[]) {
    const start = startMove.rect;
    const win = startMove.ofWin;
    const delta = start.delta(end);
    const rects = initialPositions.map(x => x.rect);
    const iterMoves = Rectangle.PROPAGATE_MOVE(leaderRectIndex, start, delta, rects);

    const allMoves = iterMoves.map((x, i) => ({
        ofWin: initialPositions[i].ofWin,
        rect: x,
        offset: initialPositions[i].offset}));

    const moves = allMoves.filter((move, i) => initialPositions[i].rect.moved(move.rect));
    const endMove = moves.find(({ ofWin }) => ofWin === win);
    if (!endMove) {
        return [];
    }
    const final = endMove.rect;
    const xChangedWithoutWidth = final.width === start.width && final.x !== start.x;
    if (xChangedWithoutWidth) {
        return [];
    }
    const yChangedWithoutHeight = final.height === start.height && final.y !== start.y;
    if (yChangedWithoutHeight) {
        return [];
    }
    return moves;
}

function handleMoveOnly(start: Rectangle, end: RectangleBase, initialPositions: Move[]) {
    const delta = start.delta(end);
    return initialPositions
        .map(makeTranslate(delta));
}

export function getGroupInfoCacheForWindow(win: GroupWindow): GroupInfo {
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

export function addWindowToGroup(win: GroupWindow) {
    win.browserWindow.setUserMovementEnabled(false);
    const listener = async (e: any, rawPayloadBounds: RectangleBase, changeType: ChangeType) => {
        try {
            const groupInfo = getGroupInfoCacheForWindow(win);
            if (groupInfo.boundsChanging) {
                groupInfo.payloadCache.push([win, e, rawPayloadBounds, changeType]);
            } else {
                const uuid = win.uuid;
                const name = win.name;
                const eventBounds = getEventBounds(win.browserWindow.getBounds());
                const moved = new Set<GroupWindow>();
                groupInfo.boundsChanging = true;
                await raiseEvent(win, 'begin-user-bounds-changing', { ...eventBounds, windowState: getState(win.browserWindow) });
                const initialMoves = handleBoundsChanging(win, e, rawPayloadBounds, changeType, true);
                handleBatchedMove(initialMoves, true);
                groupInfo.interval = setInterval(() => {
                    try {
                        if (groupInfo.payloadCache.length) {
                            const [a, b, c, d] = groupInfo.payloadCache.pop();
                            const moves = handleBoundsChanging(a, b, c, d, true);
                            groupInfo.payloadCache = [];
                            handleBatchedMove(moves);
                            moves.forEach((move) => {
                                moved.add(move.ofWin);
                            });
                        }
                    } catch (error) {
                        writeToLog('error', error);
                    }
                }, 30);
                win.browserWindow
                .once('disabled-frame-bounds-changed', async (e: any, rawPayloadBounds: RectangleBase, changeType: ChangeType) => {
                    try {
                        groupInfo.boundsChanging = false;
                        clearInterval(groupInfo.interval);
                        groupInfo.payloadCache = [];
                        const moves = handleBoundsChanging(win, e, rawPayloadBounds, changeType, true);
                        handleBatchedMove(moves);
                        const promises: Promise<void>[] = [];
                        moved.forEach((movedWin) => {
                            const endPosition = moveFromOpenFinWindow(movedWin);
                            const isLeader = movedWin === win;
                            promises.push(emitChange(endPosition, changeType, isLeader ? 'self' : 'group'));
                            if (isLeader) {
                                promises.push(raiseEvent(movedWin, 'end-user-bounds-changing', {
                                    ...getEventBounds(endPosition.rect, endPosition.offset),
                                    windowState: getState(win.browserWindow)
                                }));
                            }
                        });
                        await promises;
                    } catch (error) {
                        writeToLog('error', error);
                    }
                });
            }
        } catch (error) {
            writeToLog('error', error);
        }
    };

    listenerCache.set(win.browserWindow.nativeId, listener);
    win.browserWindow.on('disabled-frame-bounds-changing', listener);
}

export function removeWindowFromGroup(win: GroupWindow) {
    if (!win.browserWindow.isDestroyed()) {
        win.browserWindow.setUserMovementEnabled(true);
        const winId = win.browserWindow.nativeId;
        const listener = listenerCache.get(winId);
        if (listener) {
            win.browserWindow.removeListener('disabled-frame-bounds-changing', listener);
        }
        listenerCache.delete(winId);
    }
}

export function deleteGroupInfoCache(groupUuid: string) {
    groupInfoCache.delete(groupUuid);
}

interface Clamped {
    value: number;
    clampedOffset: number;
}
