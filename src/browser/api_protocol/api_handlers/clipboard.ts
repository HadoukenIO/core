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
import { APIMessage, APIPayloadAck, Acker } from '../../../shapes';
import { ActionSpecMap } from '../shapes';

const clipboardApiMap: ActionSpecMap = {
    'clipboard-clear': clipboardClear,
    'clipboard-read-formats': { actor: clipboardAvailableFormats, apiPath: '.availableFormats' },
    'clipboard-read-html': { actor: clipboardReadHtml, apiPath: '.readHtml' },
    'clipboard-read-rtf': { actor: clipboardReadRtf, apiPath: '.readRtf' },
    'clipboard-read-text': { actor: clipboardReadText, apiPath: '.readText' },
    'clipboard-write': { actor: clipboardWrite, apiPath: '.write' },
    'clipboard-write-html': { actor: clipboardWriteHtml, apiPath: '.writeHtml' },
    'clipboard-write-rtf': { actor: clipboardWriteRtf, apiPath: '.writeRtf' },
    'clipboard-write-text': { actor: clipboardWriteText, apiPath: '.writeText' },
    'set-clipboard': { actor: clipboardWriteText, apiPath: 'System.setClipboard' } // support for legacy api
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

function success(data: any): APIPayloadAck {
    return { success: true, data };
}

function clipboardWrite(identity: Identity, message: APIMessageClipboardExpanded, ack: Acker) {
    const {data, type} = message.payload;
    ack(success(clipboard.write(data, type)));
}

function clipboardWriteRtf(identity: Identity, message: APIMessageClipboard, ack: Acker) {
    const {data, type} = message.payload;
    ack(success(clipboard.writeRtf(data, type)));
}

function clipboardWriteHtml(identity: Identity, message: APIMessageClipboard, ack: Acker) {
    const {data, type} = message.payload;
    ack(success(clipboard.writeHtml(data, type)));
}

function clipboardWriteText(identity: Identity, message: APIMessageClipboard, ack: Acker) {
    const {data, type} = message.payload;
    ack(success(clipboard.writeText(data, type)));
}

function clipboardAvailableFormats(identity: Identity, message: APIMessageClipboard, ack: Acker) {
    const {type} = message.payload;
    ack(success(clipboard.availableFormats(type)));
}

function clipboardClear(identity: Identity, message: APIMessageClipboard, ack: Acker) {
    const {type} = message.payload;
    clipboard.clear(type);
    ack({success: true});
}

function clipboardReadRtf(identity: Identity, message: APIMessageClipboard, ack: Acker) {
    const {type} = message.payload;
    ack(success(clipboard.readRtf(type)));
}

function clipboardReadHtml(identity: Identity, message: APIMessageClipboard, ack: Acker) {
    const {type} = message.payload;
    ack(success(clipboard.readHtml(type)));
}

function clipboardReadText(identity: Identity, message: APIMessageClipboard, ack: Acker) {
    const {type} = message.payload;
    ack(success(clipboard.readText(type)));
}
