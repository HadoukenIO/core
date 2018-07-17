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
import { GlobalHotkey } from '../src/browser/api/global_hotkey';

describe('GlobalHotkey', () => {

    afterEach(() => {
        GlobalHotkey.unregisterAll({ uuid: 'test-uuid', name: 'test-uuid' });
        GlobalHotkey.unregisterAll({ uuid: 'test-uuid2', name: 'test-uuid' });
    });

    it('Should be able to successully register an accelerator', () => {
        const spy = sinon.spy();
        const hotkey = 'CommandOrControl+X';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };

        GlobalHotkey.register(identity, hotkey, spy);

        mockElectron.globalShortcut.mockRaiseEvent(hotkey);
        assert.ok(spy.calledOnce, 'Expected the global shortcut to be called');
    });

    it('Should allow multiple registrations for the same identity', () => {
        const spy = sinon.spy();
        const hotkey = 'CommandOrControl+X';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };

        GlobalHotkey.register(identity, hotkey, spy);
        GlobalHotkey.register(identity, hotkey, spy);

        mockElectron.globalShortcut.mockRaiseEvent(hotkey);
        assert.ok(spy.calledTwice, 'Expected the global shortcut to be called');
    });

    it('Should allow multiple registrations for the same uuid but different names', () => {
        const spy = sinon.spy();
        const hotkey = 'CommandOrControl+X';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };
        const cWinIdentity = { uuid: 'test-uuid', name: 'child-window' };

        GlobalHotkey.register(identity, hotkey, spy);
        GlobalHotkey.register(cWinIdentity, hotkey, spy);

        mockElectron.globalShortcut.mockRaiseEvent(hotkey);
        assert.ok(spy.calledTwice, 'Expected the global shortcut to be called');
    });

    it('Should not allow multiple registrations from different identities', () => {
        const spy = sinon.spy();
        const hotkey = 'CommandOrControl+X';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };
        const identity2 = { uuid: 'test-uuid-2', name: 'test-uuid-2' };

        GlobalHotkey.register(identity, hotkey, spy);
        try {
            GlobalHotkey.register(identity2, hotkey, spy);
        } catch (err) {
            assert.ok(err instanceof Error, 'Expected error thrown to be an instance of Error');
            assert.equal(err.message, 'Failed to register Hotkey: CommandOrControl+X, already registered');
        }


        mockElectron.globalShortcut.mockRaiseEvent(hotkey);
        assert.ok(spy.calledOnce, 'Expected the global shortcut to be called');
    });

    it('Should throw an error if the electron register fails', () => {
        const spy = sinon.spy();
        const hotkey = 'CommandOrControl+X';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };
        mockElectron.globalShortcut.failNextRegisterCall = true;

        try {
            GlobalHotkey.register(identity, hotkey, spy);
        } catch (err) {
            assert.ok(err instanceof Error, 'Expected error thrown to be an instance of Error');
            assert.equal(err.message, 'Failed to register Hotkey: CommandOrControl+X, register call returned undefined');
        }
    });

    it('Should successfully unregister', () => {
        const spy = sinon.spy();
        const hotkey = 'CommandOrControl+X';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };

        GlobalHotkey.register(identity, hotkey, spy);
        GlobalHotkey.unregister(identity, hotkey);

        mockElectron.globalShortcut.mockRaiseEvent(hotkey);
        assert.ok(spy.notCalled, 'Expected the global shortcut not to be called');
    });

    it('Should unregister a single hotkey', () => {
        const spy = sinon.spy();
        const hotkey = 'CommandOrControl+X';
        const hotkey2 = 'CommandOrControl+Y';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };

        GlobalHotkey.register(identity, hotkey, spy);
        GlobalHotkey.register(identity, hotkey2, spy);
        GlobalHotkey.unregister(identity, hotkey);

        mockElectron.globalShortcut.mockRaiseEvent(hotkey);
        mockElectron.globalShortcut.mockRaiseEvent(hotkey2);
        assert.ok(spy.calledOnce, 'Expected the global shortcut to be called');
    });

    it('Should unregister all hotkeys', () => {
        const spy = sinon.spy();
        const hotkey = 'CommandOrControl+X';
        const hotkey2 = 'CommandOrControl+Y';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };

        GlobalHotkey.register(identity, hotkey, spy);
        GlobalHotkey.register(identity, hotkey2, spy);
        GlobalHotkey.unregisterAll(identity);

        mockElectron.globalShortcut.mockRaiseEvent(hotkey);
        assert.ok(spy.notCalled, 'Expected the global shortcut not to be called');
    });

    it('Should unregister all for a given uuid', () => {
        const spy = sinon.spy();
        const spy2 = sinon.spy();
        const hotkey = 'CommandOrControl+X';
        const hotkey2 = 'CommandOrControl+Y';
        const hotkey3 = 'CommandOrControl+C';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };
        const identity2 = { uuid: 'test-uuid2', name: 'test-uuid' };

        GlobalHotkey.register(identity, hotkey, spy);
        GlobalHotkey.register(identity, hotkey2, spy);
        GlobalHotkey.register(identity2, hotkey3, spy2);
        GlobalHotkey.unregisterAll(identity);

        mockElectron.globalShortcut.mockRaiseEvent(hotkey);
        mockElectron.globalShortcut.mockRaiseEvent(hotkey2);
        mockElectron.globalShortcut.mockRaiseEvent(hotkey3);
        assert.ok(spy.notCalled, 'Expected the global shortcut not to be called');
        assert.ok(spy2.calledOnce, 'Expected the global shortcut not to be called');
    });

    it('Should return true for a registered hotkey', () => {
        const spy = sinon.spy();
        const hotkey = 'CommandOrControl+X';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };

        GlobalHotkey.register(identity, hotkey, spy);
        const isRegistered = GlobalHotkey.isRegistered(hotkey);

        assert.deepStrictEqual(isRegistered, true, 'Expected hotkey to be registered');
    });

    it('Shuld return false for a unregistered hotkey', () => {
        const hotkey = 'CommandOrControl+X';
        const isRegistered = GlobalHotkey.isRegistered(hotkey);

        assert.deepStrictEqual(isRegistered, false, 'Expected hotkey not to be registered');
    });

    it('Should return false for a recently unregistered hotkey', () => {
        const spy = sinon.spy();
        const hotkey = 'CommandOrControl+X';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };

        GlobalHotkey.register(identity, hotkey, spy);
        GlobalHotkey.unregister(identity, hotkey);
        const isRegistered = GlobalHotkey.isRegistered(hotkey);

        assert.deepStrictEqual(isRegistered, false, 'Expected hotkey to not be registered');
    });

    it('Should unregister on a main window close event', () => {
        const spy = sinon.spy();
        const hotkey = 'CommandOrControl+X';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };

        GlobalHotkey.register(identity, hotkey, spy);
        //we simulate a window close.
        ofEvents.emit(route.window('closed', '*'), identity);
        const isRegistered = GlobalHotkey.isRegistered(hotkey);
        assert.deepStrictEqual(isRegistered, false, 'Expected hotkey to not be registered');
    });

    it('Should unregister on a frame disconnected event', () => {
        const spy = sinon.spy();
        const hotkey = 'CommandOrControl+X';
        const identity = { uuid: 'test-uuid', name: 'frame-one' };

        GlobalHotkey.register(identity, hotkey, spy);
        //we simulate a frame disconnected.
        ofEvents.emit(route.frame('disconnected'), identity);
        const isRegistered = GlobalHotkey.isRegistered(hotkey);
        assert.deepStrictEqual(isRegistered, false, 'Expected hotkey to not be registered');
    });

    it('Should unregister on an external connection close event', () => {
        const spy = sinon.spy();
        const hotkey = 'CommandOrControl+X';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };

        GlobalHotkey.register(identity, hotkey, spy);
        //we simulate a external connection closed.
        ofEvents.emit(route('externalconn', 'closed'), identity);
        const isRegistered = GlobalHotkey.isRegistered(hotkey);
        assert.deepStrictEqual(isRegistered, false, 'Expected hotkey to not be registered');
    });

    it('Should not unregister if closing a child window if more windows have registered', () => {
        const spy = sinon.spy();
        const spy2 = sinon.spy();
        const hotkey = 'CommandOrControl+X';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };
        const identity2 = { uuid: 'test-uuid', name: 'test-uuid-child' };

        GlobalHotkey.register(identity, hotkey, spy);
        GlobalHotkey.register(identity2, hotkey, spy2);

        //we simulate a window close.
        ofEvents.emit(route.window('closed', '*'), identity2);

        mockElectron.globalShortcut.mockRaiseEvent(hotkey);
        assert.ok(spy.calledOnce, 'Expected the global shortcut to be called');
        assert.ok(spy2.notCalled, 'Expected the global shortcut to not be called');
    });

    it('Should emit registered events', () => {
        const spy = sinon.spy();
        const spy2 = sinon.spy();
        const hotkey = 'CommandOrControl+X';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };

        //we simulate a window close.
        ofEvents.on(route.globalHotkey('registered', identity.uuid), spy);
        GlobalHotkey.register(identity, hotkey, spy2);
        assert.ok(spy.calledOnce, 'Expected "registered" event to be fired once');
    });

    it('Should emit registered events once per hotkey', () => {
        const spy = sinon.spy();
        const spy2 = sinon.spy();
        const hotkey = 'CommandOrControl+X';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };
        const identity2 = { uuid: 'test-uuid', name: 'test-uuid-child' };

        //we simulate a window close.
        ofEvents.on(route.globalHotkey('registered', identity.uuid), spy);
        GlobalHotkey.register(identity, hotkey, spy2);
        GlobalHotkey.register(identity2, hotkey, spy2);
        assert.ok(spy.calledOnce, 'Expected "registered" event to be fired once');
    });

    it('Should emit unregistered events', () => {
        const spy = sinon.spy();
        const spy2 = sinon.spy();
        const hotkey = 'CommandOrControl+X';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };

        //we simulate a window close.
        ofEvents.on(route.globalHotkey('unregistered', identity.uuid), spy);
        GlobalHotkey.register(identity, hotkey, spy2);
        GlobalHotkey.unregister(identity, hotkey);
        assert.ok(spy.calledOnce, 'Expected "unregistered" event to be fired once');
    });

    it('Should fail to register a reserved hotkey', () => {
        const spy = sinon.spy();
        const hotkey = 'CommandOrControl+0';
        const identity = { uuid: 'test-uuid', name: 'test-uuid' };
        mockElectron.globalShortcut.failNextRegisterCall = true;

        try {
            GlobalHotkey.register(identity, hotkey, spy);
        } catch (err) {
            assert.ok(err instanceof Error, 'Expected error thrown to be an instance of Error');
            assert.equal(err.message, 'Failed to register Hotkey: CommandOrControl+0, is reserved');
        }
    });
});
