import { Rectangle } from 'electron';
import { BrowserWindow } from '../shapes';

export default clipBounds;

/**
 * Clip width and height values to be within allowed maximum
 */
function clipBounds(bounds: Rectangle, browserWindow: BrowserWindow): Rectangle {
    if (!('_options' in browserWindow)) {
        return bounds;
    }

    const {
        minWidth,
        minHeight,
        maxWidth,
        maxHeight
    } = browserWindow._options;

    return {
        x: bounds.x,
        y: bounds.y,
        width: clamp(bounds.width, minWidth, maxWidth),
        height: clamp(bounds.height, minHeight, maxHeight)
    };
}

/**
 * Adjust the number to be within the range of minimum and maximum values
 */
function clamp(num: number, min: number = 0, max: number = Number.MAX_SAFE_INTEGER): number {
    max = max < 0 ? Number.MAX_SAFE_INTEGER : max;
    return Math.min(Math.max(num, min, 0), max);
}
