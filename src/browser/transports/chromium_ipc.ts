import { ChromeIpcClient } from 'electron';
import BaseTransport from './base';

class ChromiumIPCTransport extends BaseTransport {
    private connected: boolean;
    private ipc: ChromeIpcClient;

    private messageQueue: any[];
    private pipeName: string;

    constructor(pipeName: string) {
        super();

        this.pipeName = pipeName;

        this.messageQueue = [];
        this.connected = false;
        this.ipc = new ChromeIpcClient();

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

    private connect(): void {
        this.connected = false;
        this.ipc.connect(this.pipeName);
    }

    public publish(data: any): boolean {
        if (this.connected) {
            this.ipc.send(JSON.stringify(data));
        } else {
            this.messageQueue.push(data);
            this.connect();
        }

        return true;
    }
}

export default ChromiumIPCTransport;
