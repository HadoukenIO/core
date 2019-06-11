import { adjustCoordsScaling } from '../../common/main';
import { app as electronApp } from 'electron';
import { EventEmitter } from 'events';
import { getMeshUuid } from '../connection_manager';
import { WINDOWS_MESSAGE_MAP } from '../../common/windows_messages';
import { writeToLog } from '../log';
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
    dpi: number;
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
  private _meshUuid: string; // ID of core instance
  private _messageListener: (sender: number, rawMessage: string) => void;
  private _nativeId: string; // HWND of the external window
  private _pendingRequests: Map<string, PendingRequest>;
  private _pid: number; // process ID of the external window
  private _senderId: string; // ID of the injected DLL

  constructor(params: ConstructorParams) {
    super();

    const { nativeId, pid } = params;
    this._meshUuid = getMeshUuid();
    this._nativeId = nativeId;
    this._pendingRequests = new Map();
    this._pid = pid;

    // Subscribe to all events
    this.send({
      action: 'window/subscription/request',
      payload: { data: { [this._nativeId]: ['*'] }, type: 'set' }
    });

    // Listen to messages from the transport and
    // forward broadcast messages locally
    this._messageListener = (sender: number, rawMessage: string) => {
      const parsedMessage: MessageBase = JSON.parse(rawMessage);
      const { messageId, senderId } = parsedMessage;

      if (this._senderId && this._senderId !== senderId) {
        return;
      }

      // Ack / Nack
      if (this._pendingRequests.has(messageId)) {
        const isNack = parsedMessage.action.includes('error');
        const pendingRequest = this._pendingRequests.get(messageId);

        isNack
          ? pendingRequest.reject((<NackMessage>parsedMessage).payload.reason)
          : pendingRequest.resolve();

        this._senderId = senderId;
        this._pendingRequests.delete(messageId);

        return;
      }

      // Broadcast message
      if (!(<BroadcastMessage>parsedMessage).payload || !(<BroadcastMessage>parsedMessage).payload.data) {
        writeToLog('info', `[NWI] Injection event without payload: ${JSON.stringify(parsedMessage)}`); // TODO
        return;
      }

      const { payload: originalPayload } = <BroadcastMessage>parsedMessage;
      const { data: { type: eventAsInteger, ...rest }, dpi: injectionDpi, nativeId, state } = originalPayload;
      const payload = { ...rest, ...state };
      const windowsEvent = <string>WINDOWS_MESSAGE_MAP[eventAsInteger];
      const { dpi: runtimeDpi } = electronApp.getNativeWindowInfoForNativeId(nativeId);

      adjustCoordsScaling(payload, runtimeDpi, injectionDpi);

      this.emit(windowsEvent, payload);
      this.emit('*', payload);
    };

    copyDataTransport.on('message', this._messageListener);
  }

  // Sends a message to the injected window
  private send({ action, payload }: SendMessage): Promise<string | void> {
    return new Promise((resolve, reject) => {
      const messageId = electronApp.generateGUID();
      const target = `OpenFin-WindowManager-${this._pid}`;
      const nackTimeoutDelay = 1000;
      const messageSent = copyDataTransport.send({
        data: {
          action,
          messageId,
          payload,
          senderId: this._meshUuid,
          sequence: 0,
          time: 0
        },
        target
      });

      if (!messageSent) {
        const errorMsg = `[NWI] Failed to send message to injected window ${target}. `
          + `Action: ${action}. Payload: ${JSON.stringify(payload)}`;
        writeToLog('info', errorMsg);
        return reject(errorMsg);
      }

      const nackTimeout = setTimeout(() => {
        const errorMsg = `[NWI] Timed out waiting for a response from injected window ${target}.`
          + `Action: ${action}. Payload: ${JSON.stringify(payload)}`;
        writeToLog('info', errorMsg);
        reject(errorMsg);
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
