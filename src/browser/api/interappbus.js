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
    /src/browser/api/interappbus.js

    the general form of the pub/sub is

    `${topic}:${senderUuid}/${senderName}:${destinationUuid}/${destinationName}`
 */

let util = require('util');
let EventEmitter = require('events').EventEmitter;
import SubscriptionManager from '../subscription_manager';
import ofEvents from '../of_events';

const subscriptionManager = new SubscriptionManager();
let callbacks = {};

const NO_SUBS_ERR_STR = 'No subscriptions match';

const ANY_UUID = '*';
const ANY_NAME = '*';

// unique identifier to map remote callback functions
let callbackId = 0;
let busEventing, ofBus;


// used for internal subscriptions (addSubscribeListener etc)
function BusEventing() {
    EventEmitter.call(this);
}
util.inherits(BusEventing, EventEmitter);
busEventing = new BusEventing();


// openfin pub / sub bus
function OFBus() {
    EventEmitter.call(this);
}
util.inherits(OFBus, EventEmitter);
ofBus = new OFBus();


/*
    the shape of things to come

    {
        senderUuid: senderUuid,
        senderName: senderName,
        uuid: uuid,
        name: name,
        topic: topic
    }
 */
busEventing.on(ofEvents.subscriber.ADDED, subInfo => {
    const subscriptionInfo = JSON.parse(JSON.stringify(subInfo));

    subscriptionInfo.topic = decodeURIComponent(subscriptionInfo.topic);
    busEventing.emit(generateKey([ofEvents.subscriber.ADDED], [subInfo.senderUuid, subInfo.senderName]), subscriptionInfo);
});

busEventing.on(ofEvents.subscriber.REMOVED, subInfo => {
    const subscriptionInfo = JSON.parse(JSON.stringify(subInfo));

    subscriptionInfo.topic = decodeURIComponent(subscriptionInfo.topic);
    busEventing.emit(generateKey([ofEvents.subscriber.REMOVED], [subInfo.senderUuid, subInfo.senderName]), subscriptionInfo);
});


function genCallBackId() {
    return ++callbackId;
}

function publish(identity, payload) {
    let {
        topic
    } = payload;

    let payloadToDeliver = Object.assign({
        sourceUuid: identity.uuid,
        sourceWindowName: identity.name,
        destinationUuid: ANY_UUID
    }, payload);

    dispatchToSubscriptions(topic, identity, null, null, payloadToDeliver, true);
}

function send(identity, payload) {
    let {
        topic,
        destinationUuid,
        destinationWindowName
    } = payload;

    let payloadToDeliver = Object.assign({
        sourceUuid: identity.uuid,
        sourceWindowName: identity.name,
    }, payload);

    if (!dispatchToSubscriptions(topic, identity, destinationUuid, destinationWindowName, payloadToDeliver)) {
        throw new Error(NO_SUBS_ERR_STR);
    }
}

function dispatchToSubscriptions(topic, identity, destUuid, destName, payload, sendToAll) {
    const keys = generateSendKeys(topic, identity, {
        uuid: destUuid || ANY_UUID,
        name: destName || ANY_NAME
    });

    //TODO: sendToAll is a symptom of not knowing the target identity given a set of keys.
    if (sendToAll) {
        return ofBus.emit(keys.fromAny, payload) +
            ofBus.emit(keys.fromApp, payload) +
            ofBus.emit(keys.fromWin, payload);
    }

    return ofBus.emit(keys.fromAny, payload) ||
        ofBus.emit(keys.fromApp, payload) ||
        ofBus.emit(keys.fromWin, payload);
}

function emitSubscriberAdded(identity, payload) {
    const senderUuid = payload.sourceUuid || ANY_UUID;

    const eventingPayload = {
        senderUuid: senderUuid,
        senderName: senderUuid,
        uuid: identity.uuid,
        name: identity.name,
        topic: payload.topic,
        directMsg: payload.sourceWindowName !== ANY_NAME ? payload.sourceWindowName : false
    };
    busEventing.emit(ofEvents.subscriber.ADDED, eventingPayload);
}

function emitSubscriberRemoved(identity, payload) {
    const senderUuid = payload.sourceUuid || ANY_UUID;

    const eventingPayload = {
        senderUuid: senderUuid,
        senderName: senderUuid,
        uuid: identity.uuid,
        name: identity.name,
        topic: payload.topic,
        directMsg: payload.sourceWindowName !== ANY_NAME ? payload.sourceWindowName : false
    };
    busEventing.emit(ofEvents.subscriber.REMOVED, eventingPayload);
}

