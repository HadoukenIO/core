import * as assert from 'assert';
import * as mockery from 'mockery';
import { mockElectron } from './electron';

const {app} = mockElectron;

// tslint:disable-next-line:mocha-no-side-effect-code
const messageId = app.generateGUID();
const processId = 9999;
const runtimeVersion = 'runtimeVersion';
const securityRealm = 'securityRealm';

class WMCopyData {
    public on(x: any): any { return x; }
    public publish(x: any): any { return x; }
}

const mockWMCopyData = {
    WMCopyData
};


mockery.registerMock('electron', mockElectron);
mockery.registerMock('../transport', mockWMCopyData);
mockery.enable({
    warnOnReplace: false,
    warnOnUnregistered: false
});

import {rvmMessageBus, RVMMessageBus} from '../src/browser/rvm/rvm_message_bus';

describe('rvm message bus', () => {

    describe('publish', () => {

        it('should not accept a non-object as the message', () => {
            const result: boolean = (<any>rvmMessageBus).publish();
            assert(result === false);
        });

        it('should send the correct base payload', () => {
            const topic = 'test';

            const expectedResult: any = {
                topic,
                messageId,
                payload: {
                    processId,
                    runtimeVersion,
                    securityRealm
                }
            };

            const sentVal = (<any> rvmMessageBus).publish({ topic, processId, runtimeVersion, securityRealm});
            assert.deepEqual(expectedResult, sentVal, 'should have sent the base payload');
        });
    });

    describe('registerLicenseInfo', () => {
        const baseStartedShape: any = {
                topic: 'application-event',
                messageId,
                payload: {
                    processId,
                    runtimeVersion,
                    securityRealm,
                    type: 'started',
                    sourceUrl: null,
                    sessionId: RVMMessageBus.sessionId,
                    data: {
                        licenseKey: null,
                        uuid: null,
                        client: {
                            type: null,
                            version: null,
                            pid: null
                        },
                        parentApp: {
                            uuid: null
                        }
                    }
                }
            };

        it('should send the correct base payload', () => {
            const  payload  = (<any>rvmMessageBus).registerLicenseInfo({
                processId,
                runtimeVersion,
                securityRealm
            });

            assert.deepEqual(baseStartedShape, payload, 'shapes should match');
        });

        it('should send the correct full payload', () => {
            const startedMsgData = {
                parentApp: {
                    uuid: 'parentApp.sourceUrl'
                },
                sourceUrl: 'sourceUrl',
                licenseKey: 'licenseKey',
                client: {
                    type: 'js',
                    version: 'version',
                    pid: 999999999
                },
                uuid: 'uuid'
            };

            const expectedPayload = Object.assign({}, baseStartedShape);

            expectedPayload.payload.data = startedMsgData;

            const  payload = (<any>rvmMessageBus).registerLicenseInfo({data: startedMsgData, processId, runtimeVersion, securityRealm});

            assert.deepEqual(expectedPayload, payload, 'shapes should match');
        });
    });
});

after(() => {
    mockery.deregisterAll();
    mockery.disable();
});
