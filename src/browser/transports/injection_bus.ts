import { app as electronApp } from 'electron';
import { WINDOWS_MESSAGE_MAP } from '../../common/windows_messages';
import WMCopyData from './wm_copydata';

const copyDataTransport = new WMCopyData('OpenFin-NativeWindowManager-Client', '');
let alreadySubscribed = false;

interface MessageBase {
  action: string;
  messageId: string;
  senderId: string;
  sequence: number;
  time: number;
}

interface BroadcastMessage extends MessageBase {
  payload: {
    data: {
      type: number;
      [key: string]: string | number;
    };
    nativeId: string;
    state: {
      userMovement: boolean;
    }
  };
  retries: number[];
}

interface ConstructorParams {
  nativeId: string;
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
  payload: {
    data: {
      [nativeId: string]: string[] | { userMovement: boolean; };
    },
    type: string;
  };
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

  constructor(params: ConstructorParams) {
    const { nativeId } = params;

    this._events = new Map();
    this._eventsCount = 0;
    this._nativeId = nativeId;
    this._pendingRequests = new Map();

    copyDataTransport.on('message', (sender: number, rawMessage: string) => {
      const parsedMessage: MessageBase = JSON.parse(rawMessage);
      const { messageId } = parsedMessage;

      if (this._pendingRequests.has(messageId)) {
        const pendingRequest = this._pendingRequests.get(messageId);

        // Ack message
        if (parsedMessage.action.includes('response')) {
          return pendingRequest.resolve();
        }

        // Nack message
        if (parsedMessage.action.includes('error')) {
          return pendingRequest.reject((<NackMessage>parsedMessage).payload.reason);
        }

        return;
      }

      // Broadcast message
      const { payload: { data: { type: eventAsInteger, ...payload } } } = <BroadcastMessage>parsedMessage;
      const windowsEvent = <string>WINDOWS_MESSAGE_MAP[eventAsInteger];

      // Call all event listeners
      if (this._events.has(windowsEvent)) {
        const listeners = this._events.get(windowsEvent);
        listeners.forEach(e => e(payload));
      }
    });
  }

  private send({ action, payload }: SendMessage): Promise<string | void> {
    return new Promise((resolve, reject) => {
      const messageId = electronApp.generateGUID();
      const target = 'OpenFin-WindowManager-Server-8604';
      const nackTimeoutDelay = 1000;
      const messageSent = copyDataTransport.send({
        data: {
          action,
          messageId,
          payload,
          senderId: '0x0000',
          sequence: 0,
          time: 0
        },
        target
      });

      if (!messageSent) {
        return reject(`Failed to send message to injected window ${target}.`);
      }

      const nackTimeout = setTimeout(() => {
        reject(`Timed out waiting for a response from injected window ${target}.`);
      }, nackTimeoutDelay);

      this._pendingRequests.set(messageId, {
        reject: (error: string): void => {
          clearTimeout(nackTimeout);
          reject(error);
        },
        resolve: (): void => {
          clearTimeout(nackTimeout);
          resolve();
        }
      });
    });
  }

  public async on(event: string, listener: Listener): Promise<void> {
    const listeners = this._events.get(event) || [];

    // TODO: alreadySubscribed is added to bandaid unfinished event subscription
    if (listeners.length === 0 && !alreadySubscribed) {
      await this.send({
        action: 'window/subscription/request',
        payload: {
          data: {
            [this._nativeId]: [event]
          },
          type: 'set'
        }
      });

      alreadySubscribed = true;
    }

    listeners.push(listener);
    this._events.set(event, listeners);
    this._eventsCount += 1;
  }

  public removeAllListeners() {
    // TODO: un-subscription is not implemented yet on the injected processes
    copyDataTransport.removeAllListeners();
  }

  public async set(setting: any): Promise<void> {
    await this.send({
      action: 'window/setting/request',
      payload: {
        data: {
          [this._nativeId]: setting
        },
        type: 'set'
      }
    });
  }
}
