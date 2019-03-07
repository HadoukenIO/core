import { app as electronApp } from 'electron';
import WMCopyData from './wm_copydata';

const copyDataTransport = new WMCopyData('OpenFin-NativeWindowManager-Client', '');

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
    data: any;
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
}

export default class NativeWindowInjectionBus {
  private _events: { [eventName: string]: Listener[] };
  private _eventsCount: number;
  private _nativeId: string;
  private _pid: number;
  private _sequence: number;

  constructor(params: ConstructorParams) {
    const { nativeId, pid } = params;
    this._events = {};
    this._eventsCount = 0;
    this._nativeId = nativeId;
    this._pid = pid;
    this._sequence = 0;
  }

  public async on(event: string, listener: Listener): Promise<void> {
    const listeners = this._events[event] || [];

    if (listeners.length === 0) {
      this._events[event] = listeners;
      await this.subscribe(event);
    }

    this._eventsCount += 1;
    listeners.push(listener);
  }

  public removeAllListeners() {
    // TODO: un-subscription is not implemented yet on the injected processes
    copyDataTransport.removeAllListeners();
  }

  private sendMessage(message: SendMessage): boolean {
    const { action, event, messageId } = message;

    return copyDataTransport.sendByName('OpenFin-WindowManager-Server-8604', {
      action,
      messageId,
      payload: { nativeId: this._nativeId, event }
    });
  }

  private async subscribe(event: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const messageId = electronApp.generateGUID();
      const nackTimeoutDelay = 1000;
      let nackTimeout: NodeJS.Timeout;

      const handleNack = (errorMessage: string = `Failed to subscribe to ${event}`): void => {
        clearTimeout(nackTimeout);
        reject(errorMessage);
      };

      const onMessage = (sender: number, rawMessage: string) => {
        const parsedMessage: MessageBase = JSON.parse(rawMessage);
        const messageIdMatch = messageId === parsedMessage.messageId;
        let message;

        this._sequence += 1;

        // Ack
        if (parsedMessage.action.includes('response')) {
          if (messageIdMatch) {
            clearTimeout(nackTimeout);
            message = <AckMessage>parsedMessage;
            resolve();
          }
          return;
        }

        // Nack
        if (parsedMessage.action.includes('error')) {
          if (messageIdMatch) {
            message = <NackMessage>parsedMessage;
            handleNack(message.payload.reason);
          }
          return;
        }

        // Broadcast
        if (parsedMessage.action.includes('broadcast')) {
          message = <BroadcastMessage>parsedMessage;
        }

        const { payload: { data } } = message;
        data.eventType = data.type;

        // Call all event listeners
        this._events[event].forEach(e => e(data));

        if (this._sequence !== message.sequence) {
          // TODO: verify sequence logic
          // Sequence numbers aren't matching indicating some
          // messages might have failed to get delivered
        }
      };

      copyDataTransport.on('message', onMessage);
      this.sendMessage({ action: 'subscription/set/request', event, messageId });
      nackTimeout = setTimeout(handleNack, nackTimeoutDelay);
    });
  }
}
