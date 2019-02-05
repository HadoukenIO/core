const electron = require('electron');
const namedMutex = electron.namedMutex;
import { meshEnabled } from './connection_manager';
import { getAppRunningState } from './core_state';

const makeMutexKey = (uuid: string) => `uuid-${uuid}`;

export function lockUuid(uuid: string) {
    return !getAppRunningState(uuid) && (
        !meshEnabled || (
            namedMutex.tryLock(makeMutexKey(uuid)) === 0
        )
    );
}

export function releaseUuid (uuid: string) {
    const key = makeMutexKey(uuid);
    return namedMutex.releaseLock(key);
}