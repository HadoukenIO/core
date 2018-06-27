/*
Copyright 2018 OpenFin Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { MessageWindow } from 'electron';
import BaseTransport from './base';
import * as coreState from '../core_state';
import * as log from '../log';

class WMCopyDataTransport extends BaseTransport {
    private _messageWindow: MessageWindow;
    private senderClass: string;
    private targetClass: string;
    private messageRetry: number = 3;

    constructor(senderClass: string, targetClass: string) {
        super();

        this.senderClass = senderClass;
        this.targetClass = targetClass;

        this.initMessageWindow();
    }

    private initMessageWindow() {
        // create hidden browser window
        this._messageWindow = new MessageWindow(this.senderClass, '');

        const msgTimeout = coreState.argo['message-timeout'];
        if (msgTimeout) {
            log.writeToLog(1, `${this.senderClass}: set message timeout to ${msgTimeout}`, true);
            this._messageWindow.setmessagetimeout(msgTimeout);
        } else {
            this._messageWindow.setmessagetimeout(1000); //default 300 ms is too short
        }
        const msgRetry = coreState.argo['message-retry'];
        if (msgRetry) {
            log.writeToLog(1, `${this.senderClass}: set message retry to ${msgRetry}`, true);
            this.messageRetry = msgRetry;
        }

        this._messageWindow.on('data', (sender: any, data: any) => {
            this.eventEmitter.emit('message', data.sender,  data.message);
        });
    }

    public publish(data: any, maskPayload?: boolean): boolean {
        if (!this._messageWindow || this._messageWindow.isDestroyed()) {
            this.initMessageWindow();
        }

        let sent = false;
        let i = 0;
        for (i = 0; i < this.messageRetry && !sent; i++) {
            sent = this._messageWindow.sendbyname(this.targetClass, '', JSON.stringify(data), !!maskPayload);
            if (!sent) {
                log.writeToLog(1, `${this.senderClass}: error sending message to ${this.targetClass}', retry=${i}`, true);
            }
        }

        return sent;
    }

}

export default WMCopyDataTransport;
