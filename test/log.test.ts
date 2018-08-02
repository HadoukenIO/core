import * as assert from 'assert';
import * as mockery from 'mockery';

import {mockElectron, lastLogValue, lastVlogValue} from './electron';

mockery.registerMock('electron', mockElectron);
mockery.enable({
    warnOnReplace: false,
    warnOnUnregistered: false
});
import * as log from '../src/browser/log';

describe('log', () => {
    describe('writeToLog', () => {

        it('should use plain object\'s toString', () => {
            /* tslint:disable: no-invalid-this */
            const obj = { a: 'a', b: 1, toString: function() { return `${this.a}@${this.b}`; } };
            /* tslint:enable: no-invalid-this */

            log.writeToLog('info', obj);
            assert(lastLogValue === 'a@1');
        });

        it('should stringify the object passed when no own toString', () => {
            const obj = { a: 'a', b: 1 };

            log.writeToLog('info', obj);
            assert(lastLogValue === JSON.stringify(obj));
        });

        it('should prepend known class name to stringified object when no own toString', () => {
            class Abc { public a = 7; public b = 1; }
            const obj = new Abc();

            log.writeToLog('info', obj);
            assert(lastLogValue === `Abc: ${JSON.stringify(obj)}`);
        });

        it('should write strings', () => {
            const str = 'test';

            log.writeToLog('info', str);
            assert(lastLogValue === str);
        });

        it('should stringify error objects', () => {
            const err = new Error('Test');

            log.writeToLog('info', err);
            assert(JSON.parse(lastLogValue).message === err.message);
        });

        it('should use the vlog on debug', () => {
            const str = 'test_vlog';

            log.writeToLog(1, str, true);
            assert(lastVlogValue === str);
        });
    });
});

after(() => {
    mockery.deregisterAll();
    mockery.disable();
});
