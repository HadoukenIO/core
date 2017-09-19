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

function clipboardWrite(identity: Identity, message: APIMessageClipboardExpanded) {
    const { data, type } = message.payload;
    return clipboard.write(data, type);
}

function clipboardWriteRtf(identity: Identity, message: APIMessageClipboard) {
    const { data, type } = message.payload;
    return clipboard.writeRtf(data, type);
}

function clipboardWriteHtml(identity: Identity, message: APIMessageClipboard) {
    const { data, type } = message.payload;
    return clipboard.writeHtml(data, type);
}

function clipboardWriteText(identity: Identity, message: APIMessageClipboard) {
    const { data, type } = message.payload;
    return clipboard.writeText(data, type);
}

function clipboardAvailableFormats(identity: Identity, message: APIMessageClipboard) {
    const { type } = message.payload;
    return clipboard.availableFormats(type);
}

function clipboardClear(identity: Identity, message: APIMessageClipboard) {
    const { type } = message.payload;
    clipboard.clear(type);
}

function clipboardReadRtf(identity: Identity, message: APIMessageClipboard) {
    const { type } = message.payload;
    return clipboard.readRtf(type);
}

function clipboardReadHtml(identity: Identity, message: APIMessageClipboard) {
    const { type } = message.payload;
    return clipboard.readHtml(type);
}

function clipboardReadText(identity: Identity, message: APIMessageClipboard) {
    const { type } = message.payload;
    return clipboard.readText(type);
}
