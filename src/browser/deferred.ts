import { BrowserWindow, Rectangle } from 'electron';
import { BrowserWindow as BrowserWindowOF } from '../shapes';
import { toSafeInt } from '../common/safe_int';
import { clipBounds } from './utils';

export default { handleMove };

const isWin32 = process.platform === 'win32';

/**
 * Interface of window bounds that are passed in and need to be checked.
 */
interface Bounds {
    x?: number;
    y?: number;
    w?: number;
    h?: number;
}

export function handleMove(windowId: number, bounds: Bounds): void {
    const browserWindow = <BrowserWindowOF>BrowserWindow.fromId(windowId);

    if (isWin32 && browserWindow && (browserWindow.isMinimized() || browserWindow.isMaximized())) {
        const oldBounds: Rectangle = browserWindow.getBounds();
        const newBounds: Rectangle = {
            x: toSafeInt(bounds.x, oldBounds.x),
            y: toSafeInt(bounds.y, oldBounds.y),
            width: toSafeInt(bounds.w, oldBounds.width),
            height: toSafeInt(bounds.h, oldBounds.height)
        };

        browserWindow.setWindowPlacement(clipBounds(newBounds, browserWindow));

        // Emitting this event, because Electron doesn't
        // dispatch 'bounds-changed' event on setWindowPlacement
        browserWindow.emit('bounds-changed');
    }
}
