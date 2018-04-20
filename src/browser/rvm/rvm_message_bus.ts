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
import { WMCopyData } from '../transport';
import { EventEmitter } from 'events';
import * as log from '../log';
import route from '../../common/route';
import { Plugin } from '../../shapes';

import { app } from 'electron';
const _ = require('underscore');

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
type applicationLogAction = 'application-log';
type registerUserAction = 'register-user';
type hideSplashscreenAction = 'hide-splashscreen';
type relaunchOnCloseAction = 'relaunch-on-close';
type getDesktopOwnerSettingsAction = 'get-desktop-owner-settings';
type downloadRuntimeAction = 'runtime-download';

export interface ApplicationLog extends RvmMsgBase {
    topic: applicationTopic;
    action: applicationLogAction;
    sourceUrl: string;
    runtimeVersion: string;
    payload: {
        messages: ConsoleMessage[];
    };
}

export interface ConsoleMessage {
    appConfigUrl: string;
    level: number;
    message: string;
    timeStamp: string;
}

export interface RegisterUser extends RvmMsgBase {
    topic: applicationTopic;
    action: registerUserAction;
    sourceUrl: string;
    runtimeVersion: string;
    payload: {
        userName: string;
        appName: string;
    };
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
    isGlobal?: boolean;
}

export interface DownloadRuntimeOptions {
    downloadId: string;
    version: string;
    sourceUrl: string;
}

interface DownloadRuntimeMsg extends RvmMsgBase {
    downloadId: string;
    version: string;
    sourceUrl: string;
    action: downloadRuntimeAction;

}

// topic: application (used only by the utils module)
type getShortcutStateAction = 'get-shortcut-state';
type setShortcutStateAction = 'set-shortcut-state';
type launchedFromAction = 'launched-from';
type launchAppAction = 'launch-app';
type pluginQueryAction = 'query-plugin';

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

export interface PluginQuery extends RvmMsgBase {
    topic: applicationTopic;
    action: pluginQueryAction;
    name: string;
    version: string;
    optional?: boolean;
    sourceUrl: string;
}

export interface PluginQueryResponse extends RvmMsgBase {
    payload: any;
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
type EventType = 'started'| 'closed' | 'ready' | 'run-requested' | 'crashed' | 'error' | 'not-responding';
type ApplicationEventTopic = 'application-event';
export interface ApplicationEvent extends RvmMsgBase {
    topic: ApplicationEventTopic;
    type: EventType;
    sourceUrl: string;
}

export interface LicenseInfo {
    data: {
        licenseKey?: string;
        client?: {
            type: 'dotnet' | 'java' | 'air' | 'node' | 'js';
            version: string;
        };
        pid?: number;
        parentApp?: {
            sourceUrl: string;
        };
        uuid?: string;
    };
}

/**
 * Module to facilitate communication with the RVM.
 * A transport can be passed in to be used, otherwise a new WMCopyData transport is used.
 * 'broadcast' messages received from RVM(RVM initiated) will be broadcasted
 *
 **/
export class RVMMessageBus extends EventEmitter  {
    private messageIdToCallback: RvmCallbacks; // Tracks functions that we'll notify If a response is received
    private transport: WMCopyData;
    public static sessionId = app.generateGUID();
    public static readonly events: {
        STARTED: 'started',
        CLOSED: 'closed',
        READY: 'ready',
        RUN_REQUESTED: 'run-requested',
        CRASHED: 'crashed',
        ERROR: 'error',
        NOT_RESPONDING: 'not-responding'
    };

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

    public publish = (msg: RvmMsgBase, callback: (x: any) => any = ()  => undefined): boolean => {

        if (!msg || typeof msg !== 'object') {
            log.writeToLog('ERROR', 'Argument must be an object');

            return false;
        }

        const {topic, timeToLive} = msg;
        const payload: any = Object.assign({
            processId: process.pid,
            runtimeVersion: processVersions.openfin
        }, msg);

        delete payload.topic; // ensure original payload that lacked the topic

        const envelope = {
            topic: topic,
            messageId: app.generateGUID(),
            payload
        };

        this.recordCallbackInfo(callback, timeToLive, envelope);

        log.writeToLog(1, envelope, true);

        return this.transport.publish(envelope);
    }

    public registerLicenseInfo = (licInfo: LicenseInfo, sourceUrl: string = null): boolean => {
        const payload = Object.assign({
            topic: 'application-event',
            type: 'started',
            sourceUrl,
            sessionId: RVMMessageBus.sessionId,
            data: {
                parentApp: {
                    uuid: null
                },
                licenseKey: null,
                client: {
                    type: null,
                    version: null,
                    pid: null
                },
                uuid: null
            }
        }, licInfo);

        return this.publish(payload);
    }

    public downloadRuntime(options: DownloadRuntimeOptions, callback: (err?: Error) => void): void  {
        const rvmMessage: DownloadRuntimeMsg = Object.assign({ topic: 'application',
                                                               action: <downloadRuntimeAction>'runtime-download' }, options);

        const publishSuccess = this.publish(rvmMessage, (response: any) => {
            const { payload } = response;
            if (payload.error) {
                callback(new Error(payload.error));
            } else {
                callback();
            }
        });

        if (!publishSuccess) {
            callback(new Error('RVM Message failed.'));
        }
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
                            envelope
                        });
                        delete this.messageIdToCallback[messageId];
                    }
                }, timeToLiveInMS);
            }
        }
    }

    /**
     * Retrieves information about a plugin
     */
    public getPluginInfo(manifestUrl: string, opts: Plugin): Promise<PluginQueryResponse> {
        return new Promise((resolve) => {
            const {name, version} = opts;

            const rvmMsg: PluginQuery = {
                topic: 'application',
                action: 'query-plugin',
                name,
                version,
                sourceUrl: manifestUrl
            };

            this.publish(rvmMsg, resolve);
        });
    }
}

const rvmMessageBus = new RVMMessageBus();
export {rvmMessageBus};
