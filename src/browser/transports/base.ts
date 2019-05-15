import { EventEmitter } from 'events';

class MyEmitter extends EventEmitter {
    constructor() {
        super();
    }
}

abstract class BaseTransport {
    protected eventEmitter: MyEmitter;

    constructor() {
        this.eventEmitter = new MyEmitter();
    }

    public on(eventName: string, listener: (sender: any, data: string) => void): void {
        this.eventEmitter.on.call(this.eventEmitter, eventName, listener);
    }

    public removeAllListeners(): void {
        this.eventEmitter.removeAllListeners();
    }

    public removeListener(eventName: string, listener: (...args: any[]) => void): void {
        this.eventEmitter.removeListener(eventName, listener);
    }

    // not implemented in base
    public abstract publish(data: any): boolean;
}

export default BaseTransport;
