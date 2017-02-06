/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/
var util = require('util');
var Transport = require('../transport');
var App = require('electron').app;
var _ = require('underscore');
var EventEmitter = require('events').EventEmitter;

function MyEmitter() {
    EventEmitter.call(this);
}
util.inherits(MyEmitter, EventEmitter);

/**
 * Module to facilitate communication with the RVM.
 * A transport can be passed in to be used, otherwise a new WMCopyData transport is used.
 * 'broadcast' messages received from RVM(RVM initiated) will be broadcasted
 *
 **/
var RVMMessageBus = function(configuration) {
    var config = configuration || {};
    var me = this;
    me.eventEmitter = new MyEmitter();
    me.on = me.eventEmitter.on.bind(me.eventEmitter);

    var messageIdToCallback = {}; // Tracks functions that we'll notify If a response is received

    config.transport = config.transport || new Transport.WMCopyData('OpenFinRVM_Messaging');
    var transport_ = config.transport;

    transport_.on('message', function(hwnd, data) {
        console.log('RVMMessageBus: Received message from', hwnd);
        console.log('RVMMessageBus:', data);

        var dataObj;
        try {
            dataObj = JSON.parse(data);

            if (_.has(dataObj, 'messageId')) {

                var messageId = dataObj.messageId;
                var isBroadcastMessage = dataObj.broadcast;
                var weWereExpectingThisResponse = _.has(messageIdToCallback, messageId);

                if (weWereExpectingThisResponse) {
                    messageIdToCallback[messageId](dataObj);
                    delete messageIdToCallback[messageId];
                } else if (isBroadcastMessage) {
                    var topic = dataObj.topic;
                    var payload = dataObj.payload;
                    var action = dataObj.payload.action;

                    if (topic && payload && action) {
                        me.eventEmitter.emit('rvm-message-bus/broadcast/' + topic + '/' + action, payload);
                    } else {
                        console.log('RVMMessageBus received an invalid broadcast message:', dataObj);
                    }
                } else {
                    console.log('messageId:', messageId, 'has no one waiting for this response, nor was it a broadcast message, doing nothing.');
                }
            } else {
                console.log('messageId not found in response.');
            }
        } catch (e) {
            console.log('data must be valid JSON; Error:', e.message);
        }
    });

    /**
     * me.send() - Sends a valid JSON message to the RVM, and allows sender to be notified of any responses
     * topic - Message topic
     * data - Valid JSON string or object; add in 'messageId' to override id used in main envelope
     * callback - Optional callback that is notified if a response is received. Called with response JSON object.
     * timeToLiveInSeconds - Mandatory w/callback, Callback will be called at expirating with obj containing 'time-to-live-expiration' and 'envelope' at expiration
     *
     **/
    me.send = function(topic, data, callback, timeToLiveInSeconds) {

        if (!areSendParametersValid(topic, data, callback, timeToLiveInSeconds)) {
            return false;
        }

        // Our data object that we will add a few fields to before adding to main envelope and sending
        var dataObj = getSendDataObject(data);
        if (!dataObj) {
            return false;
        }

        // Used to correlate responses to sender callbacks
        var messageId = chooseMessageId(dataObj);

        // Add in our info
        dataObj.processId = process.pid;
        dataObj.runtimeVersion = process.versions['openfin']; // eventually switch to App.getVersion()

        var envelope = {
            topic: topic,
            messageId: messageId,
            payload: dataObj
        };

        recordCallbackInfo(callback, timeToLiveInSeconds, envelope);

        return transport_.publish(envelope, 2000);
    };

    me.closeTransport = function() {
        if (config.transport._win) {
            config.transport._win.close();
        }
    };

    // Various Send() helper methods below
    /**
     * areSendParametersValid() - Validates params necessary to send() on rvm message bus
     *
     **/
    var areSendParametersValid = function(topic, data, callback, timeToLiveInSeconds) {
        if (!topic) {
            console.log('topic is required!');
            return false;
        } else if (!data) {
            console.log('data is required!');
            return false;
        } else if (data && !(_.isString(data) || _.isObject(data))) {
            console.log('data must be a JSON string or an object');
            return false;
        } else if (callback) {
            if (!_.isFunction(callback)) {
                console.log('callback must be a function!');
                return false;
            } else if (!_.isNumber(timeToLiveInSeconds)) {
                console.log('You must specify a time to live when specifying a function!');
                return false;
            }
        }
        return true;
    };

    var getSendDataObject = function(data) {
        var dataObj;
        if (_.isString(data)) {
            try {
                dataObj = JSON.parse(data);
            } catch (e) {
                console.log('data must be valid JSON string; Error:', e.message);
            }
        } else if (_.isObject(data)) {
            dataObj = data;
        }
        return dataObj;
    };

    /**
     * chooseMessageId() - Generates new message id guid or uses one specified by dataObj
     *
     **/
    var chooseMessageId = function(dataObj) {
        var messageId;
        var userSpecifiedMessageId = dataObj.messageId;
        if (userSpecifiedMessageId) {
            if (_.isNumber(userSpecifiedMessageId)) {
                messageId = userSpecifiedMessageId.toString();
            } else if (_.isString(userSpecifiedMessageId)) {
                messageId = userSpecifiedMessageId;
            }
        }
        if (!messageId) {
            messageId = App.generateGUID();
        }
        return messageId;
    };

    /**
     * recordCallbackInfo() - Records callback info based on messageId so we execute callback upon relevant RVM response. Also sets up timetoLive if requested.
     *
     **/
    var recordCallbackInfo = function(callback, timeToLiveInSeconds, envelope) {
        if (callback && _.has(envelope, 'messageId')) {
            var messageId = envelope.messageId;
            messageIdToCallback[messageId] = callback;

            // set up time to live if specified
            if (_.isNumber(timeToLiveInSeconds)) {
                var timeToLiveInMS = timeToLiveInSeconds * 1000; // convert
                setTimeout(function() {
                    if (_.has(messageIdToCallback, messageId)) {
                        messageIdToCallback[messageId]({
                            'time-to-live-expiration': timeToLiveInSeconds,
                            'envelope': envelope
                        });
                        delete messageIdToCallback[messageId];
                    }
                }, timeToLiveInMS);
            }
        }
    };
};

module.exports = new RVMMessageBus();
