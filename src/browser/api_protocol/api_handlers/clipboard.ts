import { registerActionMap } from './api_protocol_base';
import { clipboard } from 'electron';
import { APIMessage, APIPayloadAck } from '../../../shapes';
import { ActionSpecMap } from '../shapes';

const clipboardApiMap: ActionSpecMap = {
    'clipboard-clear': clipboardClear,
    'clipboard-read-formats': { apiFunc: clipboardAvailableFormats, apiPath: '.availableFormats' },
    'clipboard-read-html': { apiFunc: clipboardReadHtml, apiPath: '.readHtml' },
    'clipboard-read-rtf': { apiFunc: clipboardReadRtf, apiPath: '.readRtf' },
    'clipboard-read-text': { apiFunc: clipboardReadText, apiPath: '.readText' },
    'clipboard-write': { apiFunc: clipboardWrite, apiPath: '.write' },
    'clipboard-write-html': { apiFunc: clipboardWriteHtml, apiPath: '.writeHtml' },
    'clipboard-write-rtf': { apiFunc: clipboardWriteRtf, apiPath: '.writeRtf' },
    'clipboard-write-text': { apiFunc: clipboardWriteText, apiPath: '.writeText' },
    'set-clipboard': { apiFunc: clipboardWriteText, apiPath: 'System.setClipboard' } // support for legacy api
};

export function init() {
    registerActionMap(clipboardApiMap, 'System.Clipboard');
}

interface Identity {
    uuid: string;
    name: string;
}

interface APIMessageClipboard extends APIMessage {
    payload: {
        data?: string;
        type?: 'selection' | 'clipboard';
    };
}

interface APIMessageClipboardExpanded extends APIMessage {
    payload: {
        data?: {
            html?: string;
            rtf?: string;
            text?: string;
        };
        type?: 'selection' | 'clipboard';
    };
}

function clipboardWrite(identity: Identity,
                        message: APIMessageClipboardExpanded,
                        ack: (payload: APIPayloadAck) => void) {
    const {data, type} = message.payload;
    ack({
        success: true,
        data: clipboard.write(data, type)
    });
}

function clipboardWriteRtf(identity: Identity,
                           message: APIMessageClipboard,
                           ack: (payload: APIPayloadAck) => void) {
    const {data, type} = message.payload;
    ack({
        success: true,
        data: clipboard.writeRTF(data, type)
    });
}

function clipboardWriteHtml(identity: Identity,
                            message: APIMessageClipboard,
                            ack: (payload: APIPayloadAck) => void) {
    const {data, type} = message.payload;
    ack({
        success: true,
        data: clipboard.writeHTML(data, type)
    });
}

function clipboardWriteText(identity: Identity,
                            message: APIMessageClipboard,
                            ack: (payload: APIPayloadAck) => void) {
    const {data, type} = message.payload;
    ack({
        success: true,
        data: clipboard.writeText(data, type)
    });
}

function clipboardAvailableFormats(identity: Identity,
                                   message: APIMessageClipboard,
                                   ack: (payload: APIPayloadAck) => void) {
    const {type} = message.payload;
    ack({
        success: true,
        data: clipboard.availableFormats(type)
    });
}

function clipboardClear(identity: Identity,
                        message: APIMessageClipboard,
                        ack: (payload: APIPayloadAck) => void) {
    const {type} = message.payload;
    clipboard.clear(type);
    ack({success: true});
}

function clipboardReadRtf(identity: Identity,
                          message: APIMessageClipboard,
                          ack: (payload: APIPayloadAck) => void) {
    const {type} = message.payload;
    ack({
        success: true,
        data: clipboard.readRTF(type)
    });
}

function clipboardReadHtml(identity: Identity,
                           message: APIMessageClipboard,
                           ack: (payload: APIPayloadAck) => void) {
    const {type} = message.payload;
    ack({
        success: true,
        data: clipboard.readHTML(type)
    });
}

function clipboardReadText(identity: Identity,
                           message: APIMessageClipboard,
                           ack: (payload: APIPayloadAck) => void) {
    const {type} = message.payload;
    ack({
        success: true,
        data: clipboard.readText(type)
    });
}
