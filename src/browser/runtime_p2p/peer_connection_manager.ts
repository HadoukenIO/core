import { EmitterMap } from './emitter_map';
import { createHash } from 'crypto';
import { connect, Identity, Fin } from '../../../js-adapter/src/main';
import { EventEmitter } from 'events';

//TODO: This belongs somewhere else, need to find out where.
export interface Identity {
    uuid: string;
    name?: string;
}

export interface PeerRuntime {
    portInfo: PortInfo;
    fin: Fin;
    isDisconnected: boolean;
}

export interface IdentityAddress {
    runtime: PeerRuntime;
    runtimeKey: string;
    identity: Identity;
}

export interface PortInfo {
    version: any;
    sslPort: number;
    port: number;
    requestedVersion?: string;
    securityRealm?: string;
    runtimeInformationChannel?: string;
}

export class PeerConnectionManager extends EventEmitter {

    constructor () {
        super();
        this._runtimeMap = new EmitterMap<PeerRuntime>();
        this._identityMap = new EmitterMap<IdentityAddress>();
        this._pendingConnectionMap = new Map<string, boolean>();

        this._runtimeMap.on('node-added', (key: string, peer: PeerRuntime) => {

            const onDisconnect = () => {

                for (const kvPair of this._identityMap) {
                    if (key === this.genRuntimeKey(kvPair[1].runtime.portInfo)) {
                        this._identityMap.remove(kvPair[0]);
                    }
                }

                peer.fin.removeListener('disconnected', onDisconnect);
                peer.isDisconnected = true;
                this._runtimeMap.remove(key);

            };

            peer.fin.on('disconnected', onDisconnect);
        });
    }

    private _runtimeMap:  EmitterMap<PeerRuntime>;
    private _identityMap: EmitterMap<IdentityAddress>;
    private _pendingConnectionMap: Map<string, boolean>;

    private genRuntimeKey = (params: PortInfo): string => {
        return createHash('md4')
            .update(params.version)
            .update('' + params.port)
            .digest('base64');
    }

    private genIdentityKey = (identity: Identity) : string => {
        return createHash('md4')
            .update(identity.uuid)
            .digest('base64');
    }

    public get connections(): Array<PeerRuntime> {
        const rtList: Array<PeerRuntime> = [];

        for (const kvPair of this._runtimeMap) {
            rtList.push(kvPair[1]);
        }

        return rtList;
    }

    public connectToRuntime = (uuid: string, portInfo: PortInfo): Promise<PeerRuntime> =>  {
        return new Promise((resolve, reject) => {
            const key = this.genRuntimeKey(portInfo);

            if (this._runtimeMap.get(key)) {
                reject(new Error('Already connected to runtime'));
                return;
            }

            if (this._pendingConnectionMap.get(key)) {
                reject(new Error('Already connecting to runtime'));
                return;
            }

            this._pendingConnectionMap.set(key, true);

            connect({
                address: `ws://localhost:${portInfo.port}`,
                uuid,
                runtimeClient: true,
                nonPersistent: true
            }).then((fin: Fin) => {
                const peerRt = {
                    fin,
                    portInfo,
                    isDisconnected: false
                };

                this._runtimeMap.set(key, peerRt);
                this._pendingConnectionMap.delete(key);
                resolve(peerRt);
            });
        });
    }

    public resolveIdentity(identity: Identity): Promise<IdentityAddress> {
        const identityKey = this.genIdentityKey(identity);

        return new Promise((resolve, reject) => {
            let identityAddress = this._identityMap.get(identityKey);
            if (identityAddress) {
                resolve(identityAddress);
            } else {
                let failures = 0;
                if (this._runtimeMap.size < 1) {
                    reject(new Error('No Connections'));
                }
                //Need to compare against amount of requests sent out
                //not the number of connections once the promise resolves/rejects
                const checkingConnectionSize = this._runtimeMap.size;
                for (const kvPair of this._runtimeMap) {
                    kvPair[1].fin.System.resolveUuid(identity.uuid).then(() => {
                        identityAddress = {
                            identity,
                            runtime: kvPair[1]
                        };
                        this._identityMap.set(identityKey, identityAddress);
                        resolve(identityAddress);
                    }).catch((err: Error) => {
                        failures++;
                        if (failures >= checkingConnectionSize) {
                            reject(err);
                        }
                    });
                }
            }
        });
    }
}
