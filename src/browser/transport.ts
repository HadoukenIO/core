import Base from './transports/base';
import ChromiumIPC from './transports/chromium_ipc';
import UnixDomainSocket from './transports/unix_domain_socket';
import WMCopyData from './transports/wm_copydata';
import { EventEmitter } from 'events';

/**
 * Conveniently exports available transports in one bundle
 */
export { Base, ChromiumIPC, UnixDomainSocket, WMCopyData };

export class NamedOneToManyTransport extends EventEmitter {
    protected _transport: Base;

    constructor(private name: string) {
        super();
    }

    protected construct () {
        if (!this._transport) {
            if (process.platform === 'win32') {
                // Send and receive messages on the same Window's classname
                this._transport = new WMCopyData(this.name, this.name);
            } else {
                this._transport = new UnixDomainSocket(this.name);
            }
        }
        return this._transport;
    }

    protected onMessage (listener: (...args: any[]) => any) {
        if (this._transport) {
            this._transport.on('message', listener);
        }
    }
}
