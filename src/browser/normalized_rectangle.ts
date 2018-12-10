import { Rectangle, RectangleBase } from './rectangle';
import { BrowserWindow } from '../shapes';
import { System } from './api/system';

const osName: string = System.getHostSpecs().name;
const isWin10 = /Windows 10/.test(osName);
function negate(delta: RectangleBase) {
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
export function createRectangleFromBrowserWindow(win: BrowserWindow) {
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
    return Rectangle.CREATE_FROM_BOUNDS(win.getBounds(), normalizedOptions, negate(delta)).shift(delta);
}