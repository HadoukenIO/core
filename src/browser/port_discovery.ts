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

import { WMCopyData, ChromiumIPC } from './transport';
import { EventEmitter } from 'events';
import * as log from './log';
import route from '../common/route';
import { isMeshEnabled } from './connection_manager';

const coreState = require('./core_state');


const windowClassName = 'OPENFIN_ADAPTER_WINDOW';

export interface ArgMap {
    [key: string]: string;
}

export interface PortInfo {
    version: any;
    sslPort: number;
    port: number;
    options: ArgMap;
    requestedVersion?: string;
    securityRealm?: string;
    runtimeInformationChannel: string;
    multiRuntime: boolean;
}

export class PortDiscovery extends EventEmitter {

    constructor() {
        super();
    }

    private _copyDataTransport: WMCopyData;

    private constructCopyDataTransport(): WMCopyData {

        // Send and receive messages on the same Window's classname
        if (!this._copyDataTransport) {

            log.writeToLog('info', 'Constructing the copyDataTransport window.');

            this._copyDataTransport = new WMCopyData(windowClassName, windowClassName);
            this._copyDataTransport.on('message', (s: any, data: string) => {
                this.emit(route.runtime('launched'), JSON.parse(data));
            });
        }

        return this._copyDataTransport;
    }

    public getPortInfoByArgs(args: ArgMap, port: number): PortInfo {
        const versionKeyword = args['version-keyword'];
        const securityRealm = args['security-realm'];
        const runtimeInformationChannel = args['runtime-information-channel-v6'];
        const ver = <any>process.versions;
        const multiRuntime = isMeshEnabled(args);

        const portDiscoveryPayload: PortInfo = {
            // tslint:disable
            version: <string>ver.openfin,
            // tslint:enable
            sslPort: -1,
            port,
            options: args,
            requestedVersion: versionKeyword,
            securityRealm,
            runtimeInformationChannel,
            multiRuntime
        };

        return portDiscoveryPayload;
    }

    public broadcast = (portDiscoveryPayload: PortInfo): void => {
    //we need to defer the creation of the wm_copy transport to invocation because on startup electron windowing is not ready.
        const _copyDataTransport = this.constructCopyDataTransport();

        coreState.setSocketServerState(portDiscoveryPayload);
        _copyDataTransport.publish(portDiscoveryPayload);

        if (portDiscoveryPayload.runtimeInformationChannel) {
            const namedPipeTransport = new ChromiumIPC(portDiscoveryPayload.runtimeInformationChannel);

            namedPipeTransport.publish({
                action: 'runtime-information',
                payload: portDiscoveryPayload
            });
        }
    }
}

export const portDiscovery = new PortDiscovery();
