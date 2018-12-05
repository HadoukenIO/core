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
const moveToRect = ({rect}: Move) => rect;
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
    payloadCache: [OpenFinWindow, any, RectangleBase, number][];
    interval?: any;
}
const listenerCache: Map<WinId, (...args: any[]) => void> = new Map();
const groupInfoCache: Map<string, GroupInfo> = new Map();
export interface Move {
    ofWin: OpenFinWindow; rect: Rectangle; offset: RectangleBase;
}
async function emitChange(
    {ofWin, rect, offset} : Move,
    changeType: ChangeType,
    reason: string,
    eventType: 'changing' | 'changed' = 'changing'
) {
    const topic = `bounds-${eventType}`;
    const uuid = ofWin.uuid;
    const name = ofWin.name;
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
    if (ofWin.isProxy) {
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
    const {rect, offset} = moveFromOpenFinWindow(win);
    const bounds = {...applyOffset(rect, offset), ...partialBounds};
    const newBounds = normalizeExternalBounds(bounds, offset);
    const delta = rect.delta(newBounds);
    return handleApiMove(win, delta);
}
type MoveAccumulator = { otherWindows: Move[], leader?: Move };
function handleApiMove(win: OpenFinWindow, delta: RectangleBase) {
    const {rect, offset} = moveFromOpenFinWindow(win);
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
    const {leader, otherWindows} = moves.reduce((accum: MoveAccumulator , move) => {
        move.ofWin === win ? accum.leader = move : accum.otherWindows.push(move);
        return accum;
    }, <MoveAccumulator>{otherWindows: []});
    if (!leader || leader.rect.moved(newBounds)) {
        //Propsed move differs from requested move
        throw new Error('Attempted move violates group constraints');
    }
    handleBatchedMove(moves);
    emitChange(leader, changeType, 'self', 'changed');
    otherWindows.forEach(move => emitChange(move, changeType, 'group', 'changed'));
    return leader.rect;
}

function handleBatchedMove(moves: Move[], bringWinsToFront: boolean = false) {
    if (isWin32) {
        const { flag: { noZorder, noSize, noActivate } } = WindowTransaction;
        const flags = noZorder + noActivate;
        const wt = new WindowTransaction.Transaction(0);
        moves.forEach(({ofWin, rect, offset}) => {
            const hwnd = parseInt(ofWin.browserWindow.nativeId, 16);
            wt.setWindowPos(hwnd, { ...getTransactionBounds(rect, offset), flags });
            if (bringWinsToFront) { ofWin.browserWindow.bringToFront(); }
        });
        wt.commit();
    } else {
        moves.forEach(({ofWin, rect, offset}) => {
            ofWin.browserWindow.setBounds(applyOffset(rect, offset));
            if (bringWinsToFront) { ofWin.browserWindow.bringToFront(); }
        });
    }
}
const makeTranslate = (delta: RectangleBase) => ({ofWin, rect, offset}: Move): Move => {
    return {ofWin, rect: rect.shift(delta), offset};
};
function getInitialPositions(win: OpenFinWindow) {
    return WindowGroups.getGroup(win.groupUuid).map(moveFromOpenFinWindow);
}
function handleBoundsChanging(
    win: OpenFinWindow,
    e: any,
    rawPayloadBounds: RectangleBase,
    changeType: ChangeType
): Move[] {
    const initialPositions: Move[] = getInitialPositions(win);
    let moves: Move[];
    const startMove = moveFromOpenFinWindow(win); //Corrected
    const start = startMove.rect;
    const {offset} = startMove;
    const end = normalizeExternalBounds(rawPayloadBounds, offset); //Corrected
    switch (changeType) {
        case ChangeType.POSITION:
            moves = handleMoveOnly(start, end, initialPositions);
            break;
        case ChangeType.SIZE:
            moves = handleResizeOnly(startMove, end, initialPositions);
            break;
        case ChangeType.POSITION_AND_SIZE:
            const delta = start.delta(end);
            const xShift = delta.x ? delta.x + delta.width : 0;
            const yShift = delta.y ? delta.y + delta.height : 0;
            const shift = { x: xShift, y: yShift, width: 0, height: 0 };
            const shifted = (xShift || yShift)
                ? handleMoveOnly(start, start.shift(shift), initialPositions)
                : initialPositions;
            moves = (delta.width || delta.height)
                ? handleResizeOnly(startMove, end, shifted)
                : shifted;
            break;
        default: {
            moves = [];
        } break;
    }
    return moves;
}

function handleResizeOnly(startMove: Move, end: RectangleBase, initialPositions: Move[]) {
    const start = startMove.rect;
    const win = startMove.ofWin;
    const allMoves = initialPositions
        .map(({ofWin, rect, offset}): Move => {
            const movedRect = rect.move(start, end);
            return {ofWin, rect: movedRect, offset};
        });
    const moves = allMoves.filter((move, i) => initialPositions[i].rect.moved(move.rect));

    const graphInitial = Rectangle.GRAPH_WITH_SIDE_DISTANCES(initialPositions.map(moveToRect));
    const graphFinal = Rectangle.GRAPH_WITH_SIDE_DISTANCES(allMoves.map(moveToRect));
    if (!Rectangle.SUBGRAPH_AND_CLOSER(graphInitial, graphFinal)) {
        return [];
    }
    const endMove = moves.find(({ofWin}) => ofWin === win);
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
    const listener = (e: any, rawPayloadBounds: RectangleBase, changeType: ChangeType) => {
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
                emitChange(move, changeType, move.ofWin === win ? 'self' : 'group');
            });
            groupInfo.interval = setInterval(() => {
                if (groupInfo.payloadCache.length) {
                    const [a, b, c, d] = groupInfo.payloadCache.pop();
                    const moves = handleBoundsChanging(a, b, c, d);
                    groupInfo.payloadCache = [];
                    handleBatchedMove(moves);
                    moves.forEach((move) => {
                        moved.add(move.ofWin);
                    });
                }
            }, 16);
            win.browserWindow.once('disabled-frame-bounds-changed', (e: any, rawPayloadBounds: RectangleBase, changeType: ChangeType) => {
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