function subscribe(identity, payload, listener) {
    let topic = payload.topic;
    let senderUuid = payload.sourceUuid || ANY_UUID;
    let senderName = payload.sourceWindowName || ANY_NAME;

    let cbId = genCallBackId();

    callbacks['' + cbId] = listener;

    let keys = generateSubscribeKeys(topic, {
        uuid: senderUuid,
        name: senderName
    }, identity);

    ofBus.on(keys.toAny, listener);
    ofBus.on(keys.toWin, listener);
    ofBus.on(keys.toApp, listener);

    // for the subscribe listeners:
    emitSubscriberAdded(identity, payload);

    //return a function that will unhook the listeners
    var unsubItem = {
        cbId,
        unsubscribe: () => {
            ofBus.removeListener(keys.toAny, listener);
            ofBus.removeListener(keys.toWin, listener);
            ofBus.removeListener(keys.toApp, listener);

            emitSubscriberRemoved(identity, payload);
        }
    };

    return unsubItem;
}

function subscriberAdded(identity, listener) {
    let {
        uuid,
        name
    } = identity;
    let cbId = genCallBackId();

    let listenerStrs = generateListenerKeys(ofEvents.subscriber.ADDED, uuid, name);
    let subMgrStr = listenerStrs[0];

    let unsubItem;

    callbacks['' + cbId] = listener;

    listenerStrs.forEach(listenerStr => {
        busEventing.on(listenerStr, listener);
    });

    unsubItem = {
        cbId,
        unsubscribe: () => {
            removeSubscriberAdded(identity, cbId);
        }
    };

    subscriptionManager.registerSubscription(unsubItem.unsubscribe,
        identity,
        subMgrStr);
    return unsubItem;
}


function removeSubscriberAdded(identity, cbId) {
    let {
        uuid,
        name
    } = identity;
    let callback = callbacks['' + cbId];

    if (!callback) {
        return;
    }

    let listenerStrs = generateListenerKeys(ofEvents.subscriber.ADDED, uuid, name);

    listenerStrs.forEach(listenerStr => {
        busEventing.removeListener(listenerStr, callback);
    });

    delete callbacks['' + cbId];
}


function subscriberRemoved(identity, listener) {
    let cbId = genCallBackId();
    let {
        uuid,
        name
    } = identity;

    let listenerStrs = generateListenerKeys(ofEvents.subscriber.REMOVED, uuid, name);
    let subMgrStr = listenerStrs[0];

    let unsubItem;

    listenerStrs.forEach(listenerStr => {
        busEventing.on(listenerStr, listener);
    });

    callbacks['' + cbId] = listener;

    unsubItem = {
        cbId,
        unsubscribe: () => {
            removeSubscriberRemoved(identity, cbId);
        }
    };

    subscriptionManager.registerSubscription(unsubItem.unsubscribe, identity, subMgrStr);

    return unsubItem;
}


function removeSubscriberRemoved(identity, cbId) {
    let callback = callbacks['' + cbId];
    let {
        uuid,
        name
    } = identity;

    if (!callback) {
        return;
    }

    let listenerStrs = generateListenerKeys(ofEvents.subscriber.REMOVED, uuid, name);

    listenerStrs.forEach(listenerStr => {
        busEventing.removeListener(listenerStr, callback);
    });

    delete callbacks['' + cbId];
}


function generateKey(...args) {
    return args.map(arg => encodeKeyPart(...arg)).join(':');
}

function encodeKeyPart(...args) {
    return args.map(arg => encodeURIComponent(arg)).join('/');
}

function generateSendKeys(topic, source, dest) {
    return {
        fromWin: generateKey([topic], [source.uuid, source.name], [dest.uuid, dest.name]),
        fromApp: generateKey([topic], [source.uuid, ANY_NAME], [dest.uuid, dest.name]),
        fromAny: generateKey([topic], [ANY_UUID, ANY_NAME], [dest.uuid, dest.name])
    };
}

function generateSubscribeKeys(topic, source, dest) {
    return {
        toWin: generateKey([topic], [source.uuid, source.name], [dest.uuid, dest.name]),
        toApp: generateKey([topic], [source.uuid, source.name], [dest.uuid, ANY_NAME]),
        toAny: generateKey([topic], [source.uuid, source.name], [ANY_UUID, ANY_NAME])
    };
}

function generateListenerKeys(topic, uuid, name) {
    return [
        generateKey([topic], [uuid, name]),
        generateKey([topic], [uuid, ANY_NAME]),
        generateKey([topic], [ANY_UUID, ANY_NAME])
    ];
}

function raiseSubscriberEvent(eventName, evtObj) {
    busEventing.emit(eventName, evtObj);
}

module.exports.InterApplicationBus = {
    publish,
    send,
    subscribe,
    emitSubscriberAdded,
    emitSubscriberRemoved,
    subscriberAdded,
    removeSubscriberAdded,
    subscriberRemoved,
    removeSubscriberRemoved,
    raiseSubscriberEvent
};
