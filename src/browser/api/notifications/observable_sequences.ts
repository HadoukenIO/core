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
import * as Rx from 'rx';
import {Identity} from './shapes';

export const createdNotes = new Rx.Subject();
export const creates = new Rx.Subject();
export const pending = new Rx.Subject();
export const position = new Rx.Subject();
export const removes = new Rx.Subject();
export const requestNoteClose = new Rx.Subject();
export const isAnimating = new Rx.BehaviorSubject(false);
export const removesCounter = removes.map(() => -1);
export const createsCounter = creates.map(() => 1);

export const runningTotal = Rx.Observable.merge(removesCounter, createsCounter)
    .scan((acc: number, value: number) => acc + value);

export const noteStack = Rx.Observable.merge(
    createdNotes.map((x: { identity: Identity, options: any }) => {
        // opacity added here to change the property in genAnimationFunction
        return {
            create: 1,
            name: x.identity.name,
            uuid: x.identity.uuid,
            opacity: x.options.finalOpacity
        };
    }),
    removes.map((x: Identity) => {
        return {
            create: 0,
            name: x.name,
            uuid: x.uuid,
            opacity: null
        };
    }))
    .distinctUntilChanged()
    .scan((acc, value) => {

        if (value.create) {
            const idxRemoved = acc.map(x => x.name).indexOf(value.name);

            if (idxRemoved === -1) {
                acc.push({
                    name: value.name,
                    uuid: value.uuid,
                    opacity: value.opacity
                });
            }

        } else {
            const idxRemoved = acc.map(x => x.name).indexOf(value.name);

            if (idxRemoved !== -1) {
                acc.splice(idxRemoved, 1);
            }
        }

        return acc;
    }, []);
