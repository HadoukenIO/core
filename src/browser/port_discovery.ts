/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/
import { WMCopyData, ChromiumIPC } from './transport';

const window_class_name = 'OPENFIN_ADAPTER_WINDOW';

export interface ArgMap {
    [key: string]: string;
}

export interface PortDiscoveryPayload {
    version: any;
    sslPort: number;
    port: number;
    requestedVersion?: string;
    securityRealm?: string;
}

export class PortDiscovery {

    constructor() {
        this.copyDataTransport = new WMCopyData(window_class_name);
    }

    private copyDataTransport: WMCopyData;

    private requests: ArgMap[] = [];

    public broadcast = (args: ArgMap, port: number): void => {
        if (!port) {
            return;
        }

        const versionKeyword = args['version-keyword'];
        const securityRealm = args['security-realm'];
        const runtimeInformationChannel = args['runtime-information-channel-v6'];
        const ver = <any>process.versions;

        const portDiscoveryPayload: PortDiscoveryPayload = {
            // tslint:disable
            version: <string>ver.openfin,
            // tslint:enable
            sslPort: -1,
            port: port,
            requestedVersion: versionKeyword,
            securityRealm: securityRealm
        };

        this.requests.push(args);

        this.copyDataTransport.publish(portDiscoveryPayload);
        if (runtimeInformationChannel) {
            const namedPipeTransport = new ChromiumIPC(runtimeInformationChannel);

            namedPipeTransport.publish({
                action: 'runtime-information',
                payload: portDiscoveryPayload
            });

            //we do not need to re-send named pipe discovery.
            this.requests.pop();
        }
    }
}
