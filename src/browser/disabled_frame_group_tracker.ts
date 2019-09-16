import { getRuntimeProxyWindow } from './window_groups_runtime_proxy';
import { GroupWindow } from '../shapes';
import { ExternalWindow } from 'electron';
import { moveFromOpenFinWindow, getEventBounds, getTransactionBounds } from './normalized_rectangle';
import of_events from './of_events';
import route from '../common/route';
import { RectangleBase, Rectangle } from './rectangle';
import { restore } from './api/native_window';
import WindowGroups from './window_groups';
const WindowTransaction = require('electron').windowTransaction;
import { writeToLog } from './log';
import {release} from 'os';

const isWin32 = process.platform === 'win32';
const isWin10 = isWin32 && release().split('.')[0] === '10';
    // Use disabled frame bounds changing events for mac os and for external native windows
const usesDisabledFrameEvents = (win: GroupWindow) => win.isExternalWindow || !isWin32;
enum ChangeType {
    POSITION = 0,
    SIZE = 1,
    POSITION_AND_SIZE = 2
}
type MoveAccumulator = { otherWindows: Move[], leader?: Move };
type WinId = string;
const listenerCache: Map<WinId, Array<(...args: any[]) => void>> = new Map();
export interface Move { ofWin: GroupWindow; rect: Rectangle; }

