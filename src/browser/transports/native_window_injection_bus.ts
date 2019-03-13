import { app as electronApp } from 'electron';
import { writeToLog } from '../log';
import WMCopyData from './wm_copydata';

const copyDataTransport = new WMCopyData('OpenFin-NativeWindowManager-Client', '');
const eventTypeMapNum: EventTypeMapNum = {
  8: 'blurred'
};
let alreadySubscribed = false;

interface EventTypeMapNum {
  [key: number]: string;
}

interface MessageBase {
  action: string;
  messageId: string;
  senderId: string;
  sequence: number;
  time: number;
}

interface AckMessage extends MessageBase {
  payload: null;
}

interface BroadcastMessage extends MessageBase {
  payload: {
    data: {
      type: number;
      [key: string]: string | number;
    };
    nativeId: string;
  };
  retries: number[];
}

interface ConstructorParams {
  nativeId: string;
  pid: number;
}

type Listener = (data: any) => void;

interface NackMessage extends MessageBase {
  payload: {
    code: number;
    reason: string;
  };
}

interface SendMessage {
  action: string;
  event: string;
  messageId: string;
  type: string;
}

interface PendingRequest {
  resolve: () => void;
  reject: (error: string) => void;
}

export default class NativeWindowInjectionBus {
  private _events: Map<string, Listener[]>;
  private _eventsCount: number;
  private _nativeId: string;
  private _pendingRequests: Map<string, PendingRequest>;
  private _pid: number;
  private _sequence: number;

  constructor(params: ConstructorParams) {
    const { nativeId, pid } = params;

    this._events = new Map();
    this._eventsCount = 0;
    this._nativeId = nativeId;
    this._pendingRequests = new Map();
    this._pid = pid;
    this._sequence = 0;

    copyDataTransport.on('message', (sender: number, rawMessage: string) => {
      const parsedMessage: MessageBase = JSON.parse(rawMessage);
      const { messageId } = parsedMessage;

      this._sequence += 1;

      if (this._sequence !== parsedMessage.sequence) {
        // TODO: verify sequence logic
        // Sequence numbers aren't matching indicating some
        // messages might have failed to get delivered
      }

      if (this._pendingRequests.has(messageId)) {
        const pendingRequest = this._pendingRequests.get(messageId);

        // Ack message
        if (parsedMessage.action.includes('response')) {
          return pendingRequest.resolve();
        }

        // Nack message
        if (parsedMessage.action.includes('error')) {
          // handleNack(message.payload.reason);
          return pendingRequest.reject((<NackMessage>parsedMessage).payload.reason);
        }

        return;
      }

      // Broadcast message
      const { payload: { data } } = <BroadcastMessage>parsedMessage;
      const { type: eventAsNumber } = data;
      const eventAsString = eventTypeMapNum[eventAsNumber];

      // Call all event listeners
      if (this._events.has(eventAsString)) {
        const listeners = this._events.get(eventAsString);
        listeners.forEach(e => e(data));
      }
    });
  }

  public async on(event: string, listener: Listener): Promise<void> {
    const listeners = this._events.get(event) || [];

    if (listeners.length === 0) {
      await this.sendSubscriptionRequest(event);
    }

    listeners.push(listener);
    this._events.set(event, listeners);
    this._eventsCount += 1;
  }

  public removeAllListeners() {
    // TODO: un-subscription is not implemented yet on the injected processes
    copyDataTransport.removeAllListeners();
  }

  private sendMessage(message: SendMessage): boolean {
    const { action, event, messageId, type } = message;

    return copyDataTransport.send({
      data: {
        action,
        messageId,
        payload: {
          data: {
            [this._nativeId]: [event]
          },
          type
        },
        senderId: '0x0000',
        sequence: 0,
        time: 0
      },
      target: 'OpenFin-WindowManager-Server-8604'
    });
  }

  private sendSubscriptionRequest(event: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const messageId = electronApp.generateGUID();
      const nackTimeoutDelay = 1000;
      const defaultErrorMessage = `Failed to subscribe to "${event}" event for external window ${this._nativeId}`;
      const handleReject = (errorMessage: string = defaultErrorMessage): void => {
        clearTimeout(nackTimeout);
        reject(errorMessage);
      };
      const nackTimeout = setTimeout(() => {
        writeToLog('info', `Timed out waiting for an injection event subscription response. ${defaultErrorMessage}`);
        handleReject();
      }, nackTimeoutDelay);

      this._pendingRequests.set(messageId, {
        reject: handleReject,
        resolve: () => {
          clearTimeout(nackTimeout);
          resolve();
        }
      });

      // TODO: alreadySubscribed is added to bandaid unfinished event subscription
      if (alreadySubscribed) {
        clearTimeout(nackTimeout);
        resolve();
      } else {
        alreadySubscribed = true;
        const sent = this.sendMessage({ action: 'window/subscription/request', event, messageId, type: 'set' });
        if (!sent) {
          writeToLog('info', `Failed to send subscription request message over WM_COPYDATA. ${defaultErrorMessage}`);
          handleReject();
        }
      }

    });
  }
}
