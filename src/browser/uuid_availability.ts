const electron = require('electron');
const fileLock = electron.fileLock;
import { meshEnabled } from './connection_manager';
import { getAppRunningState } from './core_state';

const makeMutexKey = (uuid: string) => `uuid-${uuid}`;

export function lockUuid(uuid: string) {
    return !getAppRunningState(uuid) && (
        !meshEnabled || (
            fileLock.tryLock(makeMutexKey(uuid)) === 0
        )
    );
}

export function releaseUuid (uuid: string) {
    const key = makeMutexKey(uuid);
    return fileLock.releaseLock(key);
}