async function raiseEvent(groupWindow: GroupWindow, topic: string, payload: Object) {
    const { uuid, name, isProxy, isExternalWindow } = groupWindow;
    const identity = { uuid, name };
    const eventName = isExternalWindow ? route.externalWindow(topic, uuid, name) : route.window(topic, uuid, name);

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

function emitChange(topic: string, ofWin: GroupWindow, changeType: ChangeType, reason: string) {
    const rect = ofWin.browserWindow.getBounds();
    const eventBounds = getEventBounds(rect);
    const eventArgs = {
        ...eventBounds,
        changeType,
        reason,
        deferred: true
    };
    raiseEvent(ofWin, topic, eventArgs);
}

export function updateGroupedWindowBounds(win: GroupWindow, delta: Partial<RectangleBase>) {
    const zeroDelta: RectangleBase = { x: 0, y: 0, height: 0, width: 0 };
    const shift = { ...zeroDelta, ...delta };
    return handleApiMove(win, shift);
}

function getLeaderDelta(win: GroupWindow, bounds: Partial<RectangleBase>): RectangleBase {
    const { rect } = moveFromOpenFinWindow(win);
    // Could be partial bounds from an API call
    const end = { ...rect, ...bounds };
    return rect.delta(end);
}

export function setNewGroupedWindowBounds(win: GroupWindow, partialBounds: Partial<RectangleBase>) {
    const delta = getLeaderDelta(win, partialBounds);
    return handleApiMove(win, delta);
}

function handleApiMove(win: GroupWindow, delta: RectangleBase) {
    const { rect } = moveFromOpenFinWindow(win);
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
    const moves = generateWindowMoves(win, newBounds, changeType);
    const { leader, otherWindows } = moves.reduce((accum: MoveAccumulator, move) => {
        move.ofWin === win ? accum.leader = move : accum.otherWindows.push(move);
        return accum;
    }, <MoveAccumulator>{ otherWindows: [] });
    if (!leader || leader.rect.moved(newBounds)) {
        //Proposed move differs from requested move
        throw new Error('Attempted move violates group constraints');
    }
    handleBatchedMove(moves);
    emitChange('bounds-changed', win, changeType, 'self');
    otherWindows.map(({ofWin}) => emitChange('bounds-changed', ofWin, changeType, 'group'));
    return leader.rect;
}

function handleBatchedMove(moves: Move[]) {
    if (isWin32) {
        const { flag: { noZorder, noActivate } } = WindowTransaction;
        const flags = noZorder + noActivate;
        const wt = new WindowTransaction.Transaction(0);
        moves.forEach(({ ofWin, rect }) => {
            const hwnd = parseInt(ofWin.browserWindow.nativeId, 16);
            let bounds: RectangleBase;
            if (isWin10 && ofWin._options.frame) {
                bounds = (<any>ExternalWindow).addShadow(ofWin.browserWindow.nativeId, rect);
            } else {
                bounds = rect;
            }

            (<any>wt.setWindowPos)(hwnd, { ...getTransactionBounds(bounds), flags, scale: false });
        });
        wt.commit();
    } else {
        moves.forEach(({ ofWin, rect }) => {
            ofWin.browserWindow.setBounds(rect);
        });
    }
}

const getInitialPositions = (win: GroupWindow) => WindowGroups.getGroup(win.groupUuid).map(moveFromOpenFinWindow);

const handleMoveOnly = (delta: RectangleBase, initialPositions: Move[]) => {
    return initialPositions.map(({ ofWin, rect }) => ({ ofWin, rect: rect.shift(delta)}));
};

function generateWindowMoves(win: GroupWindow, rawBounds: RectangleBase, changeType: ChangeType): Move[] {
    const initialPositions: Move[] = getInitialPositions(win);
    let moves: Move[];
    const delta = getLeaderDelta(win, rawBounds);
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
            if (moved) {
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

function handleResizeOnly(win: GroupWindow, delta: RectangleBase) {
    const initialPositions = getInitialPositions(win);
    const rects = initialPositions.map(x => x.rect);
    const leaderRectIndex = initialPositions.map(x => x.ofWin).indexOf(win);
    const start = rects[leaderRectIndex];
    const iterMoves = Rectangle.PROPAGATE_MOVE(leaderRectIndex, start, delta, rects);

    const allMoves = iterMoves.map((rect, i) => ({
        ofWin: initialPositions[i].ofWin,
        rect}));

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

export function addWindowToGroup(win: GroupWindow) {
    let moved = new Set<GroupWindow>();
    let boundsChanging = false;
    let interval: any;
    let payloadCache: RectangleBase[] = [];
    if (usesDisabledFrameEvents(win)) {
        win.browserWindow.setUserMovementEnabled(false);
    }

    const handleEndBoundsChanging = (changeType: ChangeType) => {
        // Emit expected events that aren't automatically emitted
        moved.forEach((movedWin) => {
            const isLeader = movedWin === win;
            if (!isLeader || win.isExternalWindow) {
                // bounds-changed is emitted for the leader, but not other windows
                emitChange('bounds-changed', movedWin, changeType, 'group');
            }
        });
        // Reset map of moved windows and flags for native windows and mac OS
        boundsChanging = false;
        payloadCache = [];
        clearInterval(interval);
        interval = null;
        moved = new Set<GroupWindow>();
    };

    const handleBoundsChanging = (e: any, rawPayloadBounds: RectangleBase, changeType: ChangeType) => {
        try {
            e.preventDefault();
            if (isWin32) {
                // Use externalWindow static methods to remove the framed offset for Win10 windows
                const adjustedBounds: any = (<any>ExternalWindow).removeShadow(win.browserWindow.nativeId, rawPayloadBounds);
                rawPayloadBounds = Rectangle.CREATE_FROM_BOUNDS(adjustedBounds);
            }
            const moves = generateWindowMoves(win, rawPayloadBounds, changeType);
            // Keep track of which windows have moved in order to emit events
            moves.forEach(({ofWin}) => moved.add(ofWin));
            if (!boundsChanging) {
                boundsChanging = true;
                const endingEvent = isWin32 ? 'end-user-bounds-change' : 'disabled-frame-bounds-changed';
                win.browserWindow.once(endingEvent, handleEndBoundsChanging);
                WindowGroups.getGroup(win.groupUuid).forEach(win => win.browserWindow.bringToFront());
            }
            if (moves.length) {
                // bounds-changing is not emitted for the leader, but is for the other windows
                const leaderMove = moves.find(({ofWin}) => ofWin.uuid === win.uuid && ofWin.name === win.name);
                if (leaderMove && typeof leaderMove === 'object') {
                    // Execute the actual move
                    handleBatchedMove(moves);
                    emitChange('bounds-changing', win, changeType, 'self');
                }
            }
        } catch (error) {
            writeToLog('error', error);
        }
    };

    const setupInterval = (changeType: ChangeType, raiseBeginEventBounds?: RectangleBase) => {
        interval = setInterval(() => {
            if (payloadCache.length) {
                const bounds = payloadCache.pop();
                // tslint:disable-next-line:no-empty - need to mock prevent default
                handleBoundsChanging({preventDefault: () => {}}, bounds, changeType);
                payloadCache = [];
            }
        }, 30);
        if (raiseBeginEventBounds) {
            raiseEvent(win, 'begin-user-bounds-changing', { ...raiseBeginEventBounds, windowState: 'normal' });
        }
    };
    const moveListener = (e: any, rawBounds: RectangleBase) => handleBoundsChanging(e, rawBounds, ChangeType.POSITION);
    const resizeListener = (e: any, rawBounds: RectangleBase) => handleBoundsChanging(e, rawBounds, ChangeType.SIZE);
    const restoreListener = () => WindowGroups.getGroup(win.groupUuid).forEach(({browserWindow}) => restore(browserWindow));
    const disabledFrameListener = (e: any, rawBounds: RectangleBase, changeType: ChangeType) => {
        payloadCache.push(rawBounds);
        // Setup an interval to get around aero-shake issues in native external windows
        if (!interval) {
            changeType = changeType !== ChangeType.POSITION_AND_SIZE ? changeType : ChangeType.SIZE;
            setupInterval(changeType, rawBounds);
        }
    };

    if (usesDisabledFrameEvents(win)) {
        win.browserWindow.on('disabled-frame-bounds-changing', disabledFrameListener);
        listenerCache.set(win.browserWindow.nativeId, [disabledFrameListener]);
    } else {
        win.browserWindow.on('will-move', moveListener);
        win.browserWindow.on('will-resize', resizeListener);
        win.browserWindow.on('begin-user-bounds-change', restoreListener);
        listenerCache.set(win.browserWindow.nativeId, [moveListener, resizeListener, restoreListener]);
    }
}

export function removeWindowFromGroup(win: GroupWindow) {
    const winId = win.browserWindow.nativeId;
    if (!win.browserWindow.isDestroyed()) {
        const listeners = listenerCache.get(winId);
        if (usesDisabledFrameEvents(win)) {
            win.browserWindow.removeListener('disabled-frame-bounds-changing', listeners[0]);
            win.browserWindow.setUserMovementEnabled(true);
        } else {
            win.browserWindow.removeListener('will-move', listeners[0]);
            win.browserWindow.removeListener('will-resize', listeners[1]);
            win.browserWindow.removeListener('begin-user-bounds-change', listeners[2]);
        }
    }
    listenerCache.delete(winId);
}
