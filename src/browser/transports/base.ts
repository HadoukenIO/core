/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/
import {EventEmitter} from 'events';

class MyEmitter extends EventEmitter {
    constructor() {
        super();
    }
}

class BaseTransport {
    public pipeName: string;
    public eventEmitter: MyEmitter;

    constructor(pipeName: string) {
        this.pipeName = pipeName;
        this.eventEmitter = new MyEmitter();
    }

    public on(eventName: string, listener: (sender: any, data: string) => void): void {
        this.eventEmitter.on.call(this.eventEmitter, eventName, listener);
    }

    // not implemented in base
    public publish(data: any): boolean {
        return false;
    }

}

export default BaseTransport;
