/*
Copyright 2018 OpenFin Inc.

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
import * as assert from 'assert';
import { EmitterMap } from '../src/browser/runtime_p2p/emitter_map';

describe('emitterMap', () => {

    it('should be true', () => {
        assert(true);
    });

    describe('set', () => {

        it('Should set a key', () => {
            const em = new EmitterMap<string>();
            const myKey = 'myKey';
            const myVal = 'myVal';

            em.set(myKey, myVal);

            assert(em.get(myKey) === myVal);
        });

        it('Should raise node-added', () => {
            const em = new EmitterMap<string>();
            const myKey = 'myKey';
            const myVal = 'myVal';

            em.on('node-added', (key: string, node: string) => {
                assert((key === myKey) && (myVal === node));
            });

            em.set(myKey, myVal);

        });
    });

    describe('get', () => {

        it('Should get a key', () => {
            const em = new EmitterMap<string>();
            const myKey = 'myKey';
            const myVal = 'myVal';
            const myKey2 = 'myKey2';
            const myVal2 = 'myVal2';

            em.set(myKey, myVal);
            em.set(myKey2, myVal2);

            assert(em.get(myKey) === myVal);
        });
    });

    describe('remove', () => {

        it('Should remove a key', () => {
            const em = new EmitterMap<string>();
            const myKey = 'myKey';
            const myVal = 'myVal';

            em.set(myKey, myVal);
            em.remove(myKey);

            assert(em.get(myKey) === undefined);

        });

        it('Should raise node-removed', () => {
            const em = new EmitterMap<string>();
            const myKey = 'myKey';
            const myVal = 'myVal';

            em.set(myKey, myVal);
            em.on('node-removed', (key: string, node: string) => {
                assert((key === myKey) && (myVal === node));
            });

            em.remove(myKey);

        });
    });

    describe('Iterator', () => {

        it('Should be an iterator', () => {
            const em = new EmitterMap<string>();
            const myKey = 'myKey';
            const myVal = 'myVal';
            const myKey2 = 'myKey2';
            const myVal2 = 'myVal2';

            em.set(myKey, myVal);
            em.set(myKey2, myVal2);

            let c = 0;
            for (const v of em) {
                v[0] += '';
                c++;
            }

            assert(c === 2);

        });
    });

    describe('Size', () => {

        it('should be the number of items added', () => {
            const em = new EmitterMap<string>();
            const myKey = 'myKey';
            const myVal = 'myVal';
            const myKey2 = 'myKey2';
            const myVal2 = 'myVal2';

            em.set(myKey, myVal);
            em.set(myKey2, myVal2);

            assert(em.size === 2);
        });
    });

});
