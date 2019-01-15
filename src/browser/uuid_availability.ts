const electron = require('electron');
const namedMutex = electron.namedMutex;
import { meshEnabled } from './connection_manager';
import { getAppRunningState } from './core_state';

const makeMutexKey = (uuid: string) => `uuid-${uuid}`;

export function isUuidAvailable(uuid: string) {
    return !getAppRunningState(uuid) && (
        !meshEnabled || (
            namedMutex.tryLock(makeMutexKey(uuid)) === 0
        )
    );
}

export function releaseUuid (uuid: string) {
    const key = makeMutexKey(uuid);
    let released = namedMutex.releaseLock(key);
    while (!released) {
        released = namedMutex.releaseLock(key);
    }
}