import { OpenFinWindow } from '../shapes';
import of_events from './of_events';
import route from '../common/route';
import WindowGroups from './window_groups';
const WindowTransaction = require('electron').windowTransaction;
import { getRuntimeProxyWindow } from './window_groups_runtime_proxy';
import { RectangleBase, Rectangle } from './rectangle';
import { restore } from './api/native_window';
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
enum ChangeType {
    POSITION = 0,
    SIZE = 1,
    POSITION_AND_SIZE = 2
}
type MoveAccumulator = { otherWindows: Move[], leader?: Move };
type WinId = string;
const listenerCache: Map<WinId, Array<(...args: any[]) => void>> = new Map();
export interface Move { ofWin: OpenFinWindow; rect: Rectangle; offset: RectangleBase; }

function emitChange(topic: string, { ofWin, rect, offset }: Move, changeType: ChangeType, reason: string) {
    const eventBounds = getEventBounds(rect, offset);
    const eventArgs = {
        ...eventBounds,
        changeType,
        reason,
        deferred: true
    };
    raiseEvent(ofWin, topic, eventArgs);
}
async function raiseEvent(ofWin: OpenFinWindow, topic: string, payload: Object) {
    const { uuid, name, isProxy} = ofWin;
    const identity = { uuid, name };
    const eventName = route.window(topic, uuid, name);
    const eventArgs = {
        ...payload,
        ...identity,
        topic,
        type: 'window'
    };
    if (isProxy) {
        const rt = await getRuntimeProxyWindow(identity);
        const fin = rt.hostRuntime.fin;
        await fin.System.executeOnRemote(identity, { action: 'raise-event', payload: { eventName, eventArgs } });
    } else {
        of_events.emit(eventName, eventArgs);
    }
}

export function updateGroupedWindowBounds(win: OpenFinWindow, delta: Partial<RectangleBase>) {
    const shift = { ...zeroDelta, ...delta };
    return handleApiMove(win, shift);
}
function getMovingWindowDelta(win: OpenFinWindow, bounds: Partial<RectangleBase>): RectangleBase {
    const { offset, rect } = moveFromOpenFinWindow(win);
    // Could be partial bounds from an API call
    const fullBounds = { ...applyOffset(rect, offset), ...bounds };
    const end = normalizeExternalBounds(fullBounds, offset); //Corrected
    return rect.delta(end);
}
export function setNewGroupedWindowBounds(win: OpenFinWindow, partialBounds: Partial<RectangleBase>) {
    const delta = getMovingWindowDelta(win, partialBounds);
    return handleApiMove(win, delta);
}
//REMEMBER - this being async means you never nack.... (REMOVE COMMENT IN PR)
function handleApiMove(win: OpenFinWindow, delta: RectangleBase) {
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
    const moves = handleBoundsChanging(win, applyOffset(newBounds, offset), changeType);
    const { leader, otherWindows } = moves.reduce((accum: MoveAccumulator, move) => {
        move.ofWin === win ? accum.leader = move : accum.otherWindows.push(move);
        return accum;
    }, <MoveAccumulator>{ otherWindows: [] });
    if (!leader || leader.rect.moved(newBounds)) {
        //Proposed move differs from requested move
        throw new Error('Attempted move violates group constraints');
    }
    handleBatchedMove(moves, changeType);
    emitChange('bounds-changed', leader, changeType, 'self');
    otherWindows.map(move => emitChange('bounds-changed', move, changeType, 'group'));
    return leader.rect;
}

function handleBatchedMove(moves: Move[], changeType: ChangeType, bringWinsToFront: boolean = false) {
    if (isWin32) {
        const { flag: { noZorder, noSize, noActivate } } = WindowTransaction;
        let flags = noZorder + noActivate;
        flags = changeType === 0 ? flags + noSize : flags;
        const wt = new WindowTransaction.Transaction(0);
        moves.forEach(({ ofWin: {browserWindow}, rect, offset }) => {
            const hwnd = parseInt(browserWindow.nativeId, 16);
            wt.setWindowPos(hwnd, { ...getTransactionBounds(rect, offset), flags });
            if (bringWinsToFront) { browserWindow.bringToFront(); }
        });
        wt.commit();
    } else {
        moves.forEach(({ ofWin: {browserWindow}, rect, offset }) => {
            browserWindow.setBounds(applyOffset(rect, offset));
            if (bringWinsToFront) { browserWindow.bringToFront(); }
        });
    }
}
const makeTranslate = (delta: RectangleBase) => ({ ofWin, rect, offset }: Move): Move => {
    return { ofWin, rect: rect.shift(delta), offset };
};
function getInitialPositions(win: OpenFinWindow) {
    return WindowGroups.getGroup(win.groupUuid).map(moveFromOpenFinWindow);
}
function handleBoundsChanging(
    win: OpenFinWindow,
    rawPayloadBounds: RectangleBase,
    changeType: ChangeType,
    treatBothChangedAsJustAResize: boolean = false
): Move[] {
    const initialPositions: Move[] = getInitialPositions(win);
    let moves = initialPositions;
    const delta = getMovingWindowDelta(win, rawPayloadBounds);
    switch (changeType) {
        case ChangeType.POSITION:
            moves = handleMoveOnly(delta, initialPositions);
            break;
        case ChangeType.SIZE:
            moves = handleResizeOnly(win, delta);
            break;
        case ChangeType.POSITION_AND_SIZE:
            const resized = (delta.width || delta.height);
            const xShift = delta.x ? delta.x + delta.width : 0;
            const yShift = delta.y ? delta.y + delta.height : 0;
            const moved = (xShift || yShift);
            if (resized) {
                const resizeDelta = {x: delta.x - xShift, y: delta.y - yShift, width: delta.width, height: delta.height};
                moves = handleResizeOnly(win, resizeDelta);
            }
            if (moved && !treatBothChangedAsJustAResize) {
                //This flag is here because sometimes the runtime lies and says we moved on a resize
                //This flag should always be set to true when relying on runtime events. It should be false on api moves.
                //Setting it to false on runtime events can cause a growing window bug.
                const shift = { x: xShift, y: yShift, width: 0, height: 0 };
                moves = handleMoveOnly(shift, moves);
            }
            break;
        default: {
            moves = [];
        } break;
    }
    return moves;
}

