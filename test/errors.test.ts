import * as assert from 'assert';
import * as mockery from 'mockery';
import {mockElectron} from './electron';

mockery.registerMock('electron', mockElectron);
mockery.enable({
    warnOnReplace: false,
    warnOnUnregistered: false
});
// Do not move this external_application mock - Core PR #976
mockery.registerMock('./api/external_application', {});
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
