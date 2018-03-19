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
import * as assert from 'assert';
import * as mockery from 'mockery';

//setup mock js-adapter;
const validUUIDs: any = {
    a: ['uuid_a', 'uuid_b'],
    b: ['uuid_c', 'uuid_d'],
    c: ['uuid_x'],
    d: ['uuid_z'],
    x: [''],
    z: ['']
};

const mockedDisconnectEvents: any = {};
let connectionManager: any;

function mockResolveUuid(mRuntimeName: string): Function {
    return (uuid: string): Promise<any> => {
        return new Promise((resolve, reject) => {
            validUUIDs[mRuntimeName].forEach((k: string) => {
                if (uuid === k) {
                    resolve();
                }
            });
            reject();
        });
    };
}

function mockDisconnectEvents(mRuntimeName: string): Function {
    return (evt: string, fn: Function) =>  {
        mockedDisconnectEvents[mRuntimeName] = fn;
    };
}

const nodeAdapter = {
    connect: (runtimeAddress: any): Promise<any>  => {
        return Promise.resolve({
            System: {
                resolveUuid: mockResolveUuid(runtimeAddress.uuid)
            },
            on: mockDisconnectEvents(runtimeAddress.uuid),
            //tslint:disable-next-line
            removeListener: () => {}
        });
    }
};

mockery.registerMock('hadouken-js-adapter', nodeAdapter);
mockery.enable();


before(() => {
    const PeerConnectionManager: any = require('../src/browser/runtime_p2p/peer_connection_manager').PeerConnectionManager;
    connectionManager = new PeerConnectionManager();
});

describe('connectionMap', () => {

    describe('no connections', () =>  {
        it('should return "No Connections" error',  () => {
            return connectionManager.resolveIdentity({ uuid: 'uuid_z' })
                .catch((err: Error) => assert(err.message === 'No Connections'));
        });

    });

    describe('connect to runtime', () => {

        it('should call the connect call', () => {
            //TODO: we need mockery here.
            assert(connectionManager.connectToRuntime !== undefined);
        });

        it('should connect to the given runtime', () => {
            return connectionManager.connectToRuntime('x', {
                sslPort: -1,
                version: 'a.b.c',
                port: 9999
            }).then(() => {
                assert(true);
            }).catch((err: Error) =>  {
                assert(false, err.message);
            });
        });

        it('should not connect to a connected runtime', () => {
            return connectionManager.connectToRuntime('x', {
                sslPort: -1,
                version: 'a.b.c',
                port: 9999
            }).then(() => {
                assert(false);
            }).catch((err: Error) =>  {
                assert(err.message === 'Already connected to runtime');
            });
        });

    });

    describe('disconnect events', () => {

        it('should clean disconnected runtime maps', () => {
            return connectionManager.connectToRuntime('d', {
                sslPort: -1,
                version: 'd.d.d',
                port: 9999
            }).then(() => {
                //tslint:disable-next-line
                mockedDisconnectEvents['d']();

                return connectionManager.resolveIdentity({ uuid: 'uuid_z' })
                    .catch(() => assert(true));
            });
        });
    });

    describe('resoveUuid', () => {

        before(() => {
            return connectionManager.connectToRuntime('a', {
                sslPort: -1,
                version: 'a.a.a',
                port: 9999
            }).then(() => {
                return connectionManager.connectToRuntime('b', {
                    sslPort: -1,
                    version: 'b.b.b',
                    port: 9999
                }).then(() => {
                    return connectionManager.connectToRuntime('c', {
                        sslPort: -1,
                        version: 'c.c.c',
                        port: 9999
                    });
                });
            });
        });

        it('should fail for mock uuids', () => {
            connectionManager.resolveIdentity({ uuid: 'whatever' })
                .then(() => assert(false, 'Expected not to find uuid "whatever"'))
                .catch(() => assert(true));
        });

        it('should resolve for existing uuids', () => {
            return connectionManager.resolveIdentity({ uuid: 'uuid_a' })
                    .then(() => assert(true))
                .catch((err: Error) => assert(false, err.message));
        });

        it('should return the right runtime A', () => {
            return connectionManager.resolveIdentity({ uuid: 'uuid_c' })
                .then((runtimeAddress: any) => {
                    assert(runtimeAddress.runtime.portInfo.version === 'b.b.b');
                });
        });

        it('should return the right runtime B', () => {
            return connectionManager.resolveIdentity({ uuid: 'uuid_x' })
                .then((runtimeAddress: any) => {
                    assert(runtimeAddress.runtime.portInfo.version === 'c.c.c');
                });
        });
    });

    describe('connections', () => {

        it('should be accessible', () => {
            assert(connectionManager.connections);
        });

        it('should be an array of runtime objects', () => {
            assert(connectionManager.connections.constructor.name === 'Array');
            assert(connectionManager.connections[0].fin);
        });

        it('should contain connected runtime objects', () => {

            assert(connectionManager.connections.length === 4);
            return connectionManager.connectToRuntime('z', {
                        sslPort: -1,
                        version: 'z.z.z',
                        port: 9999
            }).then(() => {
                return assert(connectionManager.connections.length === 5);
            });
        });

    });

    after(() => {
        mockery.deregisterAll();
        mockery.disable();
    });
});