function handleResizeOnly(win: OpenFinWindow, delta: RectangleBase) {
    const initialPositions = getInitialPositions(win);
    const rects = initialPositions.map(x => x.rect);
    const leaderRectIndex = initialPositions.map(x => x.ofWin).indexOf(win);
    const start = rects[leaderRectIndex];
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

function handleMoveOnly(delta: RectangleBase, initialPositions: Move[]) {
    return initialPositions
        .map(makeTranslate(delta));
}

export function addWindowToGroup(win: OpenFinWindow) {
    const MonitorInfo = require('./monitor_info.js');
    const scaleFactor = MonitorInfo.getInfo().deviceScaleFactor;
    let moved = new Set<OpenFinWindow>();
    let boundsChanging = false;

    const genericListener = (e: any, rawPayloadBounds: RectangleBase, changeType: ChangeType) => {
        try {
            e.preventDefault();
            Object.keys(rawPayloadBounds).map(key => {
                // CHECK IF THE DIP FORMULA WORKS HERE!
                //@ts-ignore
                rawPayloadBounds[key] = rawPayloadBounds[key] / scaleFactor;
            });
            if (!boundsChanging) {
                boundsChanging = true;
                moved = new Set<OpenFinWindow>();
                const moves = handleBoundsChanging(win, rawPayloadBounds, changeType, true);
                handleBatchedMove(moves, changeType, true);
                moves.forEach(({ofWin}) => moved.add(ofWin));
                win.browserWindow.once('end-user-bounds-change', () => {
                    boundsChanging = false;
                    moved.forEach((movedWin) => {
                        const isLeader = movedWin === win;
                        if (!isLeader) {
                            // bounds-changed is emitted for the leader, but not other windows
                            const endPosition = moveFromOpenFinWindow(movedWin);
                            emitChange('bounds-changed', endPosition, changeType, 'group');
                        }
                    });
                });
            } else {
                const moves = handleBoundsChanging(win, rawPayloadBounds, changeType, true);
                handleBatchedMove(moves, changeType, true);
                moves.forEach((move) => moved.add(move.ofWin));
                // bounds-changing is not emitted for the leader, but is for the other windows
                const leaderMove = moves.find(({ofWin}) => ofWin.uuid === win.uuid && ofWin.name === win.name);
                emitChange('bounds-changing', leaderMove, changeType, 'self');
            }
        } catch (error) {
            writeToLog('error', error);
        }
    };
    const moveListener = (e: any, bounds: RectangleBase) => genericListener(e, bounds, 0);
    const resizeListener = (e: any, bounds: RectangleBase) => genericListener(e, bounds, 1);
    const restoreListener = () => WindowGroups.getGroup(win.groupUuid).forEach(w => restore(w.browserWindow));

    win.browserWindow.on('will-move', moveListener);
    win.browserWindow.on('will-resize', resizeListener);
    win.browserWindow.on('begin-user-bounds-change', restoreListener);
    listenerCache.set(win.browserWindow.nativeId, [moveListener, resizeListener, restoreListener]);
}

export function removeWindowFromGroup({browserWindow}: OpenFinWindow) {
    const winId = browserWindow.nativeId;
    if (!browserWindow.isDestroyed()) {
        const listeners = listenerCache.get(winId);
        if (listeners) {
            browserWindow.removeListener('will-move', listeners[0]);
            browserWindow.removeListener('will-resize', listeners[1]);
            browserWindow.removeListener('begin-user-bounds-change', listeners[2]);
        }
    }
    listenerCache.delete(winId);
}
