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
var InterApplicationBus = require('../../api/interappbus.js').InterApplicationBus;
import ofEvents from '../../of_events';

function InterApplicationBusApiHandler() {

    var subScriptionTypes = {
            MESSAGE: 1,
            SUB_ADDED: 2,
            SUB_REMOVED: 3
        },
        successAck = {
            success: true
        },
        interAppBusExternalApiMap = {
            'publish-message': publishMessage,
            'send-message': sendMessage,
            'subscribe': subscribe,
            'unsubscribe': unsubscribe
        };

    apiProtocolBase.registerActionMap(interAppBusExternalApiMap);

    function unsubscribe(identity, message, ack) {

        let payload = message.payload;
        let topic = payload.topic;
        let sourceUuid = payload.sourceUuid;
        let sourceWindowName = payload.sourceWindowName || '';

        apiProtocolBase.removeSubscription(identity, topic, identity.uuid, sourceUuid, sourceWindowName, subScriptionTypes.MESSAGE);
        ack(successAck);
    }

    function subscribe(identity, message, ack) {
        // let message = JSON.parse(JSON.stringify(rawMessage));
        let payload = message.payload;
        let topic = payload.topic;
        let sourceUuid = payload.sourceUuid;
        let sourceWindowName = payload.sourceWindowName || '';
        let {
            messageKey: acceptedKey
        } = payload;

        let subscriptionCallback = function(msgObj) {

            let payload = {
                sourceUuid: msgObj.identity.uuid,
                topic: topic,
                destinationUuid: sourceUuid,
                message: msgObj.message,
                directMsg: msgObj.directMsg,
                sourceWindowName: msgObj.identity.name
            };

            let {
                messageKey
            } = msgObj;

            var obj = {
                action: 'process-message',
                payload: Object.assign(msgObj, payload)
            };

            // old subscribing to new 
            if (!acceptedKey && (messageKey === 'messageString')) {
                obj.payload.message = JSON.parse(msgObj[messageKey]);
            }

            apiProtocolBase.sendToIdentity(identity, obj);
        };
        let subscriptionObj;

        if (apiProtocolBase.subscriptionExists(identity, topic, identity.uuid, sourceUuid, sourceWindowName, subScriptionTypes.MESSAGE)) {
            apiProtocolBase.uppSubscriptionRefCount(identity, topic, identity.uuid, sourceUuid, sourceWindowName, subScriptionTypes.MESSAGE);

        } else {

            subscriptionObj = InterApplicationBus.subscribe(identity, payload, subscriptionCallback);

            apiProtocolBase.registerSubscription(subscriptionObj.unsubscribe,
                identity,
                topic,
                identity.uuid,
                sourceUuid,
                sourceWindowName,
                subScriptionTypes.MESSAGE);
        }

        ack(successAck);
    }


    function sendMessage(identity, payloadFromAdapter, ack) {
        InterApplicationBus.send(identity, payloadFromAdapter);
        ack(successAck);
    }

    function publishMessage(identity, message, ack) {
        var payload = message.payload;

        InterApplicationBus.publish(identity, payload);
        ack(successAck);
    }


    function initSubscriptionListeners(connectionIdentity) {
        var iabIdentity = {
            name: connectionIdentity.uuid,
            uuid: connectionIdentity.uuid
        };
        let subAddedSubObj, subRemovedSubObj;

        subAddedSubObj = InterApplicationBus.subscriberAdded(iabIdentity, function(subscriber) {

            let {
                directMsg
            } = subscriber;
            let directedToId = directMsg === connectionIdentity.name;

            if (directMsg) {
                if (directedToId) {
                    sendSubscriberEvent(connectionIdentity, subscriber, 'subscriber-added');
                }

                // else msg not directed at this identity, dont send it

            } else {
                sendSubscriberEvent(connectionIdentity, subscriber, 'subscriber-added');
            }
        });

        subRemovedSubObj = InterApplicationBus.subscriberRemoved(iabIdentity, function(subscriber = {}) {
            let {
                directMsg
            } = subscriber;
            let directedToId = directMsg === connectionIdentity.name;

            if (directMsg) {
                if (directedToId) {
                    sendSubscriberEvent(connectionIdentity, subscriber, 'subscriber-removed');
                }

                // else msg not directed at this identity, dont send it

            } else {
                sendSubscriberEvent(connectionIdentity, subscriber, 'subscriber-removed');
            }

        });

        apiProtocolBase.registerSubscription(subAddedSubObj.unsubscribe,
            iabIdentity,
            iabIdentity.uuid,
            iabIdentity.name,
            subScriptionTypes.SUB_ADDED);

        apiProtocolBase.registerSubscription(subRemovedSubObj.unsubscribe,
            iabIdentity,
            iabIdentity.uuid,
            iabIdentity.name,
            subScriptionTypes.SUB_REMOVED);
    }


    // As per 5.0 we blast out the subscriber-added and the subscriber-removed
    // envents. The following 2 hooks ensure that we continue to blast these out
    // for both external connections and js apps
    ofEvents.on(`window/init-subscription-listeners`, (identity) => {
        initSubscriptionListeners(identity);
    });

    apiProtocolBase.onClientAuthenticated(initSubscriptionListeners);

    function sendSubscriberEvent(identity, subscriber, action) {
        var subscriberAdded = {
            action: action,
            payload: {
                senderName: subscriber.senderName,
                senderUuid: subscriber.senderUuid,
                targetName: subscriber.name,
                topic: subscriber.topic,
                uuid: subscriber.uuid
            }
        };
        apiProtocolBase.sendToIdentity(identity, subscriberAdded);
    }

} // end InterApplicationBusApiHandler

module.exports.InterApplicationBusApiHandler = InterApplicationBusApiHandler;
