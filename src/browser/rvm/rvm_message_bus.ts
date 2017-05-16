/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/
import {WMCopyData} from '../transport';
import {EventEmitter} from 'events';
import * as log from '../log';

// as to be require as we have added generateGUID, which is not on the ts definitions for app
// i.e. error TS2339: Property 'generateGUID' does not exist on type 'typeof app'.
const App = require('electron').app;
const  _ = require('underscore');

const processVersions = <any> process.versions;

interface RvmCallbacks {
    [key: string]: Function;
}

type applicationTopic = 'application';





type cleanupAction = 'cleanup';
type getListType = 'get-list';
type systemTopic = 'system';
type getRvmInfoAction = 'get-rvm-info';

interface rvmMsgBase {
    callback?: Function;
    timeToLive?: number;
    topic: string;
    action: string;
}

interface folderInfo {
    [key: string]: {
        name: string;
        deleteIfEmpty: boolean;
    }
}



type registerCustomDataAction = 'register-custom-data';
export interface registerCustomData extends rvmMsgBase {
    topic: applicationTopic;
    action: registerCustomDataAction;
    sourceUrl: string;
    runtimeVersion: string;
    data: any;
}

type hideSplashscreenAction = 'hide-splashscreen';
export interface hideSplashscreen extends rvmMsgBase {
    topic: applicationTopic;
    action: hideSplashscreenAction;
    sourceUrl: string;
}

type relaunchOnCloseAction = 'relaunch-on-close';
export interface relaunchOnClose extends rvmMsgBase {
    topic: applicationTopic;
    action: relaunchOnCloseAction;
    sourceUrl: string;
    runtimeVersion: string;
}

type getDesktopOwnerSettingsAction = 'get-desktop-owner-settings';
export interface getDesktopOwnerSettings extends rvmMsgBase {
    action: getDesktopOwnerSettingsAction;
    sourceUrl: string;

}

type appAssetsAction = 'app-assets';
export interface appAssets extends rvmMsgBase {
    action: appAssetsAction;
    type: getListType;
    appConfig: string
}


export interface cleanup extends rvmMsgBase {
    action: cleanupAction;
    folders: folderInfo;
}

export interface system extends rvmMsgBase {
    action: systemTopic;

    // todo rename this
    payloadAction: getRvmInfoAction;
}


type rvmMsg = registerCustomData
    | hideSplashscreen
    | relaunchOnClose
    | cleanup
    | getDesktopOwnerSettings
    | appAssets;

/**
 * Module to facilitate communication with the RVM.
 * A transport can be passed in to be used, otherwise a new WMCopyData transport is used.
 * 'broadcast' messages received from RVM(RVM initiated) will be broadcasted
 *
 **/
class RVMMessageBus extends EventEmitter  {
    private messageIdToCallback: RvmCallbacks; // Tracks functions that we'll notify If a response is received
    private transport: WMCopyData;

    constructor() {
        super();

        this.messageIdToCallback = <RvmCallbacks>{};
        this.transport = new WMCopyData('RvmMessageBus', 'OpenFinRVM_Messaging');

        this.transport.on('message', (hwnd: any, data: any) => {
            log.writeToLog(1, `RVMMessageBus: Received message from ${hwnd}`, true);
            log.writeToLog(1, `RVMMessageBus: ${data}`, true);

            let dataObj;

            try {
                dataObj = JSON.parse(data);

                if (_.has(dataObj, 'messageId')) {

                    const messageId = dataObj.messageId;
                    const isBroadcastMessage = dataObj.broadcast;
                    const weWereExpectingThisResponse = _.has(this.messageIdToCallback, messageId);

                    if (weWereExpectingThisResponse) {
                        this.messageIdToCallback[messageId](dataObj);
                        delete this.messageIdToCallback[messageId];
                    } else if (isBroadcastMessage) {
                        const topic = dataObj.topic;
                        const payload = dataObj.payload;
                        const action = dataObj.payload.action;

                        if (topic && payload && action) {
                            this.emit('rvm-message-bus/broadcast/' + topic + '/' + action, payload);
                        } else {
                            log.writeToLog(1, `RVMMessageBus received an invalid broadcast message: ${dataObj}`, true);
                        }
                    } else {
                        log.writeToLog(1, `messageId: ${messageId} has no one waiting for this response, nor was it a broadcast`
                                       + 'message, doing nothing.', true);
                    }
                } else {
                    log.writeToLog(1, 'messageId not found in response.', true);
                }
            } catch (e) {
                log.writeToLog(1, `data must be valid JSON; Error: ${e.message}`, true);
            }
        });
    }

