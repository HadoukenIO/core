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
import {EventEmitter} from 'events';
const App = require('electron').app;

App.generateGUID = Math.random;

const mockWMCopyData  = {
    WMCopyData: () => {
        return {
            on: (x: any) => x,
            publish: (x: any ) => x
        }
    }
}

mockery.registerMock('../transport', mockWMCopyData);
mockery.enable();

import {rvmMessageBus, RVMMessageBus, LicenseInfo} from '../src/browser/rvm/rvm_message_bus';

describe('rvm message bus', () => {

    describe('registerLiceneInfo', () => {

        it('should send the correct base payload', () => {
            const payloadShape: any = {
                processId: 'processId',
                runtimeVersion: 'runtimeVersion',

                action: 'license-info',
                sessionId: RVMMessageBus.sessionId,
                parentApp: {
                    sourceUrl: null
                },
                sourceUrl: null,
                licenseKey: null,
                client: {
                    type: null,
                    version: null,
                    pid: null
                }
            }
            const {payload} = <any> rvmMessageBus.registerLicenseInfo(<LicenseInfo> {
                processId: 'processId',
                runtimeVersion: 'runtimeVersion'
            });

            assert.deepEqual(payloadShape, payload, 'shapes should match');
        });

        it('should send the correct full payload', () => {

            const payloadShape: any = {
                processId: 'processId',
                runtimeVersion: 'runtimeVersion',

                action: 'license-info',
                sessionId: RVMMessageBus.sessionId,
                parentApp: {
                    sourceUrl: 'parentApp.sourceUrl'
                },
                sourceUrl: 'sourceUrl',
                licenseKey: 'licenseKey',
                client: {
                    type: 'js',
                    version: 'version',
                    pid: 999999999
                }
            }

            const {payload} = <any> rvmMessageBus.registerLicenseInfo(<LicenseInfo> {
                processId: 'processId',
                runtimeVersion: 'runtimeVersion',
                parentApp: {
                    sourceUrl: 'parentApp.sourceUrl'
                },
                sourceUrl: 'sourceUrl',
                licenseKey: 'licenseKey',
                client: {
                    type: 'js',
                    version: 'version',
                    pid: 999999999
                }
            });

            assert.deepEqual(payloadShape, payload, 'shapes should match');
        });
    });
});

after(() => {
    mockery.deregisterAll();
    mockery.disable();
});
