import { NamedOneToManyTransport } from './transport';
import { appInCoreState, getAppRunningState, getAllApplications, deleteApp } from './core_state';
import * as log from './log';
import ofEvents from './of_events';
import route from '../common/route';
import { subscribeToAllRuntimes } from './remote_subscriptions';

const UNIX_FILENAME_PREFIX: string = '/tmp/of.uuid';
const WINDOW_CLASS_NAME = 'OPENFIN_UUID_WINDOW';

class DuplicateUuidTransport extends NamedOneToManyTransport {
    constructor() {
        super(process.platform === 'win32' ? WINDOW_CLASS_NAME : UNIX_FILENAME_PREFIX);
    }
    public init = (doOnDupe: (...args: any[]) => any) => {
        if (!this._transport) {
            log.writeToLog('info', 'creating uuid transport');
            super.construct();
            super.onMessage((e, payload: any) => {
                const data = JSON.parse(payload);
                const uuid = data.uuid;
                log.writeToLog('info', `duplicate uuid message received for uuid: ${uuid}`);
                this.emit(this.makeEvent(uuid), data);
                if (getAppRunningState(uuid)) {
                    log.writeToLog('info', `duplicate app ${uuid} run detected`);
                    doOnDupe(data.argv);
                } else {
                    log.writeToLog('info', `duplicate app ${uuid} not running here`);
                }
            });
            return subscribeToRunningExternal();
        }
        return Promise.resolve();
    }
    private makeEvent = (uuid: string) => `duplicate-uuid-on-launch-${uuid}`;
    public subscribeToUuid = (uuid: string, listener: (...args: any[]) => any) => {
        this.once(this.makeEvent(uuid), listener);
        return () => this.removeListener(this.makeEvent(uuid), listener);
    }
    public broadcast = (payload: any) => {
        try {
            const transport = this._transport;
            if (transport) {
                log.writeToLog('info', `Sending duplicate UUID message for uuid: ${JSON.stringify(payload)}`);
                transport.publish(payload);
            } else {
                log.writeToLog('info', `Duplicate uuid transport not ready for broadcast - ${JSON.stringify(payload)}`);
            }
        } catch (e) {
            log.writeToLog('info', `Duplicate Uuid delegation failed: ${JSON.stringify(e)}`);
        }
    }
}

async function subscribeToRunningExternal() {
    //clean up apps after they are started in other runtimes
    await subscribeToAllRuntimes({ listenType: 'on', className: 'system', eventName: 'application-started' });
    ofEvents.on(route.system('application-started'), (data) => {
        const uuid = data.uuid;
        if (data.runtimeUuid && appInCoreState(uuid) && !getAppRunningState(uuid)) {
            deleteApp(data.uuid);
        }
    });
}

export const duplicateUuidTransport = new DuplicateUuidTransport();
export default duplicateUuidTransport;