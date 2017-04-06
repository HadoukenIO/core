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
let subScriptionManager = new require('../subscription_manager.js').SubscriptionManager();

let callbacks = {};

const NO_SUBS_ERR_STR = 'No subscriptions match';

const ANY_UUID = '*';
const ANY_NAME = '*';

const SUBSCRIBER_ADDED_EVENT = 'subscriber-added';
const SUBSCRIBER_REMOVED_EVENT = 'subscriber-removed';

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
busEventing.on(SUBSCRIBER_ADDED_EVENT, subInfo => {
    const subscriptionInfo = JSON.parse(JSON.stringify(subInfo));

    subscriptionInfo.topic = decodeURIComponent(subscriptionInfo.topic);
    busEventing.emit(generateKey([SUBSCRIBER_ADDED_EVENT], [subInfo.senderUuid, subInfo.senderName]), subscriptionInfo);
});

busEventing.on(SUBSCRIBER_REMOVED_EVENT, subInfo => {
    const subscriptionInfo = JSON.parse(JSON.stringify(subInfo));

    subscriptionInfo.topic = decodeURIComponent(subscriptionInfo.topic);
    busEventing.emit(generateKey([SUBSCRIBER_REMOVED_EVENT], [subInfo.senderUuid, subInfo.senderName]), subscriptionInfo);
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

    dispatchToSubscriptions(topic, identity, null, null, payloadToDeliver);
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

function dispatchToSubscriptions(topic, identity, destUuid, destName, payload) {
    const keys = generateSendKeys(topic, identity, {
        uuid: destUuid || ANY_UUID,
        name: destName || ANY_NAME
    });

    return ofBus.emit(keys.fromAny, payload) ||
        ofBus.emit(keys.fromApp, payload) ||
        ofBus.emit(keys.fromWin, payload);
}


function subscribe(identity, payload, listener) {
    let topic = payload.topic;
    let senderUuid = payload.sourceUuid || ANY_UUID;
    let senderName = payload.sourceWindowName || ANY_NAME;

    let cbId = genCallBackId();
    let eventingPayload = {
        senderUuid: senderUuid,
        senderName: senderUuid,
        uuid: identity.uuid,
        name: identity.name,
        topic: topic,
        directMsg: payload.sourceWindowName !== ANY_NAME ? payload.sourceWindowName : false
    };

    callbacks['' + cbId] = listener;

    let keys = generateSubscribeKeys(topic, {
        uuid: senderUuid,
        name: senderName
    }, identity);

    ofBus.on(keys.toAny, listener);
    ofBus.on(keys.toWin, listener);
    ofBus.on(keys.toApp, listener);

    // for the subscribe listeners:
    busEventing.emit(SUBSCRIBER_ADDED_EVENT, eventingPayload);

    //return a function that will unhook the listeners
    var unsubItem = {
        cbId,
        unsubscribe: () => {
            ofBus.removeListener(keys.toAny, listener);
            ofBus.removeListener(keys.toWin, listener);
            ofBus.removeListener(keys.toApp, listener);

            busEventing.emit(SUBSCRIBER_REMOVED_EVENT, eventingPayload);
        }
    };
    subScriptionManager.registerSubscription(unsubItem.unsubscribe, identity, payload);

    return unsubItem;
}


function unsubscribe(identity, cbId, senderUuid, ...rest) {
    let {
        uuid,
        name
    } = identity;

    let senderName = typeof rest[1] === 'function' ? ANY_NAME : rest[0] || ANY_NAME;
    let topic = typeof rest[1] === 'function' ? rest[0] : rest[1];

    let callback = callbacks['' + cbId];

    if (!callback) {
        return;
    }

    let keys = generateSubscribeKeys(topic, {
        uuid: senderUuid,
        name: senderName
    }, identity);

    ofBus.removeListener(keys.toAny, callback);
    ofBus.removeListener(keys.toWin, callback);
    ofBus.removeListener(keys.toApp, callback);

    delete callbacks['' + cbId];

    busEventing.emit(SUBSCRIBER_REMOVED_EVENT, {
        senderUuid: senderUuid,
        senderName: senderUuid,
        uuid: uuid,
        name: name,
        topic: topic
    });
}


function subscriberAdded(identity, listener) {
    let {
        uuid,
        name
    } = identity;
    let cbId = genCallBackId();

    let listenerStrs = generateListenerKeys(SUBSCRIBER_ADDED_EVENT, uuid, name);
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

    subScriptionManager.registerSubscription(unsubItem.unsubscribe,
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

    let listenerStrs = generateListenerKeys(SUBSCRIBER_ADDED_EVENT, uuid, name);

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

    let listenerStrs = generateListenerKeys(SUBSCRIBER_REMOVED_EVENT, uuid, name);
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

    subScriptionManager.registerSubscription(unsubItem.unsubscribe, identity, subMgrStr);

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

    let listenerStrs = generateListenerKeys(SUBSCRIBER_REMOVED_EVENT, uuid, name);

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
    unsubscribe,
    subscriberAdded,
    removeSubscriberAdded,
    subscriberRemoved,
    removeSubscriberRemoved,
    raiseSubscriberEvent
};
