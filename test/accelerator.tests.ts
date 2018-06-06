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

import * as mockery from 'mockery';
import { mockElectron } from './electron';
import * as assert from 'assert';
import ofEvents from '../src/browser/of_events';
import route from '../src/common/route';

// tslint:disable-next-line
const sinon = require('sinon');

mockery.registerMock('electron', mockElectron);
mockery.enable();
import { Accelerator } from '../src/browser/api/accelerator';

describe('Accelerators', () => {

    afterEach(() => {
        Accelerator.unregisterAll({ uuid: 'test-uuid', name: 'test-uuid' });
        Accelerator.unregisterAll({ uuid: 'test-uuid2', name: 'test-uuid' });
    });

    it('Should be able to successully register an accelerator', () => {
        const spy = sinon.spy();
        const accelerator = 'CommandOrControl+X';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };

        Accelerator.register(identity, accelerator, spy);

        mockElectron.globalShortcut.mockRaiseEvent(accelerator);
        assert.ok(spy.calledOnce, 'Expected the global shortcut to be called');
    });

    it('Should allow multiple registrations for the same identity', () => {
        const spy = sinon.spy();
        const accelerator = 'CommandOrControl+X';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };

        Accelerator.register(identity, accelerator, spy);
        Accelerator.register(identity, accelerator, spy);

        mockElectron.globalShortcut.mockRaiseEvent(accelerator);
        assert.ok(spy.calledTwice, 'Expected the global shortcut to be called');
    });

    it('Should allow multiple registrations for the same uuid but different names', () => {
        const spy = sinon.spy();
        const accelerator = 'CommandOrControl+X';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };
        const cWinIdentity = { uuid: 'test-uuid', name: 'child-window' };

        Accelerator.register(identity, accelerator, spy);
        Accelerator.register(cWinIdentity, accelerator, spy);

        mockElectron.globalShortcut.mockRaiseEvent(accelerator);
        assert.ok(spy.calledTwice, 'Expected the global shortcut to be called');
    });

    it('Should not allow multiple registrations from different identities', () => {
        const spy = sinon.spy();
        const accelerator = 'CommandOrControl+X';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };
        const identity2 = { uuid: 'test-uuid-2', name: 'test-uuid-2' };

        Accelerator.register(identity, accelerator, spy);
        try {
            Accelerator.register(identity2, accelerator, spy);
        } catch (err) {
            assert.ok(err instanceof Error, 'Expected error thrown to be an instance of Error');
            assert.equal(err.message, 'Failed to register Accelerator: CommandOrControl+X, already registered');
        }


        mockElectron.globalShortcut.mockRaiseEvent(accelerator);
        assert.ok(spy.calledOnce, 'Expected the global shortcut to be called');
    });

    it('Should throw an error if the electron register fails', () => {
        const spy = sinon.spy();
        const accelerator = 'CommandOrControl+X';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };
        mockElectron.globalShortcut.failNextRegisterCall = true;

        try {
            Accelerator.register(identity, accelerator, spy);
        } catch (err) {
            assert.ok(err instanceof Error, 'Expected error thrown to be an instance of Error');
            assert.equal(err.message, 'Failed to register Accelerator: CommandOrControl+X, register call returned undefined');
        }
    });

    it('Should successfully unregister', () => {
        const spy = sinon.spy();
        const accelerator = 'CommandOrControl+X';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };

        Accelerator.register(identity, accelerator, spy);
        Accelerator.unregister(identity, accelerator);

        mockElectron.globalShortcut.mockRaiseEvent(accelerator);
        assert.ok(spy.notCalled, 'Expected the global shortcut not to be called');
    });

    it('Should unregister a single accelerator', () => {
        const spy = sinon.spy();
        const accelerator = 'CommandOrControl+X';
        const accelerator2 = 'CommandOrControl+Y';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };

        Accelerator.register(identity, accelerator, spy);
        Accelerator.register(identity, accelerator2, spy);
        Accelerator.unregister(identity, accelerator);

        mockElectron.globalShortcut.mockRaiseEvent(accelerator);
        mockElectron.globalShortcut.mockRaiseEvent(accelerator2);
        assert.ok(spy.calledOnce, 'Expected the global shortcut to be called');
    });

    it('Should unregister all accelerators', () => {
        const spy = sinon.spy();
        const accelerator = 'CommandOrControl+X';
        const accelerator2 = 'CommandOrControl+Y';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };

        Accelerator.register(identity, accelerator, spy);
        Accelerator.register(identity, accelerator2, spy);
        Accelerator.unregisterAll(identity);

        mockElectron.globalShortcut.mockRaiseEvent(accelerator);
        assert.ok(spy.notCalled, 'Expected the global shortcut not to be called');
    });

    it('Should unregister all for a given uuid', () => {
        const spy = sinon.spy();
        const spy2 = sinon.spy();
        const accelerator = 'CommandOrControl+X';
        const accelerator2 = 'CommandOrControl+Y';
        const accelerator3 = 'CommandOrControl+C';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };
        const identity2 = { uuid: 'test-uuid2', name: 'test-uuid' };

        Accelerator.register(identity, accelerator, spy);
        Accelerator.register(identity, accelerator2, spy);
        Accelerator.register(identity2, accelerator3, spy2);
        Accelerator.unregisterAll(identity);

        mockElectron.globalShortcut.mockRaiseEvent(accelerator);
        mockElectron.globalShortcut.mockRaiseEvent(accelerator2);
        mockElectron.globalShortcut.mockRaiseEvent(accelerator3);
        assert.ok(spy.notCalled, 'Expected the global shortcut not to be called');
        assert.ok(spy2.calledOnce, 'Expected the global shortcut not to be called');
    });

    it('Should return true for a registered accelerator', () => {
        const spy = sinon.spy();
        const accelerator = 'CommandOrControl+X';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };

        Accelerator.register(identity, accelerator, spy);
        const isRegistered = Accelerator.isRegistered(accelerator);

        assert.deepStrictEqual(isRegistered, true, 'Expected accelerator to be registered');
    });

    it('Shuld return false for a unregistered accelerator', () => {
        const accelerator = 'CommandOrControl+X';
        const isRegistered = Accelerator.isRegistered(accelerator);

        assert.deepStrictEqual(isRegistered, false, 'Expected accelerator not to be registered');
    });

    it('Should return false for a recently unregistered accelerator', () => {
        const spy = sinon.spy();
        const accelerator = 'CommandOrControl+X';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };

        Accelerator.register(identity, accelerator, spy);
        Accelerator.unregister(identity, accelerator);
        const isRegistered = Accelerator.isRegistered(accelerator);

        assert.deepStrictEqual(isRegistered, false, 'Expected accelerator to not be registered');
    });

    it('Should unregister on a main window close event', () => {
        const spy = sinon.spy();
        const accelerator = 'CommandOrControl+X';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };

        Accelerator.register(identity, accelerator, spy);
        //we simulate a window close.
        ofEvents.emit(route.window('closed'), identity);
        const isRegistered = Accelerator.isRegistered(accelerator);
        assert.deepStrictEqual(isRegistered, false, 'Expected accelerator to not be registered');
    });

    it('Should unregister on a frame disconnected event', () => {
        const spy = sinon.spy();
        const accelerator = 'CommandOrControl+X';
        const identity = { uuid: 'test-uuid', name: 'frame-one' };

        Accelerator.register(identity, accelerator, spy);
        //we simulate a frame disconnected.
        ofEvents.emit(route.frame('disconnected'), identity);
        const isRegistered = Accelerator.isRegistered(accelerator);
        assert.deepStrictEqual(isRegistered, false, 'Expected accelerator to not be registered');
    });

    it('Should unregister on an external connection close event', () => {
        const spy = sinon.spy();
        const accelerator = 'CommandOrControl+X';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };

        Accelerator.register(identity, accelerator, spy);
        //we simulate a external connection closed.
        ofEvents.emit(route('externalconn', 'closed'), identity);
        const isRegistered = Accelerator.isRegistered(accelerator);
        assert.deepStrictEqual(isRegistered, false, 'Expected accelerator to not be registered');
    });

    it('Should not unregister if closing a child window if more windows have registered', () => {
        const spy = sinon.spy();
        const spy2 = sinon.spy();
        const accelerator = 'CommandOrControl+X';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };
        const identity2 = { uuid: 'test-uuid', name: 'test-uuid-child' };

        Accelerator.register(identity, accelerator, spy);
        Accelerator.register(identity2, accelerator, spy2);

        //we simulate a window close.
        ofEvents.emit(route.window('closed'), identity2);

        mockElectron.globalShortcut.mockRaiseEvent(accelerator);
        assert.ok(spy.calledOnce, 'Expected the global shortcut to be called');
        assert.ok(spy2.notCalled, 'Expected the global shortcut to not be called');
    });

    it('Should emit registered events', () => {
        const spy = sinon.spy();
        const spy2 = sinon.spy();
        const accelerator = 'CommandOrControl+X';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };

        //we simulate a window close.
        ofEvents.on(route.accelerator('registered', identity.uuid), spy);
        Accelerator.register(identity, accelerator, spy2);
        assert.ok(spy.calledOnce, 'Expected "registered" event to be fired once');
    });

    it('Should emit registered events once per accelerator', () => {
        const spy = sinon.spy();
        const spy2 = sinon.spy();
        const accelerator = 'CommandOrControl+X';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };
        const identity2 = { uuid: 'test-uuid', name: 'test-uuid-child' };

        //we simulate a window close.
        ofEvents.on(route.accelerator('registered', identity.uuid), spy);
        Accelerator.register(identity, accelerator, spy2);
        Accelerator.register(identity2, accelerator, spy2);
        assert.ok(spy.calledOnce, 'Expected "registered" event to be fired once');
    });

    it('Should emit unregistered events', () => {
        const spy = sinon.spy();
        const spy2 = sinon.spy();
        const accelerator = 'CommandOrControl+X';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };

        //we simulate a window close.
        ofEvents.on(route.accelerator('unregistered', identity.uuid), spy);
        Accelerator.register(identity, accelerator, spy2);
        Accelerator.unregister(identity, accelerator);
        assert.ok(spy.calledOnce, 'Expected "unregistered" event to be fired once');
    });

    it('Should fail to register a reserved accelerator', () => {
        const spy = sinon.spy();
        const accelerator = 'CommandOrControl+0';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };
        mockElectron.globalShortcut.failNextRegisterCall = true;

        try {
            Accelerator.register(identity, accelerator, spy);
        } catch (err) {
            assert.ok(err instanceof Error, 'Expected error thrown to be an instance of Error');
            assert.equal(err.message, 'Failed to register Accelerator: CommandOrControl+0, is reserved');
        }
    });
});
