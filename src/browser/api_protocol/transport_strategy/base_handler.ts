/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/
/**
 * The RequestHandler handler class provides middlewear functionality to a
 * generic list of handlers. Each handler will get the same payload that gets
 * fed in by the `handle` method and a `next` function that will run the next
 * handler in the list. Not calling the `next` function will result in
 * downstream handlers not being called.
 */

const system = require('../../api/system').System;

export default class RequestHandler<T> {
    private handlers: Array<any> = [];

    private mkNext(fn: any, msg: any) {
        return (locals?: object) => {
            // Add any middleware data to the message in locals property to be utilized in the individual api handlers
            if (locals) {
                msg.data.locals = msg.data.locals ? Object.assign(msg.data.locals, locals) : locals;
            }
            const currFnIdx = this.handlers.indexOf(fn);
            const handlersLen = this.handlers.length;

            if (currFnIdx < handlersLen - 1) {
                const nextHandler = this.handlers[currFnIdx + 1];
                nextHandler(msg, this.mkNext(nextHandler, msg));
            } else {
                // this is an unhandled message
                // add onUnhandled emit? extend EE?
                system.debugLog(1, 'Unhandled Message');
            }
        };
    }

    /**
     * Add a handler to the end of the handlers array.
     */
    public addHandler(cb: (msg: T, next: () => void) => any): RequestHandler<T> {
        this.handlers.push(cb);

        return this;
    }

    /**
     * Add a handler to the beginning of the handlers array. ALL of these
     * functions will be fired before ANY of the functions added via the
     * addHandler method
     */
    public addPreProcessor(cb: (msg: T, next: () => void) => any): RequestHandler<T> {
        this.handlers.unshift(cb);

        return this;
    }

    public handle(msg: T): RequestHandler<T> {
        if (this.handlers.length) {
            const firstHandler = this.handlers[0];
            firstHandler(msg, this.mkNext(firstHandler, msg));
        }

        return this;
    }
}
