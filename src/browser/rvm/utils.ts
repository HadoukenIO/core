import { rvmMessageBus, ConsoleMessage } from '../rvm/rvm_message_bus';
import { System } from '../api/system';
import { setTimeout } from 'timers';
import { Identity } from '../../shapes';
import * as coreState from '../core_state';
import { app as electronApp, Event } from 'electron';
/**
 * Interface for [sendToRVM] method
 */
interface SendToRVMOpts {
    topic: 'application';
    action: string;
    sourceUrl?: string;
    data?: any;
    runtimeVersion?: string;
    payload?: any;
}

const maxBytes: number = 1000000;  // 1 MB
const defaultFlushInterval: number = 10000;  // 10 seconds

let consoleMessageQueue: ConsoleMessage[] = [];
let isFlushScheduled: boolean = false;
let totalBytes: number = 0;
let timer: NodeJS.Timer = null;

function flushConsoleMessageQueue(): void {
    totalBytes = 0;
    isFlushScheduled = false;

    if (consoleMessageQueue.length <= 0) {
        return;
    }

    const obj: SendToRVMOpts = {
        topic: 'application',
        action: 'application-log',
        sourceUrl: '', // The actual sourceUrl's are contained in the payload
        runtimeVersion: System.getVersion(),
        payload: {
            messages: JSON.parse(JSON.stringify(consoleMessageQueue))
        }
    };

    consoleMessageQueue = [];
    sendToRVM(obj, true);
}

export function addConsoleMessageToRVMMessageQueue(consoleMessage: ConsoleMessage, flushInterval?: number): void {
    consoleMessageQueue.push(consoleMessage);

    const byteLength = Buffer.byteLength(consoleMessage.message, 'utf8');
    totalBytes += byteLength;

    // If we have exceeded the byte threshold for messages, flush the queue immediately
    if (totalBytes >= maxBytes) {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }

        flushConsoleMessageQueue();

        // Otherwise if no timer already set, set one to flush the queue in 10s
    } else if (!isFlushScheduled) {
        isFlushScheduled = true;
        timer = setTimeout(flushConsoleMessageQueue, flushInterval ? flushInterval : defaultFlushInterval);
    }
}

export function prepareConsoleMessageForRVM(identity: Identity, event: Event, level: number,
    message: string, lineNo: number, sourceId: string) {
    /*
        DEBUG:     -1
        INFO:      0
        WARNING:   1
        ERROR:     2
        FATAL:     3
    */
    // tslint:disable-next-line
    const printDebugLogs = (coreState.argo['v'] >= 1);
    if ((level === /* DEBUG */ -1 && !printDebugLogs) ||
        level === /* INFO */ 0 ||
        level === /* WARNING */ 1) {
        // Prevent INFO and WARNING messages from writing to debug.log
        // DEBUG messages are also prevented if --v=1 or higher isn't specified
        event.preventDefault();
    }

    const app = coreState.getAppByUuid(identity.uuid);
    if (!app) {
        electronApp.vlog(2, `Error: could not get app object for app with uuid: ${identity.uuid}`);
        return;
    }

    // If enableAppLogging is false, skip sending to RVM
    if (app._options.enableAppLogging === false) {
        return;
    }

    // Hack: since this function is getting called from the native side with
    // "webContents.on", there is weirdness where the "setTimeout(flushConsoleMessageQueue...)"
    // in addConsoleMessageToRVMMessageQueue would only get called the first time, and not subsequent times,
    // if you just called "addConsoleMessageToRVMMessageQueue" directly from here. So to get around that, we
    // wrap this entire function in a "setTimeout" to put it in a different context. Eventually we should figure
    // out if there is a way around this by using event.preventDefault or something similar
    setTimeout(() => {
        const appConfigUrl = coreState.getConfigUrlByUuid(identity.uuid);
        if (!appConfigUrl) {
            electronApp.vlog(2, `Error: could not get manifest url for app with uuid: ${identity.uuid}`);
            return;
        }

        function checkPrependLeadingZero(num: number, length: number) {
            let str = String(num);
            while (str.length < length) {
                str = '0' + str;
            }

            return str;
        }

        const date = new Date();
        const year = String(date.getFullYear());
        const month = checkPrependLeadingZero(date.getMonth() + 1, 2);
        const day = checkPrependLeadingZero(date.getDate(), 2);
        const hour = checkPrependLeadingZero(date.getHours(), 2);
        const minute = checkPrependLeadingZero(date.getMinutes(), 2);
        const second = checkPrependLeadingZero(date.getSeconds(), 2);
        const millisecond = checkPrependLeadingZero(date.getMilliseconds(), 3);

        // Format timestamp to match debug.log
        const timeStamp = `${year}-${month}-${day} ${hour}:${minute}:${second}.${millisecond}`;

        addConsoleMessageToRVMMessageQueue({ level, message, appConfigUrl, timeStamp }, app._options.appLogFlushInterval);

    }, 1);
}

/**
 * Helper that uses RVM bus to send and receive payloads to/from RVM
 */
export function sendToRVM(opts: SendToRVMOpts, maskPayload?: boolean): Promise<any> {
    return new Promise((resolve, reject) => {

        // Make sure there is a connection with RVM
        if (!rvmMessageBus) {
            return reject(new Error('Connection with RVM is not established'));
        }

        const messageSent = rvmMessageBus.publish(Object.assign({ timeToLive: 1000 }, opts), (rvmResponse: any) => {

            // Don't do anything here because the message wasn't sent successfully to RVM
            // and we already sent error callback to the client
            if (!messageSent) {
                return;
            }

            // Not standard response
            if (typeof rvmResponse !== 'object') {
                return resolve(rvmResponse);
            }

            // Expired communication (waited to long to get the response)
            if (rvmResponse.hasOwnProperty('time-to-live-expiration')) {
                return reject(new Error('Unable to receive RVM response in a reasonable amount of time'));
            }

            // Communication error
            if (rvmResponse.success === false) {
                return reject(new Error(rvmResponse.error));
            }

            // Action execution error
            if (rvmResponse.payload && rvmResponse.payload.status === false) {
                return reject(new Error(rvmResponse.payload.error));
            }

            // Prepare a clean response for the user
            let payload = Object.assign({}, rvmResponse.payload);
            delete payload.action;
            delete payload.status;
            delete payload.error;
            if (Object.keys(payload).length === 0) {
                payload = undefined;
            }

            resolve(payload);

        }, maskPayload);

        if (!messageSent) {
            reject(new Error('Failed to send a message to the RVM'));
        }
    });
}
