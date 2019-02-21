import * as Rx from 'rxjs';
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
                    create: 0,
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
