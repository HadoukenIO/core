
import { MessageWindow } from 'electron';
import BaseTransport from './base';
import * as coreState from '../core_state';
import * as log from '../log';

interface Send {
    data: any;
    maskPayload?: boolean;
    target?: string;
}

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
            this.eventEmitter.emit('message', data.sender, data.message);
        });
    }

    public publish(data: any, maskPayload?: boolean): boolean {
        return this.send({ data, maskPayload });
    }

    public send({ data, maskPayload = false, target = this.targetClass }: Send) {
        if (!this._messageWindow || this._messageWindow.isDestroyed()) {
            this.initMessageWindow();
        }

        let sent = false;
        let i = 0;

        for (i = 0; i < this.messageRetry && !sent; i++) {
            sent = this._messageWindow.sendbyname(target, '', JSON.stringify(data), maskPayload);
            if (!sent) {
                log.writeToLog(1, `${this.senderClass}: error sending message to ${target}', retry=${i}`, true);
            }
        }

        return sent;
    }

}

export default WMCopyDataTransport;
