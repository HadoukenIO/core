import { Rectangle, RectangleBase } from './rectangle';
import { ExternalWindow } from 'electron';
import { GroupWindow } from '../shapes';
import { Move } from './disabled_frame_group_tracker';

const isWin32 = process.platform === 'win32';

export function moveFromOpenFinWindow(ofWin: GroupWindow): Move {
    const { browserWindow } = ofWin;
    let bounds;
    if (isWin32) {
        bounds = (<any>ExternalWindow).getBoundsWithoutShadow(browserWindow.nativeId);
    } else {
        bounds = browserWindow.getBounds();
    }
    // Fix this, no longer necessary
    const normalizedOptions = {...browserWindow._options};
    if (normalizedOptions.maxHeight === -1) {
        normalizedOptions.maxHeight = Number.MAX_SAFE_INTEGER;
    }
    if (normalizedOptions.maxWidth === -1) {
        normalizedOptions.maxWidth = Number.MAX_SAFE_INTEGER;
    }
    if (browserWindow._options.frame) {
        normalizedOptions.minWidth = Math.max(browserWindow._options.minWidth, 150);
    } if (browserWindow._options.resizable === false) {
        normalizedOptions.maxHeight = bounds.height;
        normalizedOptions.minHeight = bounds.height;
        normalizedOptions.maxWidth = bounds.width;
        normalizedOptions.minWidth = bounds.width;
    }
    return {
        ofWin,
        rect: Rectangle.CREATE_FROM_BOUNDS(bounds, normalizedOptions)
    };
}
export function getEventBounds(rect: RectangleBase) {
    return {
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height
    };
}
export function getTransactionBounds(rect: RectangleBase) {
    return {
        x: rect.x,
        y: rect.y,
        w: rect.width,
        h: rect.height
    };
}
