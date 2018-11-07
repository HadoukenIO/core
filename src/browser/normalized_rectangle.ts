import {Rectangle, RectangleBase, Opts} from './rectangle';
import { BrowserWindow } from '../shapes';
import { System } from './api/system';

const osName: string = System.getHostSpecs().name;
const isWin10 = /Windows 10/.test(osName);


export class NormalizedRectangle extends Rectangle {
    private static framedOffset = {
        x: 7,
        y: 0,
        height: -7,
        width: -14
    };
    private static zeroDelta = { x: 0, y: 0, height: 0, width: 0 };
    public static CREATE_FROM_BROWSER_WINDOW(win: BrowserWindow) {
        const delta = isWin10 && win._options.frame
            ? NormalizedRectangle.framedOffset
            : NormalizedRectangle.zeroDelta;
        return Rectangle.CREATE_FROM_BOUNDS(win.getBounds(), win._options, Rectangle.negate(delta)).shift(delta);
    }


}