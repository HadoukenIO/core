/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/
import { WMCopyData, ChromiumIPC } from './transport';
import { EventEmitter } from 'events';

const coreState = require('./core_state');
const window_class_name = 'OPENFIN_ADAPTER_WINDOW';

export interface ArgMap {
    [key: string]: string;
}

export interface PortInfo {
    version: any;
    sslPort: number;
    port: number;
    requestedVersion?: string;
    securityRealm?: string;
    runtimeInformationChannel: string;
}

export class PortDiscovery extends EventEmitter {

    constructor() {
        super();
    }

    private _copyDataTransport: WMCopyData;

    private constructCopyDataTransport(): WMCopyData {
        // Send and receive messages on the same Window's classname
        this._copyDataTransport = new WMCopyData(window_class_name, window_class_name);
        this._copyDataTransport.on('message', (s: any, data: string) => {
            this.emit('runtime/connected', JSON.parse(data));
        });
        return this._copyDataTransport;
    }

    public getPortInfoByArgs(args: ArgMap, port: number): PortInfo {
        const versionKeyword = args['version-keyword'];
        const securityRealm = args['security-realm'];
        const runtimeInformationChannel = args['runtime-information-channel-v6'];
        const ver = <any>process.versions;

        const portDiscoveryPayload: PortInfo = {
            // tslint:disable
            version: <string>ver.openfin,
            // tslint:enable
            sslPort: -1,
            port: port,
            requestedVersion: versionKeyword,
            securityRealm: securityRealm,
            runtimeInformationChannel: runtimeInformationChannel
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