    /**
     * me.send() - Sends a valid JSON message to the RVM, and allows sender to be notified of any responses
     * topic - Message topic
     * data - Valid JSON string or object; add in 'messageId' to override id used in main envelope
     * callback - Optional callback that is notified if a response is received. Called with response JSON object.
     * timeToLiveInSeconds - Mandatory w/callback, Callback will be called at expirating with obj containing 'time-to-live-expiration'
     *                       and 'envelope' at expiration
     *
     **/
    // TODO: the type of the data here is to be defined in RUN-2947
    public send(topic: string, data: any, callback: Function, timeToLiveInSeconds: number) {

        if (!this.areSendParametersValid(topic, data, callback, timeToLiveInSeconds)) {
            return false;
        }

        // Our data object that we will add a few fields to before adding to main envelope and sending
        const dataObj = <any> this.getSendDataObject(data);

        if (!dataObj) {
            return false;
        }

        // Used to correlate responses to sender callbacks
        const messageId = this.chooseMessageId(dataObj);

        // Add in our info
        dataObj.processId = process.pid;

        dataObj.runtimeVersion = <string> processVersions.openfin;  // eventually switch to App.getVersion()

        const envelope = {
            topic: topic,
            messageId: messageId,
            payload: dataObj
        };

        this.recordCallbackInfo(callback, timeToLiveInSeconds, envelope);

        return this.transport.publish(envelope);
    };

    public publish(msg: rvmMsg, callback: Function) {
        const {topic, timeToLive} = msg;

        const envelope = {
            topic: topic,
            messageId: App.generateGUID(),
            payload: Object.assign({
                processId: process.pid,
                runtimeVersion: processVersions['openfin']
            }, msg)
        };

        this.recordCallbackInfo(callback, timeToLive, envelope);

        return this.transport.publish(envelope);

    };

    /**
     * areSendParametersValid() - Validates params necessary to send() on rvm message bus
     *
     **/
    private areSendParametersValid (topic: string, data: any, callback: Function, timeToLiveInSeconds: number) {
        if (!topic) {
            log.writeToLog(1, 'topic is required' , true);
            return false;
        } else if (!data) {
            log.writeToLog(1, 'data is required!', true);
            return false;
        } else if (data && !(_.isString(data) || _.isObject(data))) {
            log.writeToLog(1, 'data must be a JSON string or an object', true);
            return false;
        } else if (callback) {
            if (!_.isFunction(callback)) {
                log.writeToLog(1, 'callback must be a function!', true);
                return false;
            } else if (!_.isNumber(timeToLiveInSeconds)) {
                log.writeToLog(1, 'You must specify a time to live when specifying a function!', true);
                return false;
            }
        }
        return true;
    };

    private getSendDataObject (data: any): object | undefined {
        let dataObj;

        if (_.isString(data)) {
            try {
                dataObj = JSON.parse(data);
            } catch (e) {
               log.writeToLog(1, `data must be valid JSON string; Error: ${e.message}`);
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
    // TODO: the type of the dataObj here is to be defined in RUN-2947
    private chooseMessageId  (dataObj: any) {
        let messageId;
        const userSpecifiedMessageId = dataObj.messageId;

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
     * recordCallbackInfo() - Records callback info based on messageId so we execute callback upon relevant RVM response.
     * Also sets up timetoLive if requested.
     *
     **/
    private recordCallbackInfo (callback: Function, timeToLiveInSeconds: number, envelope: any) {
        if (callback && _.has(envelope, 'messageId')) {
            const messageId = envelope.messageId;

            this.messageIdToCallback[messageId] = callback;

            // set up time to live if specified
            if (_.isNumber(timeToLiveInSeconds)) {
                const timeToLiveInMS = timeToLiveInSeconds * 1000; // convert
                setTimeout(function() {

                    if (_.has(this.messageIdToCallback, messageId)) {
                        this.messageIdToCallback[messageId]({
                            'time-to-live-expiration': timeToLiveInSeconds,
                            'envelope': envelope
                        });
                        delete this.messageIdToCallback[messageId];
                    }
                }, timeToLiveInMS);
            }
        }
    };
}

const rvmMessageBus = new RVMMessageBus();
export {rvmMessageBus};
