/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/
import {WMCopyData} from '../transport';
import {EventEmitter} from 'events';
import * as log from '../log';
import route from '../../common/route';

// as to be require as we have added generateGUID, which is not on the ts definitions for app
// i.e. error TS2339: Property 'generateGUID' does not exist on type 'typeof app'.
const App = require('electron').app;
const  _ = require('underscore');

const processVersions = <any> process.versions;

interface RvmCallbacks {
    [key: string]: Function;
}

export interface RvmMsgBase {
    timeToLive?: number;
    topic: string;
}

// topic: application -----
type applicationTopic = 'application';
type registerCustomDataAction = 'register-custom-data';
type hideSplashscreenAction = 'hide-splashscreen';
type relaunchOnCloseAction = 'relaunch-on-close';
type getDesktopOwnerSettingsAction = 'get-desktop-owner-settings';

export interface RegisterCustomData extends RvmMsgBase {
    topic: applicationTopic;
    action: registerCustomDataAction;
    sourceUrl: string;
    runtimeVersion: string;
    data: any;
}

export interface HideSplashscreen extends RvmMsgBase {
    topic: applicationTopic;
    action: hideSplashscreenAction;
    sourceUrl: string;
}

export interface RelaunchOnClose extends RvmMsgBase {
    topic: applicationTopic;
    action: relaunchOnCloseAction;
    sourceUrl: string;
    runtimeVersion: string;
}

export interface GetDesktopOwnerSettings extends RvmMsgBase {
    topic: applicationTopic;
    action: getDesktopOwnerSettingsAction;
    sourceUrl: string;
}

// topic: application (used only by the utils module)
type getShortcutStateAction = 'get-shortcut-state';
type setShortcutStateAction = 'set-shortcut-state';
type launchedFromAction = 'launched-from';
type launchAppAction = 'launch-app';

export interface LaunchApp extends RvmMsgBase {
    topic: applicationTopic;
    action: launchAppAction;
    sourceUrl: string;
    data: {
        [key: string]: string;
    };
}

export interface GetShortcutState extends RvmMsgBase {
    topic: applicationTopic;
    action: getShortcutStateAction;
    sourceUrl: string;
}

export interface SetShortcutState extends RvmMsgBase {
    topic: applicationTopic;
    action: setShortcutStateAction;
    sourceUrl: string;
    data: any;
}

export interface LaunchedFrom extends RvmMsgBase {
    topic: applicationTopic;
    action: launchedFromAction;
    sourceUrl: string;
}

// topic: app-assets -----
type appAssetsTopic = 'app-assets';
type getListType = 'get-list';
type downloadAssetType =  'download-asset';

export interface AppAssetsGetList extends RvmMsgBase {
    topic: appAssetsTopic;
    type: getListType;
    appConfig: string;
    timeToLive: number;
}

export interface AppAssetsDownloadAsset extends RvmMsgBase {
    topic: appAssetsTopic;
    type: downloadAssetType;
    appConfig: string;
    showRvmProgressDialog: boolean;
    asset: any;
    downloadId: string;
}

// topic: cleanup -----
type cleanupTopic = 'cleanup';

interface FolderInfo {
    [key: string]: {
        name: string;
        deleteIfEmpty: boolean;
    };
}

export interface Cleanup extends RvmMsgBase {
    topic: cleanupTopic;
    folders: FolderInfo;
}

// topic: system -----
type systemTopic = 'system';
type getRvmInfoAction = 'get-rvm-info';

export interface System extends RvmMsgBase {
    topic: systemTopic;
    action: getRvmInfoAction;
    sourceUrl: string;
}

// topic: application-events -----
type EventType = 'started'| 'closed' | 'ready' | 'run-requested' | 'crashed' | 'error' | 'not-responding' | 'out-of-memory';
type ApplicationEventTopic = 'application-event';
export interface ApplicationEvent extends RvmMsgBase {
    topic: ApplicationEventTopic;
    type: EventType;
    sourceUrl: string;
}

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
                            this.emit(route.rvmMessageBus('broadcast', topic, action), payload);
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

    public publish(msg: RvmMsgBase, callback: Function) {
        const {topic, timeToLive} = msg;
        const payload: any = Object.assign({
            processId: process.pid,
            runtimeVersion: processVersions.openfin
        }, msg);

        delete payload.topic; // ensure original payload that lacked the topic

        const envelope = {
            topic: topic,
            messageId: App.generateGUID(),
            payload
        };

        this.recordCallbackInfo(callback, timeToLive, envelope);

        return this.transport.publish(envelope);

    }

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
