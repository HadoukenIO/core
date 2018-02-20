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
import {rvmMessageBus, AppAssetsGetList} from '../rvm_message_bus';
import * as log from '../../log';
import * as  _ from 'underscore';

interface CallbackObj {
    successCB: (data: any) => any;
    failureCB: (data: any) => any;
}

interface PendingRequestObj {
    [key: string]: {
        [key: string] : Array<CallbackObj>
    };
}

/**
 * Module to handle fetching of app assets from RVM
 **/
class AppAssetsFetcher {
    private pendingRequests: PendingRequestObj = {};

    public fetchAppAsset (sourceUrl: string, assetAlias: string, successCB: (data: any) => any, failureCB: (data: any) => any) {

        if (!sourceUrl) {
            log.writeToLog(1, 'sourceUrl is required!', true);
        } else if (!assetAlias) {
            log.writeToLog(1, 'assetAlias is required!', true);
        } else if (!successCB) {
            log.writeToLog(1, 'successCB is required!', true);
        } else if (!failureCB) {
            log.writeToLog(1, 'failureCB is required!', true);
        } else {
            // Have all mandatory params

            const firstRequest = this.addPendingRequest(sourceUrl, assetAlias, successCB, failureCB);

            if (firstRequest) {// Ask RVM for this app's assets on 1st request, duplicates get recorded in pending object

                const msg: AppAssetsGetList = {
                    timeToLive: 7,
                    topic: 'app-assets',
                    type: 'get-list',
                    appConfig: sourceUrl
                };

                rvmMessageBus.publish(msg , this.responseHandler);
            }
        }

    }

    // Returns bool which indicates whether this is the 1st request for sourceUrl - then we actually need to send it to RVM
    private addPendingRequest = (sourceUrl: string, assetAlias: string, successCB: (data: any) => any, failureCB: (data: any) => any) => {
        const pendingCBObj = { successCB, failureCB };

        if (!(sourceUrl in this.pendingRequests)) {

            // 1st requester!

            this.pendingRequests[sourceUrl] = {};
            this.pendingRequests[sourceUrl][assetAlias] = [pendingCBObj];
            return true;
        } else {// duplicate request!

            this.pendingRequests[sourceUrl][assetAlias] = this.pendingRequests[sourceUrl][assetAlias] || [];
            this.pendingRequests[sourceUrl][assetAlias].push(pendingCBObj);
            return false;
        }
    }

    /**
     *  High level app assets response handler policy; 1st point of entry upon recepit of RVM Message bus response
     */
    private responseHandler = (dataObj: any) => {
        let sourceUrl;
        const timeToLiveExpired = _.has(dataObj, 'time-to-live-expiration');

        if (timeToLiveExpired) {
            sourceUrl = dataObj.envelope.payload.appConfig;
            log.writeToLog(1, `Time to live of ${dataObj['time-to-live-expiration']} seconds for app asset request for `
                           + `app config: ${sourceUrl} reached.`, true);

            dataObj.error = `Unable to determine app asset information for ${sourceUrl}`;
        } else {
            log.writeToLog(1, `AppAssetsFetcher received a response from RVM: ${dataObj}`, true);
            if (!this.isResponseValid(dataObj)) {
                return;
            }
            sourceUrl = dataObj.appConfig;
        }
        this.notifyObservers(sourceUrl, dataObj);

        if (_.isString(sourceUrl)) {
            delete this.pendingRequests[sourceUrl];
        }
    }

    /**
     *  Checks RVM app asset responses for mandatory message attributes
     */
    private isResponseValid  = (dataObj: any) => {
        const hasSourceUrl = _.has(dataObj, 'appConfig');
        const hasResult = _.has(dataObj, 'result');
        const hasError = _.has(dataObj, 'error');

        if (!hasSourceUrl || !(hasResult || hasError)) {
            log.writeToLog(1, 'Invalid request from the RVM, missing required fields.', true);
            return false;
        }

        const waitingForThisResponse = _.has(this.pendingRequests, dataObj.appConfig);
        if (!waitingForThisResponse) {
            log.writeToLog(1, `Received app assets response from RVM for ${dataObj.appConfig} but we have no pending requests`, true);
            return false;
        }
        return true;
    }

    /**
     *  Determines how to notify observers!(error or info)
     */
    private notifyObservers = (sourceUrl: string, dataObj: any) => {
        if (_.has(dataObj, 'error')) {
            this.handleErrorResponse(sourceUrl, dataObj);
        } else {
            this.handleInfoResponse(sourceUrl, dataObj);
        }
    }

    /**
     *  Notifies all observers of sourceUrl of error
     */
    private handleErrorResponse = (sourceUrl: string, dataObj: any) => {
        log.writeToLog(1, `Received error for ${sourceUrl}, Error: ${dataObj.error}`);
        _.each(this.pendingRequests[sourceUrl], (requestedAliasCallbackArray: any) => {
            _.invoke(requestedAliasCallbackArray, 'failureCB', dataObj.error);
        });
    }

    /**
     *  Notifies all observers of relevant alias info! (or lack thereof)
     */
    private handleInfoResponse = (sourceUrl: string, dataObj: any) => {
        _.mapObject(this.pendingRequests[sourceUrl], (requestedAliasCallbackArray: any, alias: string) => {
            const aliasInResponse = _.findWhere(dataObj.result, { alias });
            if (aliasInResponse) {
                _.invoke(requestedAliasCallbackArray, 'successCB', aliasInResponse);
            } else {
                _.invoke(requestedAliasCallbackArray, 'failureCB', 'Found no information on requested alias ' + alias);
            }
        });
    }
}

const appAssetsFetcher = new AppAssetsFetcher();

export  {appAssetsFetcher};
