import { Rectangle, RectangleBase } from './rectangle';
import { ExternalWindow } from 'electron';
import { GroupWindow } from '../shapes';
import { System } from './api/system';
import { Move } from './disabled_frame_group_tracker';

const osName: string = System.getHostSpecs().name;
const isWin10 = /Windows 10/.test(osName);
const isWin32 = process.platform === 'win32';

export function negate(delta: RectangleBase) {
    return {
        x: -delta.x,
        y: -delta.y,
        height: -delta.height,
        width: -delta.width
    };
}
export const zeroDelta: Readonly<RectangleBase> = {x: 0, y: 0, height: 0, width: 0 };
export function moveFromOpenFinWindow(ofWin: GroupWindow): Move {
    const { browserWindow } = ofWin;
    let bounds;
    if (isWin32) {
        bounds = (<any>ExternalWindow).getBoundsWithoutShadow(browserWindow.nativeId);
    } else {
        bounds = browserWindow.getBounds();
    }
    // Fix this, no longer necessary
    const delta = zeroDelta;
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
    if (normalizedOptions.maxHeight) { normalizedOptions.maxHeight += delta.height; }
    if (normalizedOptions.minHeight) { normalizedOptions.minHeight += delta.height; }
    if (normalizedOptions.maxWidth) { normalizedOptions.maxWidth += delta.width; }
    if (normalizedOptions.minWidth) { normalizedOptions.minWidth += delta.width; }
    return {
        ofWin,
        rect: Rectangle.CREATE_FROM_BOUNDS(bounds, normalizedOptions).shift(delta),
        offset: negate(delta)
    };
}
export function applyOffset(rect: RectangleBase, offset: RectangleBase = zeroDelta) {
    return {
        x: rect.x + offset.x,
        y: rect.y + offset.y,
        width: rect.width + offset.width,
        height: rect.height + offset.height
    };
}
export function normalizeExternalBounds(rect: RectangleBase, offset: RectangleBase) {
    return applyOffset(rect, negate(offset));
}
export function getEventBounds(rect: RectangleBase, offset?: RectangleBase) {
    const normalizedBounds = applyOffset(rect, offset);
    return {
        left: normalizedBounds.x,
        top: normalizedBounds.y,
        width: normalizedBounds.width,
        height: normalizedBounds.height
    };
}
export function getTransactionBounds(rect: RectangleBase, offset?: RectangleBase) {
    const normalizedBounds = applyOffset(rect, offset);
    return {
        x: normalizedBounds.x,
        y: normalizedBounds.y,
        w: normalizedBounds.width,
        h: normalizedBounds.height
    };
}
