/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/
var RvmMessageBus = require('../rvm_message_bus.js');
var _ = require('underscore');

/**
 * Module to handle fetching of app assets from RVM
 *
 **/
var AppAssetsFetcher = function() {
    var me = this;
    var pendingRequests = {}; // pending fetch requests, key = sourceUrl, value = {alias1:[{successCB:func, failureCB:func}, {...}], alias2...}

    me.fetchAppAsset = function(sourceUrl, assetAlias, successCB, failureCB) {

        if (!sourceUrl) {
            console.log('sourceUrl is required!');
        } else if (!assetAlias) {
            console.log('assetAlias is required!');
        } else if (!successCB) {
            console.log('successCB is required!');
        } else if (!failureCB) {
            console.log('failureCB is required!');
        } else { // Have all mandatory params


            let firstRequest = addPendingRequest(sourceUrl, assetAlias, successCB, failureCB);
            if (firstRequest) // Ask RVM for this app's assets on 1st request, duplicates get recorded in pending object
            {
                let topic = 'app-assets';
                let data = {
                    type: 'get-list',
                    appConfig: sourceUrl
                };
                RvmMessageBus.send(topic, JSON.stringify(data), responseHandler, 7); // give up after 7 seconds
            }
        }

    };

    // Returns bool which indicates whether this is the 1st request for sourceUrl - then we actually need to send it to RVM
    var addPendingRequest = function(sourceUrl, assetAlias, successCB, failureCB) {
        var pendingCBObj = {
            successCB: successCB,
            failureCB: failureCB
        };

        if (!(sourceUrl in pendingRequests)) // 1st requester!
        {
            pendingRequests[sourceUrl] = {};
            pendingRequests[sourceUrl][assetAlias] = [pendingCBObj];
            return true;
        } else // duplicate request!
        {
            pendingRequests[sourceUrl][assetAlias] = pendingRequests[sourceUrl][assetAlias] || [];
            pendingRequests[sourceUrl][assetAlias].push(pendingCBObj);
            return false;
        }
    };

    /**
     *  High level app assets response handler policy; 1st point of entry upon recepit of RVM Message bus response
     *
     */
    var responseHandler = function(dataObj) {
        var sourceUrl;
        var timeToLiveExpired = _.has(dataObj, 'time-to-live-expiration');
        if (timeToLiveExpired) {
            sourceUrl = dataObj.envelope.payload.appConfig;
            console.log('Time to live of', dataObj['time-to-live-expiration'], 'seconds for app asset request for app config:', sourceUrl, 'reached.');
            dataObj.error = 'Unable to determine app asset information for ' + sourceUrl;
        } else {
            console.log('AppAssetsFetcher received a response from RVM:', dataObj);
            if (!isResponseValid(dataObj)) {
                return;
            }
            sourceUrl = dataObj.appConfig;
        }
        notifyObservers(sourceUrl, dataObj);

        if (_.isString(sourceUrl)) {
            delete pendingRequests[sourceUrl];
        }
    };

    /**
     *  Checks RVM app asset responses for mandatory message attributes
     *
     */
    var isResponseValid = function(dataObj) {
        var hasSourceUrl = _.has(dataObj, 'appConfig');
        var hasResult = _.has(dataObj, 'result');
        var hasError = _.has(dataObj, 'error');

        if (!hasSourceUrl || !(hasResult || hasError)) {
            console.log('Invalid request from the RVM, missing required fields.');
            return false;
        }

        var waitingForThisResponse = _.has(pendingRequests, dataObj.appConfig);
        if (!waitingForThisResponse) {
            console.log('Received app assets response from RVM for,', dataObj.appConfig, 'but we have no pending requests.');
            return false;
        }
        return true;
    };

    /**
     *  Determines how to notify observers!(error or info)
     *
     */
    var notifyObservers = function(sourceUrl, dataObj) {
        if (_.has(dataObj, 'error')) {
            handleErrorResponse(sourceUrl, dataObj);
        } else {
            handleInfoResponse(sourceUrl, dataObj);
        }
    };

    /**
     *  Notifies all observers of sourceUrl of error
     *
     */
    var handleErrorResponse = function(sourceUrl, dataObj) {
        console.log('Received error for,', sourceUrl, ', Error:', dataObj.error);
        _.each(pendingRequests[sourceUrl], function(requestedAliasCallbackArray) {
            _.invoke(requestedAliasCallbackArray, 'failureCB', dataObj.error);
        });
    };

    /**
     *  Notifies all observers of relevant alias info! (or lack thereof)
     *
     */
    var handleInfoResponse = function(sourceUrl, dataObj) {
        _.mapObject(pendingRequests[sourceUrl], function(requestedAliasCallbackArray, alias) {
            var aliasInResponse = _.findWhere(dataObj.result, {
                'alias': alias
            });
            if (aliasInResponse) {
                _.invoke(requestedAliasCallbackArray, 'successCB', aliasInResponse);
            } else {
                _.invoke(requestedAliasCallbackArray, 'failureCB', 'Found no information on requested alias ' + alias);
            }
        });
    };
};

module.exports = new AppAssetsFetcher();
