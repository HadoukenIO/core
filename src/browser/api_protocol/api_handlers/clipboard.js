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
let apiProtocolBase = require('./api_protocol_base.js');
const clipboard = require('electron').clipboard;
const _ = require('underscore');

function ClipboardApiHandler() {
    const successAck = {
        success: true
    };

    const clipboardApiMap = {
        'clipboard-read-text': clipboardReadText,
        'clipboard-read-html': clipboardReadHtml,
        'clipboard-read-rtf': clipboardReadRtf,
        'clipboard-read-formats': clipboardAvailableFormats,
        'clipboard-clear': clipboardClear,
        'clipboard-write-text': clipboardWriteText,
        'clipboard-write-html': clipboardWriteHtml,
        'clipboard-write-rtf': clipboardWriteRtf,
        'clipboard-write': clipboardWrite,

        //support for legacy api
        'set-clipboard': clipboardWriteText
    };

    apiProtocolBase.registerActionMap(clipboardApiMap);

    function clipboardWrite(identity, message, ack) {
        const dataAck = _.clone(successAck);

        dataAck.data = clipboard.write(message.payload.data, message.payload.type);
        ack(dataAck);
    }

    function clipboardWriteRtf(identity, message, ack) {
        const dataAck = _.clone(successAck);

        dataAck.data = clipboard.writeRtf(message.payload.data, message.payload.type);
        ack(dataAck);
    }

    function clipboardWriteHtml(identity, message, ack) {
        const dataAck = _.clone(successAck);

        dataAck.data = clipboard.writeHtml(message.payload.data, message.payload.type);
        ack(dataAck);
    }

    function clipboardWriteText(identity, message, ack) {
        const dataAck = _.clone(successAck);

        dataAck.data = clipboard.writeText(message.payload.data, message.payload.type);
        ack(dataAck);
    }

    function clipboardAvailableFormats(identity, message, ack) {
        const dataAck = _.clone(successAck);

        dataAck.data = clipboard.availableFormats(message.payload.type);
        ack(dataAck);
    }

    function clipboardClear(identity, message, ack) {

        clipboard.clear(message.payload.type);
        ack(successAck);
    }

    function clipboardReadRtf(identity, message, ack) {
        const dataAck = _.clone(successAck);

        dataAck.data = clipboard.readRtf(message.payload.type);
        ack(dataAck);
    }

    function clipboardReadHtml(identity, message, ack) {
        const dataAck = _.clone(successAck);

        dataAck.data = clipboard.readHtml(message.payload.type);
        ack(dataAck);
    }

    function clipboardReadText(identity, message, ack) {
        const dataAck = _.clone(successAck);

        dataAck.data = clipboard.readText(message.payload.type);
        ack(dataAck);
    }

}

module.exports.ClipboardApiHandler = ClipboardApiHandler;
