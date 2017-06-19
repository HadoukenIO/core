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
import * as assert from 'assert';
import * as mockery from 'mockery';

import {mockElectron, lastLogValue, lastVlogValue} from './electron';

mockery.registerMock('electron', mockElectron);
mockery.enable();
import * as log from '../src/browser/log';

describe('log', () => {
    describe('writeToLog', () => {

        it('should stringify the object passed', () => {
            const obj = { a: 'a', b: 1 };

            log.writeToLog('info', obj);
            assert(lastLogValue === JSON.stringify(obj));
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
