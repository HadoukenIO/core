import { OpenFinWindow } from '../shapes';
import of_events from './of_events';
import route from '../common/route';
import { windowTransaction } from 'electron';
const WindowTransaction = require('electron').windowTransaction;

const trackerTracker = new Map<string, GroupTracker>();
export class GroupTracker {
    private windowMap: Map<string, OpenFinWindow>;
    private constructor(private groupId: string) {
       trackerTracker.set(groupId, this);
       this.windowMap = new Map();
    }
    public static getGroupTracker (id: string) {
       return trackerTracker.get(id) || new GroupTracker(id);
    }

    public addWindowToGroup(win: OpenFinWindow) {
        const winId = win.browserWindow.nativeId;
        win.browserWindow.setUserMovementEnabled(false);
        this.windowMap.set(winId, win);
        win.browserWindow.on('disabled-frame-bounds-changing', (e, bounds, changeType) => {
            switch (changeType) {
                case 0:
                    const thisBounds = this.windowMap.get(winId).browserWindow.getBounds();
                    const deltaX = thisBounds.x - bounds.x;
                    const deltaY = thisBounds.y - bounds.y;
                    const wt = new WindowTransaction.Transaction(0);
                    const { flag: { noZorder, noSize, noActivate } } = WindowTransaction;
                    const flags = noZorder + noSize + noActivate;

                    this.windowMap.forEach(win => {
                        const bounds = win.browserWindow.getBounds();
                        const hwnd = parseInt(win.browserWindow.nativeId, 16);
                        const x = bounds.x - deltaX;
                        const y = bounds.y - deltaY;
                        wt.setWindowPos(hwnd, {...bounds, x, y, flags});
                    });
                    wt.commit();
                    break;
                default:
                    break;
            }
        });
    }
    public removeWindowFromGroup(win: OpenFinWindow) {
        win.browserWindow.setUserMovementEnabled(true);
        this.windowMap.delete(win.browserWindow.nativeId);
        if (this.windowMap.size === 0) {
            trackerTracker.delete(this.groupId);
        }
    }

}