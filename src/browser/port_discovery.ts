import { EventEmitter } from 'events';
import { Base, ChromiumIPC, WMCopyData } from './transport';
import * as log from './log';
import route from '../common/route';
import { isMeshEnabled } from './connection_manager';
import * as coreState from './core_state';

const WINDOW_CLASS_NAME = 'OPENFIN_ADAPTER_WINDOW';

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
    private _transport: Base;

    constructor() {
        super();
    }

    private constructTransport(): Base {
        if (!this._transport) {
            if (process.platform === 'win32') {
                // Send and receive messages on the same Window's classname
                log.writeToLog('info', 'Constructing the copyDataTransport window.');
                this._transport = new WMCopyData(WINDOW_CLASS_NAME, WINDOW_CLASS_NAME);
            } else {
                // TODO: provide a unix implementation
            }

            this._transport.on('message', (s: any, data: string) => {
                this.emit(route.runtime('launched'), JSON.parse(data));
            });
        }

        return this._transport;
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
        const transport = this.constructTransport();

        coreState.setSocketServerState(portDiscoveryPayload);
        transport.publish(portDiscoveryPayload);

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
