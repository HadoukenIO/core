import { app } from 'electron';
import { Identity } from '../../shapes';
import { writeToLog } from '../log';
import ofEvents from '../of_events';
import route from '../../common/route';
import * as coreState from '../core_state';

const EVENT_TOPIC = 'window';
export const FILE_DOWNLOAD_EVENTS = {
    STARTED: 'file-download-started',
    PROGRESS: 'file-download-progress',
    COMPLETED: 'file-download-completed'
};

type DownloadState = 'started' | 'completed' | ' cancelled' |  'interrupted' | 'paused' | 'interrupted' | 'paused' | 'progressing';

interface FileEvent {
    fileUuid: string;
    url: string;
    mimeType: string;
    fileName: string;
    totalBytes: number;
    startTime: number;
    contentDisposition: string;
    lastModifiedTime: string;
    eTag: string;
    topic: string;
    uuid: string;
    name: string;
}

interface FileDownloadLocation {
    fileUuid: string;
    path: string;
    identity: Identity;
}


export const downloadLocationMap: Map<string, FileDownloadLocation> = new Map();

//determines if the given identity should have access to the file
export function hasAccess(identity: Identity, fileUuid: string): boolean {
    const fileDownload = downloadLocationMap.get(fileUuid);
    const requestorAnc = coreState.getAppAncestor(identity.uuid);
    const fileOwnerAnc = fileDownload ? coreState.getAppAncestor(fileDownload.identity.uuid) : void 0;
    if ((requestorAnc && fileOwnerAnc) && (requestorAnc.uuid === fileOwnerAnc.uuid)) {
        return true;
    }
    return false;
}

export function createWillDownloadEventListener(identity: Identity): (event: any, item: any, webContents: any) => void {
    return (event: any, item: any, webContents: any): void => {
        const { uuid, name } = identity;

        try {
            const fileUuid: string = app.generateGUID();
            const baseFileEvent: FileEvent = {
                fileUuid,
                url: item.getURL(),
                mimeType: item.getMimeType(),
                fileName: item.getFilename(),
                totalBytes: item.getTotalBytes(),
                startTime: item.getStartTime(),
                contentDisposition: item.getContentDisposition(),
                lastModifiedTime: item.getLastModifiedTime(),
                eTag: item.getETag(),
                topic: EVENT_TOPIC,
                uuid,
                name
            };

            const progressTracker = (event: any, state: DownloadState): void => {
                try {
                    let reportedState = state;
                    //I am 100% sure we will never get into the paused state.
                    if (state === 'progressing' && item.isPaused()) {
                        reportedState = 'paused';
                    }

                    ofEvents.emit(route.window(FILE_DOWNLOAD_EVENTS.PROGRESS, uuid, name), Object.assign({
                        type: FILE_DOWNLOAD_EVENTS.PROGRESS,
                        state,
                        downloadedBytes: item.getReceivedBytes()
                    }, baseFileEvent));
                } catch (e) {
                    writeToLog('info', e);
                }
            };

            ofEvents.emit(route.window(FILE_DOWNLOAD_EVENTS.STARTED, uuid, name), Object.assign({
                type: FILE_DOWNLOAD_EVENTS.STARTED
            }, baseFileEvent));

            item.on('updated', progressTracker);
            item.once('done', (event: Event, state: DownloadState) => {
                try {
                    item.removeAllListeners('updated');
                    const savePath = item.getSavePath();
                    downloadLocationMap.set(fileUuid, {
                        fileUuid,
                        path: savePath,
                        identity
                    });

                    //log that the download failed.
                    if (state !== 'completed') {
                        writeToLog('info', `download ${baseFileEvent.fileUuid } failed, state: ${state}`);
                    }

                    ofEvents.emit(route.window(FILE_DOWNLOAD_EVENTS.COMPLETED, uuid, name), Object.assign({
                        type: FILE_DOWNLOAD_EVENTS.COMPLETED,
                        state
                    }, baseFileEvent));

                } catch (e) {
                    writeToLog('info', e);
                }
            });

        } catch (err) {
            writeToLog('info', err);
        }
    };
}
