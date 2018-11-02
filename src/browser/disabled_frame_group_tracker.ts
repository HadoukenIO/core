import { OpenFinWindow } from '../shapes';
import of_events from './of_events';
import route from '../common/route';
import { windowTransaction } from 'electron';
const WindowTransaction = require('electron').windowTransaction;
import {Rectangle, RectangleBase} from './rectangle';
import { writeToLog } from './log';

/*
TODO deregister listener on leave group
Edge cases
restore frame on leave
disabled window movi  ng
event propagation
*/

const groupTrackerCache = new Map<string, GroupTracker>();
export class GroupTracker {
    private windowMap: Map<string, OpenFinWindow>;
    private listenerCache: Map<string, (...args: any[]) => void> = new Map();
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
        const winId = win.browserWindow.nativeId;
        win.browserWindow.setUserMovementEnabled(false);
        this.windowMap.set(winId, win);
        //Need to remove handler on leave
        const listener = (e: any, newBounds: RectangleBase, changeType: number) => {
            if (this.boundsChanging) {
                this.payloadCache.push([winId, e, newBounds, changeType]);
            } else {
                this.boundsChanging = true;
                this.handleBoundsChanging(winId, e, newBounds, changeType);
                this.interval = setInterval(() => {
                    if (this.payloadCache.length) {
                       const [a, b, c, d] = this.payloadCache.pop();
                       this.handleBoundsChanging(a, b, c, d);
                       this.payloadCache = [];
                    }
                }, 16);
                win.browserWindow.once('disabled-frame-bounds-changed', (e: any, newBounds: RectangleBase, changeType: number) => {
                    this.boundsChanging = false;
                    this.payloadCache = [];
                    this.handleBoundsChanging(winId, e, newBounds, changeType);
                    clearInterval(this.interval);
                });
            }
        };
        this.listenerCache.set(winId, listener);
        win.browserWindow.on('disabled-frame-bounds-changing', listener);
    }

    private handleBoundsChanging = (winId: string, e: any, newBounds: RectangleBase, changeType: number): any => {
        const win = this.windowMap.get(winId);
        switch (changeType) {
            case 0: {
                const thisBounds = this.windowMap.get(winId).browserWindow.getBounds();
                const delta = Rectangle.CREATE_FROM_BOUNDS(thisBounds).delta(newBounds);
                const wt = new WindowTransaction.Transaction(0);
                const { flag: { noZorder, noSize, noActivate } } = WindowTransaction;
                const flags = noZorder + noSize + noActivate;

                this.windowMap.forEach(win => {
                    const bounds = win.browserWindow.getBounds();
                    const hwnd = parseInt(win.browserWindow.nativeId, 16);
                    const rect = Rectangle.CREATE_FROM_BOUNDS(bounds).shift(delta).transactionBounds;
                    wt.setWindowPos(hwnd, { ...rect, flags });
                });
                wt.commit();
            } break;
            default: {
                const thisRect = Rectangle.CREATE_FROM_BROWSER_WINDOW(this.windowMap.get(winId).browserWindow);
                const moveZone = thisRect.outerBounds(newBounds);
                const wt = new WindowTransaction.Transaction(0);
                const { flag: { noZorder, noActivate } } = WindowTransaction;
                const flags = noZorder + noActivate;
                const otherWindows = Array.from(this.windowMap.values()).filter(w => w !== win);
                const otherRects = otherWindows.map(w => Rectangle.CREATE_FROM_BROWSER_WINDOW(w.browserWindow));
                const adjacent = thisRect.adjacent(otherRects);
                this.windowMap.forEach(win => {
                    const bounds = win.browserWindow.getBounds();
                    const hwnd = parseInt(win.browserWindow.nativeId, 16);
                    const rect = Rectangle.CREATE_FROM_BOUNDS(bounds).move(thisRect, newBounds).transactionBounds;
                    wt.setWindowPos(hwnd, { ...rect, flags });
                });
                wt.commit();
            } break;
            // default: {
            //     const thisBounds = this.windowMap.get(winId).browserWindow.getBounds();
            //     const delta = Rectangle.CREATE_FROM_BOUNDS(thisBounds).delta(newBounds);
            //     const wt = new WindowTransaction.Transaction(0);
            //     const { flag: { noZorder, noActivate } } = WindowTransaction;
            //     const flags = noZorder + noActivate;

            //     this.windowMap.forEach(win => {
            //         const bounds = win.browserWindow.getBounds();
            //         const hwnd = parseInt(win.browserWindow.nativeId, 16);
            //         const rect = Rectangle.CREATE_FROM_BOUNDS(bounds).move(thisBounds, newBounds).transactionBounds;
            //         wt.setWindowPos(hwnd, { ...rect, flags });
            //     });
            //     wt.commit();

            // }break;
        }
    }
    public removeWindowFromGroup(win: OpenFinWindow) {
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