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

export type msecs = number;
export type secs = number;

export class Timer {

    private startTime: msecs;

    public static format: string = '#.###';

    constructor() {
        this.reset();
    }

    public reset(): void {
        this.startTime = Date.now();
    }

    get msecs(): msecs {
        return Date.now() - this.startTime;
    }

    get secs(): secs {
        return this.msecs / 1000;
    }

    public toString(format: string = Timer.format): string {
        const match: string[] = format.match(/#+(\.#+)?/);
        let result = this.secs.toFixed(match ? match[1].length - 1 : 0);
        if (match) {
            result = format.replace(match[0], result);
        }
        return result;
    }

}
