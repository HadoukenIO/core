import of_events from '../../of_events';
import route from '../../../common/route';
import { subscribeToAllRuntimes } from '../../remote_subscriptions';
import { deleteApp, getAppRunningState, appInCoreState, argo} from '../../core_state';
import { MessagePackage } from '../transport_strategy/api_transport_base';
import RequestHandler from '../transport_strategy/base_handler';
import { makeMutexKey } from '../../utils';
import { meshEnabled } from '../../connection_manager';
const namedMutex = require('electron').namedMutex;


export const enforceUuidUniqueness = meshEnabled && (argo['enforce-uuid-uniqueness'] || false);


async function subscribeToRunningExternal() {
    await subscribeToAllRuntimes({ listenType: 'on', className: 'system', eventName: 'application-started' });
    of_events.on(route.system('application-started'), (data) => {
        const uuid = data.uuid;
        if (data.runtimeUuid && appInCoreState(uuid)) {
            if (getAppRunningState(uuid)) {
                //Handle bad state should theoretically never happen but will due to backwards incompatibility
                of_events.emit(route.application('duplicated-uuid-started', uuid), { uuid });
                const closedRoute = route.application('closed', uuid);
                const remvoveFromCoreState = () => {
                    if (!getAppRunningState(uuid)) {
                        deleteApp(uuid);
                        of_events.removeListener(closedRoute, remvoveFromCoreState);
                    } //TODO figure out else;
                };
                of_events.on(closedRoute, remvoveFromCoreState);
            } else {
                deleteApp(data.uuid);
            }
        }
    });
}

function lockOnRun(msg: MessagePackage, next: (locals?: any) => void): void {
    const { data, nack, identity } = msg;
    const payload = data && data.payload;
    const uuid = payload && payload.uuid;
    const name = payload && payload.name;
    const action = data && data.action;
    if (action === 'run-application' && !identity.runtimeUuid) {
        const key = makeMutexKey(uuid);
        const lock = namedMutex.tryLock(key);
        if (!lock.locked) {
            //Delete the app from core state to properly forward to owning runtime
            deleteApp(uuid);
            //Set duplicateUuidRun to true to avoid running on early multi -runtime
            return next({duplicateUuidRun: true });
        }
    }
    next();
}

export function initDuplicateUuidHandler (requestHandler: RequestHandler<MessagePackage>): void {
    requestHandler.addPreProcessor(lockOnRun);
    subscribeToRunningExternal();
}