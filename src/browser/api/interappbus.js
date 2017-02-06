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

    `${topic}/${senderUuid}/${senderName}#${destinationUuid}/${destinationName}`
 */

let util = require('util');
let EventEmitter = require('events').EventEmitter;
let callbacks = {};
let subScriptionManager = new require('../subscription_manager.js').SubscriptionManager();

const NO_SUBS_ERR_STR = 'No subscriptions match';

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
busEventing.on('subscriber-added', subInfo => {
    const subscriptionInfo = JSON.parse(JSON.stringify(subInfo));

    subscriptionInfo.topic = decodeURIComponent(subscriptionInfo.topic);
    busEventing.emit(`subscriber-added/${subInfo.senderUuid}/${subInfo.senderName}`, subscriptionInfo);
});

busEventing.on('subscriber-removed', subInfo => {
    const subscriptionInfo = JSON.parse(JSON.stringify(subInfo));

    subscriptionInfo.topic = decodeURIComponent(subscriptionInfo.topic);
    busEventing.emit(`subscriber-removed/${subInfo.senderUuid}/${subInfo.senderName}`, subscriptionInfo);
});


function genCallBackId() {
    return ++callbackId;
}


function publish(identity, payloadFromAdapter) {

    let {
        topic: rawTopic
    } = payloadFromAdapter;

    let topic = encodeURIComponent(rawTopic);

    let pubString = `${topic}/${identity.uuid}/${identity.name}`;
    let uuidNs = `${topic}/${identity.uuid}` + '/*';
    let generalNs = topic + '/*/*';
    let payload = Object.assign({
        identity
    }, payloadFromAdapter);

    // emit the fully qualified 'topic/uuid/name'
    ofBus.emit(pubString, payload);

    //emit to the uuid namespace 'topic/uuid/*'
    ofBus.emit(uuidNs, payload);

    //emit to the general case 'topic/*/*'
    ofBus.emit(generalNs, payload);
}


function sendToName(identity, topic, destUuid, _destName, payload) {
    const {
        uuid,
        name
    } = identity;
    const destName = _destName || '*';
    const fullyQualified = `${topic}/${uuid}/${name}#${destUuid}/${destName}`;
    const general = `${topic}/*/*#${destUuid}/${destName}`;
    const parentToChild = `${topic}/${uuid}/*#${destUuid}/${destName}`;

    if (ofBus.listeners(general).length) {
        ofBus.emit(general, payload);
    } else if (ofBus.listeners(parentToChild).length) {
        ofBus.emit(parentToChild, payload);
    } else if (ofBus.listeners(fullyQualified).length) {
        ofBus.emit(fullyQualified, payload);
    } else {
        throw new Error(NO_SUBS_ERR_STR);
    }
}


function sendToApp(identity, topic, destUuid, payload) {
    const {
        uuid,
        name
    } = identity;
    const childWinToParent = `${topic}/${uuid}/${name}#${destUuid}/*`;
    const parentToParent = `${topic}/${uuid}/*#${destUuid}/*`;
    const anyoneToParent = `${topic}/*/*#${destUuid}/*`;

    if (ofBus.listeners(anyoneToParent).length) {
        ofBus.emit(anyoneToParent, payload);
    } else if (ofBus.listeners(parentToParent).length) {
        ofBus.emit(parentToParent, payload);
    } else if (ofBus.listeners(childWinToParent).length) {
        ofBus.emit(childWinToParent, payload);
    } else {
        throw new Error(NO_SUBS_ERR_STR);
    }

}

function send(identity, payloadFromAdapter) {
    let {
        payload,
        payload: {
            destinationUuid,
            topic,
            destinationWindowName
        }
    } = payloadFromAdapter;
    let payloadToDeliver = Object.assign({
        identity
    }, payload);
    let winNameSpecified = destinationWindowName;

    if (winNameSpecified) {
        sendToName(identity, topic, destinationUuid, destinationWindowName, payloadToDeliver);

    } else {
        sendToApp(identity, topic, destinationUuid, payloadToDeliver);
    }
}

