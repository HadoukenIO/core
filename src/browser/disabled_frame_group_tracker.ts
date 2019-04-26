import { OpenFinWindow } from '../shapes';
import of_events from './of_events';
import route from '../common/route';
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
const listenerCache: Map<WinId, Array<(...args: any[]) => void>> = new Map();
export interface Move {
    ofWin: OpenFinWindow; rect: Rectangle; offset: RectangleBase;
}
function emitChange(
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
async function raiseEvent(ofWin: OpenFinWindow, topic: string, payload: any) {
    const uuid = ofWin.uuid;
    const name = ofWin.name;
    const id = { uuid, name };
    const eventName = route.window(topic, uuid, name);
    const eventArgs = {
        ...payload,
        uuid,
        name,
        topic,
        type: 'window'
    };
    if (ofWin.isProxy) {
        const rt = await getRuntimeProxyWindow(id);
        const fin = rt.hostRuntime.fin;
        await fin.System.executeOnRemote(id, { action: 'raise-event', payload: { eventName, eventArgs } });
    } else {
        of_events.emit(eventName, eventArgs);
    }
}

export function updateGroupedWindowBounds(win: OpenFinWindow, delta: Partial<RectangleBase>) {
    const shift = { ...zeroDelta, ...delta };
    return handleApiMove(win, shift);
}
export function setNewGroupedWindowBounds(win: OpenFinWindow, partialBounds: Partial<RectangleBase>) {
    const { rect, offset } = moveFromOpenFinWindow(win);
    const bounds = { ...applyOffset(rect, offset), ...partialBounds };
    const newBounds = normalizeExternalBounds(bounds, offset);
    const delta = rect.delta(newBounds);
    return handleApiMove(win, delta);
}
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
    const moves = handleBoundsChanging(win, {}, applyOffset(newBounds, offset), changeType);
    const leader = moves.find(move => move.ofWin === win);
    if (!leader || leader.rect.moved(newBounds)) {
        //Proposed move differs from requested move
        throw new Error('Attempted move violates group constraints');
    }
    handleBatchedMove(moves, changeType);
    moves.map(move => emitChange(move, changeType, 'group'));
    return leader.rect;
}

function handleBatchedMove(moves: Move[], changeType: ChangeType, bringWinsToFront: boolean = false) {
    if (isWin32) {
        const { flag: { noZorder, noSize, noActivate } } = WindowTransaction;
        let flags = noZorder + noActivate;
        flags = changeType === 0 ? flags + noSize : flags;
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
function getInitialPositions(win: OpenFinWindow) {
    return WindowGroups.getGroup(win.groupUuid).map(moveFromOpenFinWindow);
}
function handleBoundsChanging(
    win: OpenFinWindow,
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

export function addWindowToGroup(win: OpenFinWindow) {
    const MonitorInfo = require('./monitor_info.js');
    const scaleFactor = MonitorInfo.getInfo().deviceScaleFactor;

    const genericListener = (e: any, rawPayloadBounds: RectangleBase, changeType: ChangeType) => {
        try {
            e.preventDefault();
            Object.keys(rawPayloadBounds).map(key => {
                //@ts-ignore
                rawPayloadBounds[key] = rawPayloadBounds[key] / scaleFactor;
            });
            const moves = handleBoundsChanging(win, e, rawPayloadBounds, changeType, true);
            handleBatchedMove(moves, changeType, true);
        } catch (error) {
            writeToLog('error', error);
        }
    };

    const moveListener = (e: any, newBounds: RectangleBase) => genericListener(e, newBounds, 0);
    const resizeListener = (e: any, newBounds: RectangleBase) => genericListener(e, newBounds, 1);

    listenerCache.set(win.browserWindow.nativeId, [moveListener, resizeListener]);
    win.browserWindow.on('will-move', moveListener);
    win.browserWindow.on('will-resize', resizeListener);
}

export function removeWindowFromGroup(win: OpenFinWindow) {
    if (!win.browserWindow.isDestroyed()) {
        const winId = win.browserWindow.nativeId;
        const listeners = listenerCache.get(winId);
        if (listeners) {
            win.browserWindow.removeListener('will-move', listeners[0]);
            win.browserWindow.removeListener('will-resize', listeners[1]);
        }
        listenerCache.delete(winId);
    }
}