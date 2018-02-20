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
let RvmMessageBus = require('../rvm_message_bus').rvmMessageBus;
let _ = require('underscore');
const moduleTopic_ = 'system';
const moduleAction_ = 'get-rvm-info';
const moduleTimeToLive_ = 5;

// Validation helper functions
/**
 *  Confirms arguments passed to fetchRvmInfo are as we expect
 */
let validateFetchArguments = function(sourceUrl, successCB, failureCB) {
    if (typeof sourceUrl !== 'string') {
        console.log('sourceUrl is required!');
        return false;
    } else if (!successCB) {
        console.log('successCB is required!');
        return false;
    } else if (!failureCB) {
        console.log('failureCB is required!');
        return false;
    } else if (!_.isFunction(successCB)) {
        console.log('successCB must be a function!');
        return false;
    } else if (!_.isFunction(failureCB)) {
        console.log('failureCB must be a function!');
        return false;
    }
    return true;
};

/**
 *  Checks get-rvm-info response for mandatory message attributes
 *
 */
let isResponseValid = function(dataObj) {
    let hasAllFields = dataObj && dataObj.topic && dataObj.payload && dataObj.payload.action;

    if (!hasAllFields) {
        console.log('Invalid request from the RVM, missing required fields.');
        return false;
    }

    let topic = dataObj.topic;
    let payload = dataObj.payload;
    let action = payload.action;
    let fieldsAsExpected = (topic === moduleTopic_) && (action === moduleAction_);

    if (!fieldsAsExpected) {
        console.log('Invalid request from the RVM, the fields did not containg the correct information.');
        return false;
    }

    return true;
};

/**
 * Module to handle fetching of 'get-rvm-info' from RVM
 * 		The info that is fetched is identical for all requesters, so there should only ever be one
 * 		outstanding request to the RVM that we are waiting for a response from. Duplicate requests while
 * 		awaiting an RVM response will be queued and all parties notified upon receipt of RVM response.
 *
 *		RVM version and RVM start time are what is returned from RVM for 'get-rvm-info'
 *
 **/
let RvmInfoFetcher = function() {
    let me = this;
    let pendingRequests_ = []; // pending fetch requests CB objs waiting to be notified

    /**
     *  get-rvm-info failure case handler, Looks for expired time to live and bad responses. Notifies pending requests of failures found.
     *      returns bool indicating whether a failure case was handled
     *
     */
    let handleFailureCases = function(dataObj) {
        let isFailure = false;
        let timeToLiveExpired = _.has(dataObj, 'time-to-live-expiration');

        if (timeToLiveExpired) {
            console.log('Time to live of', dataObj['time-to-live-expiration'], 'seconds for rvm info reached.');
            dataObj.error = 'Unable to determine rvm information in a reasonable amount of time.';
            isFailure = true;
        } else if (!isResponseValid(dataObj)) {
            console.log('Received an invalid response from RVM.');
            dataObj.error = 'Unable to determine rvm information at this time.';
            isFailure = true;
        }

        if (isFailure) {
            pendingRequests_.forEach(request => {
                request.failureCB(dataObj.error);
            });
        }
        return isFailure;
    };

    /**
     *  High level get-rvm-info response handler policy; First point of entry on RVM response.
     *          Notifies all parties waiting for the information and clears pendingRequests_
     *
     */
    let responseHandler = function(dataObj) {
        let failureHandled = handleFailureCases(dataObj);

        if (!failureHandled) {
            console.log('RvmInfoFetcher received a response from RVM:', dataObj);
            pendingRequests_.forEach(request => {
                request.successCB(dataObj.payload);
            });
        }

        pendingRequests_.splice(0, pendingRequests_.length); // clear pending requests
    };


    /**
     *  Public facing method to initiate a get-rvm-info message or queue up the request to be notified when we get a response
     */
    me.fetch = function(sourceUrl, successCB, failureCB) {
        let areArgumentsValid = validateFetchArguments(sourceUrl, successCB, failureCB);
        let isFirstRequester = _.isEmpty(pendingRequests_); // 1st requesters initiate outbound request to RVM

        if (!areArgumentsValid) {
            failureCB(new Error('Invalid arguments'));
            return;
        }

        pendingRequests_.push({
            successCB: successCB,
            failureCB: failureCB
        });

        if (isFirstRequester) {

            let rvmPayload = {
                topic: moduleTopic_,
                action: moduleAction_,
                timeToLive: moduleTimeToLive_,
                sourceUrl
            };

            if (RvmMessageBus) {
                RvmMessageBus.publish(rvmPayload, responseHandler);
            }
        }
    };
};

module.exports = new RvmInfoFetcher();
