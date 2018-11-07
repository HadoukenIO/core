import { OpenFinWindow } from '../shapes';
import of_events from './of_events';
import route from '../common/route';
import { BrowserWindow } from 'electron';
const WindowTransaction = require('electron').windowTransaction;
import {RectangleBase} from './rectangle';
import {NormalizedRectangle as Rectangle} from './normalized_rectangle';
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
const groupTrackerCache = new Map<string, GroupTracker>();
export class GroupTracker {
    private windowMap: Map<WinId, OpenFinWindow>;
    private listenerCache: Map<WinId, (...args: any[]) => void> = new Map();
    private interval: any;
    private boundsChanging = false;
    private constructor(private groupId: string) {
       groupTrackerCache.set(groupId, this);
       this.windowMap = new Map();
    }
    public static GET_GROUP_TRACKER (id: string) {
       return groupTrackerCache.get(id) || new GroupTracker(id);
    }
    private payloadCache: [string, any, RectangleBase, number][] = [];
    public addWindowToGroup(win: OpenFinWindow) {
        const winId = <WinId>win.browserWindow.nativeId;
        win.browserWindow.setUserMovementEnabled(false);
        this.windowMap.set(winId, win);
        //Need to remove handler on leave
        const listener = (e: any, newBounds: RectangleBase, changeType: number) => {
            if (this.boundsChanging) {
                this.payloadCache.push([winId, e, newBounds, changeType]);
            } else {
                const uuid = win.uuid;
                const name = win.name;
                const rect = Rectangle.CREATE_FROM_BROWSER_WINDOW(win.browserWindow);
                const moved = new Set();
                of_events.emit(route.window('begin-user-bounds-changing', uuid, name), {
                    ...rect.eventBounds,
                    uuid,
                    name,
                    topic: 'begin-user-bounds-changing',
                    type: 'window',
                    windowState: getState(win.browserWindow)
                });
                this.boundsChanging = true;
                this.handleBoundsChanging(winId, e, newBounds, changeType);
                this.interval = setInterval(() => {
                    if (this.payloadCache.length) {
                        const [a, b, c, d] = this.payloadCache.pop();
                        const moves = this.handleBoundsChanging(a, b, c, d);
                        moves.forEach((pair) => {
                            moved.add(pair[0].browserWindow.nativeId);
                            this.emitChange(pair, d);
                        });
                       this.payloadCache = [];
                    }
                }, 16);
                win.browserWindow.once('disabled-frame-bounds-changed', (e: any, newBounds: RectangleBase, changeType: number) => {
                    this.boundsChanging = false;
                    clearInterval(this.interval);
                    this.payloadCache = [];
                    this.handleBoundsChanging(winId, e, newBounds, changeType);
                    moved.forEach((winId) => {
                        const win = this.windowMap.get(winId);
                        const rect = Rectangle.CREATE_FROM_BROWSER_WINDOW(win.browserWindow);
                        this.emitChange([win, rect], changeType, 'changed');
                    });
                });
            }
        };
        this.listenerCache.set(winId, listener);
        win.browserWindow.on('disabled-frame-bounds-changing', listener);
    }
    private handleBatchedMove(moves: [OpenFinWindow, Rectangle][]) {
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
    private emitChange = (
        [win, rect] : [OpenFinWindow, Rectangle],
        changeType: number,
        eventType: 'changing' | 'changed' = 'changing'
    ) => {
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
    private handleBoundsChanging = (
        winId: WinId,
        e: any,
        payloadBounds: RectangleBase,
        changeType: number
    ) => {
        let moves: [OpenFinWindow, Rectangle][] = [];
        const thisWin = this.windowMap.get(winId);
        const thisRect = Rectangle.CREATE_FROM_BROWSER_WINDOW(thisWin.browserWindow);
        const newBounds = thisRect.applyOffset(payloadBounds);
        switch (changeType) {
            case 0: {
                const delta = thisRect.delta(newBounds);
                moves = Array.from(this.windowMap, ([id, win]): [OpenFinWindow, Rectangle] => {
                    const bounds = win.browserWindow.getBounds();
                    const rect = Rectangle.CREATE_FROM_BROWSER_WINDOW(win.browserWindow).shift(delta);
                    return [win, rect];
                });
            } break;
            default: {
                this.windowMap.forEach(win => {
                    const baseRect = Rectangle.CREATE_FROM_BROWSER_WINDOW(win.browserWindow);
                    const movedRect = baseRect.move(thisRect, newBounds);
                    if (baseRect.moved(movedRect)) {
                        moves.push([win, movedRect]);
                    }
                });
            } break;
        }
        this.handleBatchedMove(moves);
        return moves;
    };
    public removeWindowFromGroup = (win: OpenFinWindow) => {
        win.browserWindow.setUserMovementEnabled(true);
        const winId = win.browserWindow.nativeId;
        win.browserWindow.removeListener('disabled-frame-bounds-changing', this.listenerCache.get(winId));
        this.listenerCache.delete(winId);
        this.windowMap.delete(winId);
        if (this.windowMap.size === 0) {
            groupTrackerCache.delete(this.groupId);
        }
    }

}