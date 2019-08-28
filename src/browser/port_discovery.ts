import { EventEmitter } from 'events';
import { Base, ChromiumIPC, UnixDomainSocket, WMCopyData, NamedOneToManyTransport } from './transport';
import * as log from './log';
import route from '../common/route';
import { isMeshEnabled } from './connection_manager';
import * as coreState from './core_state';

const UNIX_FILENAME_PREFIX: string = '/tmp/of.pd';
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

export class PortDiscovery extends NamedOneToManyTransport {
    private _namedPipe: ChromiumIPC;

    constructor() {
        super(process.platform === 'win32' ? WINDOW_CLASS_NAME : UNIX_FILENAME_PREFIX);
    }

    private constructTransport(): Base {
        if (process.platform === 'win32') {
            // Send and receive messages on the same Window's classname
            log.writeToLog('info', 'Constructing the copyDataTransport window.');
        } else {
            log.writeToLog('info', 'Opening and binding to a unix domain socket for port discovery.');
        }

        const transport = super.construct();

        super.onMessage((s: any, data: string) => {
            this.emit(route.runtime('launched'), JSON.parse(data));
        });


        return transport;
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
        try {
            const transport = this.constructTransport();

            coreState.setSocketServerState(portDiscoveryPayload);
            if (transport) {
                transport.publish(portDiscoveryPayload);
            }

            if (portDiscoveryPayload.runtimeInformationChannel) {
                this._namedPipe = new ChromiumIPC(portDiscoveryPayload.runtimeInformationChannel);
                this._namedPipe.publish({
                    action: 'runtime-information',
                    payload: portDiscoveryPayload
                });
            }
        } catch (e) {
            log.writeToLog('info', `Port Discovery broadcast failed: ${JSON.stringify(e)}`);
        }
    };
}

export const portDiscovery = new PortDiscovery();
