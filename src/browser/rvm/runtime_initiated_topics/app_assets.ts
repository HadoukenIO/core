/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/
import {rvmMessageBus, appAssetsGetList} from '../rvm_message_bus';
var _ = require('underscore');

interface callbackObj {
    successCB: Function;
    failureCB: Function;
}

interface pendingRequestsObj {
    [key: string]: {
        [key: string] : Array<callbackObj>
    }
}

/**
 * Module to handle fetching of app assets from RVM
 *
 **/
class AppAssetsFetcher {
    private pendingRequests: pendingRequestsObj = {}; // pending fetch requests, key = sourceUrl, value = {alias1:[{successCB:func, failureCB:func}, {...}], alias2...}

    public fetchAppAsset (sourceUrl: string, assetAlias: string, successCB: Function, failureCB: Function) {

        if (!sourceUrl) {
            console.log('sourceUrl is required!');
        } else if (!assetAlias) {
            console.log('assetAlias is required!');
        } else if (!successCB) {
            console.log('successCB is required!');
        } else if (!failureCB) {
            console.log('failureCB is required!');
        } else { // Have all mandatory params


            let firstRequest = this.addPendingRequest(sourceUrl, assetAlias, successCB, failureCB);
            if (firstRequest) // Ask RVM for this app's assets on 1st request, duplicates get recorded in pending object
            {
                let topic = 'app-assets';
                let data = {
                    type: 'get-list',
                    appConfig: sourceUrl
                };

                const msg: appAssetsGetList = {
                    timeToLive: 7,
                    topic: 'app-assets',
                    type: 'get-list',
                    appConfig: sourceUrl
                };

                rvmMessageBus.publish(msg , this.responseHandler);
            }
        }

    };

    // Returns bool which indicates whether this is the 1st request for sourceUrl - then we actually need to send it to RVM
    private addPendingRequest = function(sourceUrl: string, assetAlias: string, successCB: Function, failureCB: Function) {
        var pendingCBObj = {
            successCB: successCB,
            failureCB: failureCB
        };

        if (!(sourceUrl in this.pendingRequests)) // 1st requester!
        {
            this.pendingRequests[sourceUrl] = {};
            this.pendingRequests[sourceUrl][assetAlias] = [pendingCBObj];
            return true;
        } else // duplicate request!
        {
            this.pendingRequests[sourceUrl][assetAlias] = this.pendingRequests[sourceUrl][assetAlias] || [];
            this.pendingRequests[sourceUrl][assetAlias].push(pendingCBObj);
            return false;
        }
    };

    /**
     *  High level app assets response handler policy; 1st point of entry upon recepit of RVM Message bus response
     *
     */
    private responseHandler = function(dataObj: any) {
        var sourceUrl;
        var timeToLiveExpired = _.has(dataObj, 'time-to-live-expiration');
        if (timeToLiveExpired) {
            sourceUrl = dataObj.envelope.payload.appConfig;
            console.log('Time to live of', dataObj['time-to-live-expiration'], 'seconds for app asset request for app config:', sourceUrl, 'reached.');
            dataObj.error = 'Unable to determine app asset information for ' + sourceUrl;
        } else {
            console.log('AppAssetsFetcher received a response from RVM:', dataObj);
            if (!this.isResponseValid(dataObj)) {
                return;
            }
            sourceUrl = dataObj.appConfig;
        }
        this.notifyObservers(sourceUrl, dataObj);

        if (_.isString(sourceUrl)) {
            delete this.pendingRequests[sourceUrl];
        }
    };

    /**
     *  Checks RVM app asset responses for mandatory message attributes
     *
     */
    private isResponseValid = function(dataObj: any) {
        var hasSourceUrl = _.has(dataObj, 'appConfig');
        var hasResult = _.has(dataObj, 'result');
        var hasError = _.has(dataObj, 'error');

        if (!hasSourceUrl || !(hasResult || hasError)) {
            console.log('Invalid request from the RVM, missing required fields.');
            return false;
        }

        var waitingForThisResponse = _.has(this.pendingRequests, dataObj.appConfig);
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
    private notifyObservers = function(sourceUrl: string, dataObj: any) {
        if (_.has(dataObj, 'error')) {
            this.handleErrorResponse(sourceUrl, dataObj);
        } else {
            this.handleInfoResponse(sourceUrl, dataObj);
        }
    };

    /**
     *  Notifies all observers of sourceUrl of error
     *
     */
    private handleErrorResponse = function(sourceUrl: string, dataObj: any) {
        console.log('Received error for,', sourceUrl, ', Error:', dataObj.error);
        _.each(this.pendingRequests[sourceUrl], function(requestedAliasCallbackArray: any) {
            _.invoke(requestedAliasCallbackArray, 'failureCB', dataObj.error);
        });
    };

    /**
     *  Notifies all observers of relevant alias info! (or lack thereof)
     *
     */
    private handleInfoResponse = function(sourceUrl: string, dataObj: any) {
        _.mapObject(this.pendingRequests[sourceUrl], function(requestedAliasCallbackArray: any, alias: string) {
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

export const appAssetsFetcher = new AppAssetsFetcher();

