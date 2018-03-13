/*
Copyright 2017 OpenFin Inc.

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
import * as EventEmitter from 'events';

const evt = {
    nodeAdded: 'node-added',
    nodeRemoved: 'node-removed'
};

export class EmitterMap<T> extends EventEmitter {
    constructor() {
        super();
        this._map = new Map<string, T>();

    }

    private _map: Map<string, any>;

    get size(): number {
        return this._map.size;
    }
    //tslint is being dumb about iterators.
    // tslint:disable-next-line
    [Symbol.iterator](): IterableIterator<[string, T]> {
        return this._map.entries();
    }

    public set = (key: string, node: any): void => {
        this._map.set(key, node);
        this.emit(evt.nodeAdded, key, node);
    }

    public remove = (key: string): void => {
        const node = this._map.get(key);
        this._map.delete(key);
        this.emit(evt.nodeRemoved, key, node);
    }

    public get = (key: string): any => {
        return this._map.get(key);
    }

}
