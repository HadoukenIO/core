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
import {routeRequest} from '../../api/notifications/subscriptions';
import {NotificationMessage} from '../../api/notifications/shapes';
import NoteAction from '../../api/notifications/note_action';

declare var require: any;

const apiProtocolBase = require('./api_protocol_base.js');
import { ActionSpecMap } from '../shapes';
const { writeToLog } = require('../../log');

/* tslint:disable: function-name */
function NotificationApiHandler() {
    const noteApiMap: ActionSpecMap = {
        'notifications': (id: any, request: any, ack: any) => {
            routeRequest(id, unpackGeneralMsg(request), ack);
        },
        'send-action-to-notifications-center': normalizeAndDispatch
    };

    apiProtocolBase.registerActionMap(noteApiMap);

    return apiProtocolBase;
}

function normalizeAndDispatch(id: any, msg: any, ack: () => void): void {
    const { action } = msg;

    switch (action) {
        case 'send-action-to-notifications-center':
            routeNoteCenterMessages(id, msg, ack);
        break;

        default:
        break;

    }
}

// Route the messages that have the shape of the <= 5.0
// 'send-action-to-notifications-center' messages
function routeNoteCenterMessages(id: any, msg: any, ack: () => void) {
    const {
        payload: {
            action,
            payload: data
        }} = msg;

    switch (action) {
        case 'create-notification':
            writeToLog('info', msg);
            // unpack the nested message as sent 5.0 style
            data.message = data.message && data.message.message;
            routeRequest(id, <NotificationMessage> {
                action: NoteAction.create_external,
                data,
                id
            }, ack);
         break;

        case 'send-notification-message':
            routeRequest(id, <NotificationMessage> {
                action: NoteAction.message,
                data: {
                    message: data.message.message,
                    notificationId: data.notificationId || null
                },
                id
            }, ack);
            break;

        case 'close-notification':
            routeRequest(id, <NotificationMessage> {
                action: NoteAction.close,
                data: {
                    notificationId: data.notificationId || null
                },
                id
            }, ack);
            break;

        default:
            break;
    }
}

function unpackGeneralMsg (request: any) {
    const {action, data, id} = request.payload;
    return <NotificationMessage> {
        action, data, id
    };
}

export {NotificationApiHandler};
