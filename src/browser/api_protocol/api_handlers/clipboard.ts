/*
Copyright 2017 OpenFin Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
import { registerActionMap } from './api_protocol_base';
import { clipboard } from 'electron';
import { APIMessage, APIPayloadAck } from '../../../shapes';

const clipboardApiMap = {
    'clipboard-clear': clipboardClear,
    'clipboard-read-formats': clipboardAvailableFormats,
    'clipboard-read-html': clipboardReadHtml,
    'clipboard-read-rtf': clipboardReadRtf,
    'clipboard-read-text': clipboardReadText,
    'clipboard-write': clipboardWrite,
    'clipboard-write-html': clipboardWriteHtml,
    'clipboard-write-rtf': clipboardWriteRtf,
    'clipboard-write-text': clipboardWriteText,
    'set-clipboard': clipboardWriteText // support for legacy api
};

export function init() {
    registerActionMap(clipboardApiMap);
}

interface Identity {
    uuid: string;
    name: string;
}

interface APIMessageClipboard extends APIMessage {
    payload: {
        data?: string;
        type: null | string;
    };
}

interface APIMessageClipboardExpanded extends APIMessage {
    payload: {
        data?: {
            html?: string;
            rtf?: string;
            text?: string;
        };
        type: null | string;
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
        data: clipboard.writeRtf(data, type)
    });
}

function clipboardWriteHtml(identity: Identity,
                            message: APIMessageClipboard,
                            ack: (payload: APIPayloadAck) => void) {
    const {data, type} = message.payload;
    ack({
        success: true,
        data: clipboard.writeHtml(data, type)
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
        data: clipboard.readRtf(type)
    });
}

function clipboardReadHtml(identity: Identity,
                           message: APIMessageClipboard,
                           ack: (payload: APIPayloadAck) => void) {
    const {type} = message.payload;
    ack({
        success: true,
        data: clipboard.readHtml(type)
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
