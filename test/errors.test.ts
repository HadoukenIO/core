import * as assert from 'assert';
import * as mockery from 'mockery';
import {mockElectron, lastLogValue, lastVlogValue} from './electron';

mockery.registerMock('electron', mockElectron);
mockery.enable({
    warnOnReplace: false,
    warnOnUnregistered: false
});
import * as errors from '../src/common/errors';

describe('Errors', () => {
    describe('errorToPojo', () => {
        it('Should return a stringifiable error', () => {
            const err = new Error('Test Error');
            const errPojo = errors.errorToPOJO(err);
            const parsedErr = JSON.parse(JSON.stringify(errPojo));

            assert(parsedErr.stack !== undefined);
            assert(parsedErr.message !== undefined);
        });

    });
});
