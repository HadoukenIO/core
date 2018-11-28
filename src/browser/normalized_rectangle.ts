import { Rectangle, RectangleBase } from './rectangle';
import { BrowserWindow, OpenFinWindow } from '../shapes';
import { System } from './api/system';
import { Move } from './disabled_frame_group_tracker';

const osName: string = System.getHostSpecs().name;
const isWin10 = /Windows 10/.test(osName);
export function negate(delta: RectangleBase) {
    return {
        x: -delta.x,
        y: -delta.y,
        height: -delta.height,
        width: -delta.width
    };
}
const framedOffset: Readonly<RectangleBase> = {
    x: 7,
    y: 0,
    height: -7,
    width: -14
};
export const zeroDelta: Readonly<RectangleBase> = {x: 0, y: 0, height: 0, width: 0 };
export function moveFromOpenFinWindow(ofWin: OpenFinWindow): Move {
    const win = ofWin.browserWindow;
    const delta = isWin10 && win._options.frame
        ? framedOffset
        : zeroDelta;
    const normalizedOptions = {...win._options};
    if (normalizedOptions.maxHeight === -1) {
        normalizedOptions.maxHeight = Number.MAX_SAFE_INTEGER;
    }
    if (normalizedOptions.maxWidth === -1) {
        normalizedOptions.maxWidth = Number.MAX_SAFE_INTEGER;
    }
    if (win._options.frame) {
        normalizedOptions.minWidth = Math.max(win._options.minWidth, 150);
    }
    return [ofWin, Rectangle.CREATE_FROM_BOUNDS(win.getBounds(), normalizedOptions).shift(delta), negate(delta)];
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
// export function rawBounds(rect: RectangleBase, offset: RectangleBase) {
//     return {
//         x: rect.x,
//         y: rect.y,
//         width: rect.width,
//         height: rect.height
//     };
// }
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