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
/*
    src/browser/external_connection/notification.js
 */
let apiProtocolBase = require('./api_protocol_base.js');
let _ = require('underscore');


function NotificationApiHandler() {

    let notficationExternalApiMap = {
        'send-action-to-notifications-center': sendActionToNotificationsCenter,
        'initialize-notification': initializeNotification,
        'send-action-to-notification': sendActionToNotification,
        'register-drag-handler': registerDragHandler,
        'dispatch-notification-event': dispatchNotificationEvent,
        'send-application-message': sendApplicationMessage
    };
    apiProtocolBase.registerActionMap(notficationExternalApiMap);

    function sendApplicationMessage(identity, message) {
        console.log(message);
    }

    function dispatchNotificationEvent(identity, message) {
        let {
            payload: {
                destinationName,
                destinationUuid,

                payload: {
                    type
                }
            },
            payload
        } = message;

        let action;


        if (destinationUuid === 'service:notifications') {
            action = 'process-action-from-notifications-center';
        } else {
            action = 'process-notification-event';
        }

        if (type === 'click' ||
            type === 'show' ||
            type === 'dismiss' ||
            type === 'close' ||
            type === 'message') {
            apiProtocolBase.sendToIdentity({
                name: destinationName,
                uuid: destinationUuid
            }, {
                'action': action,
                'payload': payload.payload
            });

        } else {
            apiProtocolBase.sendToIdentity({
                name: destinationName,
                uuid: destinationUuid
            }, {
                'action': 'process-action-from-notifications',
                'payload': payload.payload
            });
        }




    }

    function registerDragHandler(identity, message) {
        console.log(identity, message);
    }

    function sendActionToNotification(identity, message /*, ack*/ ) {
        let {
            payload: {
                destinationName,

                payload: {
                    type
                }
            },
            payload
        } = message;

        let {
            uuid,
            name
        } = identity;

        let isDragHandler = type === 'drag-handler';

        message.sourceName = name;
        message.sourceUuid = uuid;


        // console.log(destinationName);


        if (type === 'initialize-notification') {
            payload.payload.token = payload.payload.payload.token;
            apiProtocolBase.sendToIdentity({
                name: destinationName,
                uuid: 'service:notifications'
            }, {
                'action': 'process-action-from-notifications-center',
                'payload': payload.payload,
                'token': payload.payload.payload.token
            });
        } else if (isDragHandler) {
            message.type = type;
            message.payload.type = type;
            apiProtocolBase.sendToIdentity({
                name: destinationName,
                uuid: 'service:notifications'
            }, _.extend(message, {
                action: 'process-action-from-notifications-center'
            }));
        } else {

            apiProtocolBase.sendToIdentity({
                name: destinationName,
                uuid: 'service:notifications'
            }, _.extend(message, {
                action: 'process-action-from-notifications-center'
            }));
        }



    }


    function initializeNotification() {
        console.log(arguments);
    }


    function sendActionToNotificationsCenter(identity, message, ack) {
        console.log('\n\nthis is the new message on the way in');
        let {
            uuid,
            name
        } = identity;

        let response = {
            msg: {
                action: 'send-action-to-notifications-center',
                payload: message,
                sourceName: uuid,
                sourceUuid: uuid
            },
            'success': true
        };

        // let {payload: {
        //     action
        // }} = message;




        ack(response);

        message.payload.sourceName = name;
        message.payload.sourceUuid = uuid;

        apiProtocolBase.sendToIdentity({
                name: 'service:notifications',
                uuid: 'service:notifications'
            },
            _.extend(message, {
                action: 'process-action-from-notification',
                sourceName: name,
                sourceUuid: uuid
            }));
    }

} // end NotificationApiHandler

module.exports.NotificationApiHandler = NotificationApiHandler;
