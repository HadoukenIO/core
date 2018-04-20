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


export function toSafeInt(n: number, def?: number): number {
    if (Number.isSafeInteger(n)) {
        return n;
    }

    if (typeof(n) === 'number' && Number.isFinite(n)) {
        return Math.floor(n);
    } else if (arguments.length >= 2) {
        try {
            return toSafeInt(def);
        } catch (e) {
            throw new Error(`Neither ${n} nor default value ${def} are parsable numbers.`);
        }
    } else {
        throw new Error(`${n} is not a parsable number and default value not provided.`);
    }
}
