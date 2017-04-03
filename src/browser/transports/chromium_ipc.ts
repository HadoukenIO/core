/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/
import BaseTransport from './base';
import {chromeIpcClient} from 'electron';

class ChromiumIPCTransport extends BaseTransport {
    public connected: boolean;
    public ipc: chromeIpcClient;

    private messageQueue: any[];
    private pipeName: string;

    constructor(pipeName: string) {
        super();

        this.pipeName = pipeName;

        this.messageQueue = [];
        this.connected = false;
        this.ipc = new chromeIpcClient();

        this.ipc.on('channel-error', () => {
            this.connected = false;
            this.ipc.close();
            this.eventEmitter.emit('ipc-error');
        });

        this.ipc.on('channel-connected', () => {
            this.connected = true;
            this.eventEmitter.emit('ipc-connected');
            this.messageQueue.forEach(msg => this.publish(msg));
            this.messageQueue.length = 0;
        });
    }

    public connect(): void {
        this.connected = false;
        this.ipc.connect(this.pipeName);
    }

    public publish(data: any): boolean {
        if (this.connected) {
            this.ipc.send(JSON.stringify(data));
        } else {
            this.connect();
            this.messageQueue.push(data);
        }

        return true;
    }
}

export default ChromiumIPCTransport;
