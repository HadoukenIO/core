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

import { toSafeInt } from '../src/common/safe_int';
import * as assert from 'assert';

describe('safe_int', () => {

    it('Should equal math.floor if given a valid int', () => {
        const i = 5.55;
        const expected  = Math.floor(i);
        const safeI = toSafeInt(i);

        assert.equal(safeI, expected, 'Expected numbers to be equal');
    });

    it('Should equal a number given if no decimal points present.', () => {
        const i = 33;
        const safeI = toSafeInt(i);

        assert.equal(safeI, i, 'Expected numbers to be equal');
    });

    it('Should use the default value if given number is invalid', () => {
        const i = Number.NaN;
        const def = 55;
        const safeI = toSafeInt(i, def);

        assert.equal(safeI, def, 'Expected numbers to be equal');
    });

    it('Should accept a default value of 0', () => {
        const i = Number.NaN;
        const def = 0;
        const safeI = toSafeInt(i, def);

        assert.equal(safeI, def, 'Expected numbers to be equal');
    });

    it('Should throw an error if the default value is passed and needed but is invalid', () => {
        const i = Number.NaN;
        const def = Number.NaN;
        try {
            toSafeInt(i, def);
        } catch (err) {
            assert.equal(err.message, `Neither ${i} nor default value ${def} are parsable numbers.`);
        }
    });

    it('Should throw an Error if the number is invalid and no default value is passed', () => {
        const i = Number.NaN;
        try {
            toSafeInt(i);
        } catch (err) {
            assert.equal(err.message, `${i} is not a parsable number and default value not provided.`);
        }
    });

    it('Should use default value if given a non number', () => {
        const i: any = [];
        const def = 55;
        const safeI = toSafeInt(<number>i, def);

        assert.equal(safeI, def, 'Expected numbers to be equal');
    });

    it('Should throw an Error given a non number', () => {
        const i: any = true;

        try {
            const safeI = toSafeInt(<number>i);
        } catch (err) {
            assert.ok(err.message.includes('is not a parsable number and default value not provided.'));
        }
    });
});