function subscribe(identity, payload, listener) {

    let topic = encodeURIComponent(payload.topic);
    let senderUuid = encodeURIComponent(payload.sourceUuid) || '*';
    let senderName = encodeURIComponent(payload.sourceWindowName || '*');
    let onString = `${topic}/${senderUuid}/${senderName}`;
    let cbId = genCallBackId();
    let eventingPayload = {
        senderUuid: senderUuid,
        senderName: senderUuid,
        uuid: identity.uuid,
        name: identity.name,
        topic: topic,
        directMsg: payload.sourceWindowName !== '*' ? payload.sourceWindowName : false
    };

    callbacks['' + cbId] = listener;

    ofBus.on(onString, listener);

    // this handles the send case where the sender will send to an app or an app/name combo
    ofBus.on(onString + '#' + identity.uuid + '/' + identity.name, listener);
    ofBus.on(onString + '#' + identity.uuid + '/*', listener);

    // for the subscribe listeners:
    busEventing.emit('subscriber-added', eventingPayload);

    //return a function that will unhook the listeners
    var unsubItem = {
        cbId,
        unsubscribe: () => {
            ofBus.removeListener(onString, listener);
            ofBus.removeListener(onString + '#' + identity.uuid + '/' + identity.name, listener);
            ofBus.removeListener(onString + '#' + identity.uuid + '/*', listener);

            busEventing.emit(`subscriber-removed`, eventingPayload);
        }
    };
    subScriptionManager.registerSubscription(unsubItem.unsubscribe, identity, payload);

    return unsubItem;
}


function unsubscribe(identity, cbId, rawSenderUuid, ...rest) {
    let {
        uuid,
        name
    } = identity;
    let rawSenderName = typeof rest[1] === 'function' ? '*' : rest[0] || '*';
    let rawTopic = typeof rest[1] === 'function' ? rest[0] : rest[1];
    let senderName = encodeURIComponent(rawSenderName);
    let senderUuid = encodeURIComponent(rawSenderUuid) || '*';
    let topic = encodeURIComponent(rawTopic);
    let onString = `${topic}/${senderUuid}/${senderName}`;
    let callback = callbacks['' + cbId];

    if (!callback) {
        return;
    }

    ofBus.removeListener(onString, callback);
    ofBus.removeListener(onString + '#' + uuid + '/' + name, callback);
    ofBus.removeListener(onString + '#' + uuid + '/*', callback);

    delete callbacks['' + cbId];

    busEventing.emit(`subscriber-removed`, {
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
    let subMgrStr = `subscriber-added/${identity.uuid}/${identity.name}`;
    let listenerStrs = genListenerStrs('subscriber-added', uuid, name);
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
    let listenerStrs;

    if (!callback) {
        return;
    }

    listenerStrs = genListenerStrs('subscriber-added', uuid, name);

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
    let listenerStrs = genListenerStrs('subscriber-removed', uuid, name);
    let subMgrStr = `subscriber-removed/${uuid}/${name}`;
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
    let listenerStrs;

    if (!callback) {
        return;
    }

    listenerStrs = genListenerStrs('subscriber-removed', uuid, name);

    listenerStrs.forEach(listenerStr => {
        busEventing.removeListener(listenerStr, callback);
    });

    delete callbacks['' + cbId];
}


function genListenerStrs(topic, uuid, name) {
    return [
        `${topic}/${uuid}/${name}`,
        `${topic}/${uuid}` + '/*',
        `${topic}` + '/*/*',
    ];
}


module.exports.InterApplicationBus = {
    publish,
    send,
    subscribe,
    unsubscribe,
    subscriberAdded,
    removeSubscriberAdded,
    subscriberRemoved,
    removeSubscriberRemoved
};
