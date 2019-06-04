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
    data?: {
      [nativeId: string]: string[] | { userMovement: boolean; };
    },
    type?: string;
  };
}

interface PendingRequest {
  resolve: () => void;
  reject: (error: string) => void;
}

export default class NativeWindowInjectionBus extends EventEmitter {
  private _connected: boolean; // Indicates whether the core is connected to the message window
  private _listenerAck: (message: MessageBase) => void; // Listener called for ack/nack
  private _listenerBroadcastMsg: (message: MessageBase) => void; // Listener called for broadcast messages
  private _listenerHeartbeat: (message: MessageBase) => void; // Hearbeat listener
  private _messageListener: (sender: number, rawMessage: string) => void; // Main message window listener
  private _meshUuid: string; // ID of core instance
  private _nativeId: string; // HWND of the external window
  private _pendingRequests: Map<string, PendingRequest>;
  private _pid: number; // process ID of the external window
  private _previousDllSequence: number; // Last recorded sequence number from the message window
  private _senderId: string; // ID of the message window of the injected process

  constructor(params: ConstructorParams) {
    super();

    const { nativeId, pid } = params;
    this._meshUuid = getMeshUuid();
    this._nativeId = nativeId;
    this._pendingRequests = new Map();
    this._pid = pid;

    this.setupHeartbeat();
    this.setupListenerAck();
    this.setupListenerBroadcastMsg();

    // Listen to messages from the transport and
    // forward broadcast messages locally
    this._messageListener = (sender: number, rawMessage: string) => {
      const parsedMessage: MessageBase = JSON.parse(rawMessage);
      const { messageId, senderId } = parsedMessage;

      if (this._senderId && this._senderId !== senderId) {
        return;
      }

      this._listenerHeartbeat(parsedMessage);

      if (this._pendingRequests.has(messageId)) {
        this._listenerAck(parsedMessage);
      } else {
        this._listenerBroadcastMsg(parsedMessage);
      }
    };

    copyDataTransport.on('message', this._messageListener);

    this.subscribe();
  }

  // Setup heartbeat
  private setupHeartbeat() {
    this._connected = false;
    this._previousDllSequence = -1;

    this._listenerHeartbeat = (message: MessageBase): void => {
      const { sequence } = message;

      if (this._previousDllSequence + 1 !== sequence) {
        // At least one message has been missed
        const msg = `[NWI] Missed message(s) from ${this._senderId}: `
          + `previous sequence ${this._previousDllSequence}, `
          + `current sequence: ${sequence}`;
        writeToLog('info', msg);
      }

      this._previousDllSequence = sequence;
    };

    // Ping message window every second and update current connection status
    setInterval(() => {
      this.send({
        action: 'status/ping/request',
        payload: {}
      }).then(() => {
        if (!this._connected) {
          // This indicates that the core re-connected,
          // so we need to subscribe to events again
          this.subscribe();
        }
        this._connected = true;
      }).catch(() => {
        this._connected = false;
      });
    }, 1000);
  }

  // Setup listener responsible for parsing acks
  private setupListenerAck() {
    this._listenerAck = (message: MessageBase): void => {
      const { messageId, senderId } = message;
      const isNack = message.action.includes('error');
      const pendingRequest = this._pendingRequests.get(messageId);

      if (isNack) {
        pendingRequest.reject((<NackMessage>message).payload.reason);
      } else {
        pendingRequest.resolve();
      }

      this._senderId = senderId;
      this._pendingRequests.delete(messageId);
    };
  }

  // Setup listener responsible for parsing broadcast messages
  private setupListenerBroadcastMsg() {
    this._listenerBroadcastMsg = (message: MessageBase): void => {
      if (!(<BroadcastMessage>message).payload || !(<BroadcastMessage>message).payload.data) {
        writeToLog('info', `[NWI] Injection event without payload: ${JSON.stringify(message)}`);
        return;
      }

      const { payload: originalPayload } = <BroadcastMessage>message;
      const { data: { type: eventAsInteger, ...rest }, dpi: injectionDpi, nativeId, state } = originalPayload;
      const payload = { ...rest, ...state };
      const windowsEvent = <string>WINDOWS_MESSAGE_MAP[eventAsInteger];
      const { dpi: runtimeDpi } = electronApp.getNativeWindowInfoForNativeId(nativeId);

      adjustCoordsScaling(payload, runtimeDpi, injectionDpi);

      this.emit(windowsEvent, payload);
      this.emit('*', payload);
    };
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

  // Request message window to subscribe to all events
  private subscribe() {
    this.send({
      action: 'window/subscription/request',
      payload: { data: { [this._nativeId]: ['*'] }, type: 'set' }
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
