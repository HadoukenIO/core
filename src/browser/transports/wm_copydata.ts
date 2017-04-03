/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/
import BaseTransport from './base';

const MessageWindow = require('electron').MessageWindow;

class WMCopyDataTransport extends BaseTransport {
    private _messageWindow: any;
    private senderClass: string;
    private targetClass: string;

    constructor(senderClass: string, targetClass: string) {
        super();
        this.senderClass = senderClass;
        this.targetClass = targetClass;

        // on windows x64 platform still returns win32
        if (process.platform.indexOf('win32') !== -1) {
            this.initMessageWindow();
        }
    }

    private initMessageWindow() {
        // create hidden browser window
        this._messageWindow = new MessageWindow(this.senderClass, '');

        this._messageWindow.on('data', (sender: any, data: any) => {
            this.eventEmitter.emit('message', data.sender,  data.message);
        });
    };

    public publish(data: any): boolean {
        // on windows x64 platform still returns win32
        if (process.platform.indexOf('win32') !== -1) {

            if (!this._messageWindow || this._messageWindow.isDestroyed()) {
                this.initMessageWindow();
            }

            this._messageWindow.sendbyname(this.targetClass, '', JSON.stringify(data));

            return true;
        }
        return false;
    };

}

export default WMCopyDataTransport;
