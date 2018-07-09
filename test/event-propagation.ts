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
/*tslint:disable */
import * as assert from 'assert';
import ofEvents from '../src/browser/of_events';
import route from '../src/common/route';

const uuid = 'uuid4';
const name = 'name3';


describe('Event Propagation', function () {
    it('propagates window events to system', function (done) {
        const payload = Math.random();
        ofEvents.once(route.system('window-blah'), (e: any) => {
            assert.equal(e.payload, payload);
            assert.equal(e.topic, 'system');
            assert.equal(e.type, 'window-blah');
            done();
        });
        ofEvents.emit(route.window('blah', uuid, name), { uuid, name, payload });
    });

    it('propagates window events to application', function (done) {
        const payload = Math.random();
        ofEvents.once(route.application('window-blah', uuid), (e: any) => {
            assert.equal(e.payload, payload);
            assert.equal(e.topic, 'application');
            assert.equal(e.type, 'window-blah');
            done();
        });
        ofEvents.emit(route.window('blah', uuid, name), { uuid, name, payload });
    });
    it('propagates application events to system', function (done) {
        const payload = Math.random();
        ofEvents.once(route.system('application-blah'), (e: any) => {
            assert.equal(e.payload, payload);
            done();
        });
        ofEvents.emit(route.application('blah', uuid), { uuid, name, payload });
    });
    it(`doesn't double propagate events from window to application to system`, function (done) {
        const payload = Math.random();
        ofEvents.once(route.system('window-blah'), (e: any) => {
            setTimeout(() => {
                assert.equal(e.payload, payload);
                done();
            }, 100);
        });
        ofEvents.once(route.system('application-window-blah'), (e: any) => {
            assert(false, 'got extra event');
        });
        ofEvents.emit(route.window('blah', uuid, name), { uuid, name, payload });
    });
    it('propagates the original event first', function (done) {
        const payload = Math.random();
        ofEvents.once(route.system('window-blah'), (e: any) => {
            assert(false, 'got extra event');
        });
        ofEvents.once(route.window('blah', uuid, name), (e: any) => {
            assert.equal(e.payload, payload);
            done();
        });
        ofEvents.emit(route.window('blah', uuid, name), { uuid, name, payload });
    });
});