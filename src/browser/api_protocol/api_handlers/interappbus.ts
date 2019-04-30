import * as apiProtocolBase from './api_protocol_base';
const { InterApplicationBus } = require('../../api/interappbus');
import ofEvents from '../../of_events';
import route from '../../../common/route';
import {
    Acker,
    APIMessage,
    Identity,
    Subscriber
} from '../../../shapes';

type IABSubscriptionArgs = [string, string, string, string, number];

enum SubscriptionTypes {
    MESSAGE = 1,
    SUB_ADDED,
    SUB_REMOVED
}

const successAck = {
    success: true
};

const interAppBusExternalApiMap = {
    'publish-message': publishMessage,
    'send-message': sendMessage,
    'subscribe': subscribe,
    'unsubscribe': unsubscribe,
    'subscriber-added': subscriberAdded,
    'subscriber-removed': subscriberRemoved
};

export function init(): void {
    apiProtocolBase.registerActionMap(interAppBusExternalApiMap);
}

function unsubscribe(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const { topic } = payload;
    const sourceUuid = '*';
    const sourceWindowName = '*';
    const subscriptionArgs: IABSubscriptionArgs = [
        topic,
        identity.uuid,
        sourceUuid,
        sourceWindowName,
        SubscriptionTypes.MESSAGE
    ];

    apiProtocolBase.removeSubscription(identity, ...subscriptionArgs);

    if (apiProtocolBase.subscriptionExists(identity, ...subscriptionArgs)) {
        //if it still has the subscription, it didn't emit subscriber removed event.
        InterApplicationBus.emitSubscriberRemoved(identity, payload);
    }

    ack(successAck);
}

function subscribe(identity: Identity, message: APIMessage, ack: Acker): void {
    const { uuid, name } = identity;
    const { payload } = message;
    const { topic, messageKey: subscribedMessageKey } = payload;
    const sourceUuid = '*';
    const sourceWindowName = '*';

    const subscriptionCallback = (payload: any): void => {
        const { messageKey: sentMessageKey } = payload;
        const command = { action: 'process-message', payload };

        // old subscribing to new
        if (!subscribedMessageKey && (sentMessageKey === 'messageString')) {
            command.payload.message = JSON.parse(payload[sentMessageKey]);
        }

        apiProtocolBase.sendToIdentity(identity, command);
    };

    const subscriptionArgs: IABSubscriptionArgs = [
        topic,
        uuid,
        sourceUuid,
        sourceWindowName,
        SubscriptionTypes.MESSAGE
    ];

    if (apiProtocolBase.subscriptionExists(identity, ...subscriptionArgs)) {
        apiProtocolBase.uppSubscriptionRefCount(identity, ...subscriptionArgs);

        InterApplicationBus.emitSubscriberAdded(identity, payload);

        ofEvents.once(route.window('unload', uuid, name, false), (): void => {
            apiProtocolBase.removeSubscription(identity, ...subscriptionArgs);
        });
    } else {
        const wildcardPayload = {
            ...payload,
            sourceUuid,
            sourceWindowName
        };
        const subscriptionObj = InterApplicationBus.subscribe(identity, wildcardPayload, subscriptionCallback);
        InterApplicationBus.emitSubscriberAdded(identity, payload);

        const unsub = (): void => {
            InterApplicationBus.emitSubscriberRemoved(identity, payload);
            subscriptionObj.unsubscribe();
        };
        apiProtocolBase.registerSubscription(unsub, identity, ...subscriptionArgs);

        ofEvents.once(route.window('unload', uuid, name, false), (): void => {
            apiProtocolBase.removeSubscription(identity, ...subscriptionArgs);
        });
    }

    ack(successAck);
}

function sendMessage(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    InterApplicationBus.send(identity, payload);
    ack(successAck);
}

function publishMessage(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    InterApplicationBus.publish(identity, payload);
    ack(successAck);
}

function subscriberAdded(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    InterApplicationBus.raiseSubscriberEvent(ofEvents.subscriber.ADDED, payload);
    ack(successAck);
}

function subscriberRemoved(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    InterApplicationBus.raiseSubscriberEvent(ofEvents.subscriber.REMOVED, payload);
    ack(successAck);
}

function initSubscriptionListeners(connectionIdentity: Identity): void {
    const { SUB_ADDED, SUB_REMOVED } = SubscriptionTypes;
    const { uuid, name } = connectionIdentity;
    const iabIdentity = { uuid, name: uuid };

    const subAddedSubObj = InterApplicationBus.subscriberAdded(iabIdentity, (subscriber: Subscriber): void => {
        const { directMsg } = subscriber;
        const directedToId = directMsg === name;

        if (directMsg) {
            if (directedToId) {
                sendSubscriberEvent(connectionIdentity, subscriber, ofEvents.subscriber.ADDED);
            }
            // else msg not directed at this identity, dont send it
        } else {
            sendSubscriberEvent(connectionIdentity, subscriber, ofEvents.subscriber.ADDED);
        }
    });

    const subRemovedSubObj = InterApplicationBus.subscriberRemoved(iabIdentity, (subscriber?: Subscriber): void => {
        const { directMsg = null } = (subscriber || {});
        const directedToId = directMsg === name;

        if (directMsg) {
            if (directedToId) {
                sendSubscriberEvent(connectionIdentity, subscriber, ofEvents.subscriber.REMOVED);
            }
            // else msg not directed at this identity, dont send it
        } else {
            sendSubscriberEvent(connectionIdentity, subscriber, ofEvents.subscriber.REMOVED);
        }
    });

    apiProtocolBase.registerSubscription(subAddedSubObj.unsubscribe, iabIdentity, uuid, name, SUB_ADDED);
    apiProtocolBase.registerSubscription(subRemovedSubObj.unsubscribe, iabIdentity, uuid, name, SUB_REMOVED);

    ofEvents.once(route.window('unload', uuid, name, false), (): void => {
        apiProtocolBase.removeSubscription(iabIdentity, uuid, name, SUB_ADDED);
        apiProtocolBase.removeSubscription(iabIdentity, uuid, name, SUB_REMOVED);
    });
}

// As per 5.0 we blast out the subscriber-added and the subscriber-removed
// envents. The following 2 hooks ensure that we continue to blast these out
// for both external connections and js apps
ofEvents.on(route.window('init-subscription-listeners'), (identity: Identity): void => {
    initSubscriptionListeners(identity);
});

apiProtocolBase.onClientAuthenticated(initSubscriptionListeners);

function sendSubscriberEvent(identity: Identity, subscriber: Subscriber, action: string): void {
    const subscriberAdded = {
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
