import { Rectangle, RectangleBase } from './rectangle';
import { BrowserWindow } from '../shapes';
import { System } from './api/system';

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
export const framedOffset: Readonly<RectangleBase> = {
    x: 7,
    y: 0,
    height: -7,
    width: -14
};
const zeroDelta: Readonly<RectangleBase> = { x: 0, y: 0, height: 0, width: 0 };
export function createRectangleFromBrowserWindow(win: BrowserWindow) {
    const delta = isWin10 && win._options.frame
        ? framedOffset
        : zeroDelta;
    return Rectangle.CREATE_FROM_BOUNDS(win.getBounds(), win._options, negate(delta)).shift(delta);
}