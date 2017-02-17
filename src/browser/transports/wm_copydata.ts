/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/
import {BrowserWindow} from 'electron';
import BaseTransport from './base';

class WMCopyDataTransport extends BaseTransport {
    private _win: BrowserWindow;

    constructor(pipeName: string) {
        super(pipeName);

        this.initMessageWindow();
    }

    private initMessageWindow() {
        // create hidden browser window
        this._win = new BrowserWindow({
            width: 10,
            height: 10,
            show: false
        });

        this._win.on('message/wm-copydata', (a: any, wnd: any, msg: any) => { // todo: define types
            this.eventEmitter.emit('message', wnd, msg);
        });
    };

    public publish(data: any, timeout: number = 1000): boolean {
        // on windows x64 platform still returns win32
        if (!this._win.isDestroyed()) {
            this.initMessageWindow();
        }
        if (process.platform.indexOf('win32') !== -1 && !this._win.isDestroyed() ) {
            const windowList = this._win.getWindowsByClassName(this.pipeName);

            if (!windowList.length) {
                return false;
            }

            windowList.forEach((hWnd: any) => { // todo: define 'hWnd' type
                this._win.sendMessageToWindowByHwnd(hWnd, timeout, JSON.stringify(data));
            });

            return true;
        }

        return false;
    };

}

export default WMCopyDataTransport;
