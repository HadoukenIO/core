import { app as electronApp } from 'electron';
import { EventEmitter } from 'events';
import { WINDOWS_MESSAGE_MAP } from '../../common/windows_messages';
import WMCopyData from './wm_copydata';

const copyDataTransport = new WMCopyData('OpenFin-NativeWindowManager-Client', '');

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
  pid: number;
}

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

export default class NativeWindowInjectionBus extends EventEmitter {
  private _messageListener: (sender: number, rawMessage: string) => void;
  private _nativeId: string;
  private _pendingRequests: Map<string, PendingRequest>;
  private _pid: number;

  constructor(params: ConstructorParams) {
    super();

    const { nativeId, pid } = params;
    this._nativeId = nativeId;
    this._pendingRequests = new Map();
    this._pid = pid;
    this._pid = 8604;

    // Subscribe to all events
    this.send({
      action: 'window/subscription/request',
      payload: { data: { [this._nativeId]: ['*'] }, type: 'set' }
    });

    // Listen to messages from the transport and 
    // forward broadcast messages locally
    this._messageListener = (sender: number, rawMessage: string) => {
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

      this.emit(windowsEvent, payload);
    }

    copyDataTransport.on('message', this._messageListener);
  }

  // Sends a message to the injected window
  private send({ action, payload }: SendMessage): Promise<string | void> {
    return new Promise((resolve, reject) => {
      const messageId = electronApp.generateGUID();
      const target = `OpenFin-WindowManager-Server-${this._pid}`;
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
  
  public removeAllListeners() {
    copyDataTransport.removeListener('message', this._messageListener);
    super.removeAllListeners();
    return this;
  }

  // Changes injected window setting
  public async set(setting: any): Promise<void> {
    await this.send({
      action: 'window/setting/request',
      payload: { data: { [this._nativeId]: setting }, type: 'set' }
    });
  }
}
