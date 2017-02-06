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
class IntPool {
    public currInt: number;
    public releasedBuffer: number[];

    constructor() {
        this.currInt = 1;
        this.releasedBuffer = [];
    }

    /**
     * Returns an integer. Gets it from either a previously
     * released pool of integers, or by creating a new one
     */
    public next(): number {
        let next: number;

        if (this.releasedBuffer.length) {
            next = this.releasedBuffer.shift();
        } else {
            next = this.currInt;
            this.currInt += 1;
        }

        return next;
    }

    /**
     * Releases an integer. Puts in a pool of released
     * integers, if it's not there yet.
     */
    public release(releasedInt: number): void {
        if (this.releasedBuffer.indexOf(releasedInt) === -1) {
            this.releasedBuffer.push(releasedInt);
            this.releasedBuffer.sort();
        }
    }
}

export default new IntPool();