import { PoorlyNamedTransport } from './transport';
import { appInCoreState, getAppRunningState, getAllApplications } from './core_state';
import * as log from './log';
import ofEvents from './of_events';
import route from '../common/route';

const UNIX_FILENAME_PREFIX: string = '/tmp/of.uuid';
const WINDOW_CLASS_NAME = 'OPENFIN_UUID_WINDOW';

class DuplicateUuidTransport extends PoorlyNamedTransport {
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
                const allUuids = getAllApplications().map(a => a.uuid);
                log.writeToLog('info', allUuids);
                log.writeToLog('info', allUuids.map(u => u === uuid));
                if (getAppRunningState(uuid)) {
                    log.writeToLog('info', `duplicate app ${uuid} run detected`);
                    doOnDupe(data.argv);
                } else {
                    log.writeToLog('info', `duplicate app ${uuid} not running here`);
                }
            });
        }
    }
    public broadcast = (payload: any) => {
        try {
            const transport = this._transport || super.construct();

            if (transport) {
                transport.publish(payload);
            }
        } catch (e) {
            log.writeToLog('info', `Duplicate Uuid delegation failed: ${JSON.stringify(e)}`);
        }
    }
}


export default new DuplicateUuidTransport();