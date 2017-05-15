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
        const def = 55;
        const safeI = toSafeInt(Number.NaN, def);

        assert.equal(safeI, def, 'Expected numbers to be equal');

    });

    it('Should throw an Error if the number is invalid and no default value is passed', () => {
        try {
            toSafeInt(Number.NaN);
        } catch(err) {
            assert.equal(err.message, `${ Number.NaN } is not a parsable number and default value not provided.`);
        }
    });
});
