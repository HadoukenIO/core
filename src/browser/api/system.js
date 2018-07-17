/*
Copyright 2018 OpenFin Inc.

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

// built-in modules
const fs = require('fs');
const os = require('os');
const electron = require('electron');
const electronApp = electron.app;
const electronBrowserWindow = electron.BrowserWindow;
const session = electron.session;
const shell = electron.shell;
const { crashReporter, idleState } = electron;

// npm modules
const path = require('path');
const crypto = require('crypto');
const _ = require('underscore');

// local modules
const convertOptions = require('../convert_options.js');
const coreState = require('../core_state.js');
import { ExternalApplication } from './external_application';
const log = require('../log.js');
import ofEvents from '../of_events';
const ProcessTracker = require('../process_tracker.js');
const socketServer = require('../transports/socket_server').server;
const portDiscovery = require('../port_discovery').portDiscovery;

import route from '../../common/route';
import { downloadScripts, loadScripts } from '../preload_scripts';
import * as plugins from '../plugins';
import { fetchReadFile } from '../cached_resource_fetcher';
import { createChromiumSocket, authenticateChromiumSocket } from '../transports/chromium_socket';
import { authenticateFetch } from '../cached_resource_fetcher';

const defaultProc = {
    getCpuUsage: function() {
        return 0;
    },
    getNonPagedPoolUsage: function() {
        return 0;
    },
    getPagedPoolUsage: function() {
        return 0;
    },
    getPageFaultCount: function() {
        return 0;
    },
    getPagefileUsage: function() {
        return 0;
    },
    getPeakNonPagedPoolUsage: function() {
        return 0;
    },
    getPeakPagedPoolUsage: function() {
        return 0;
    },
    getPeakPagefileUsage: function() {
        return 0;
    },
    getPeakWorkingSetSize: function() {
        return 0;
    },
    getWorkingSetSize: function() {
        return 0;
    }
};

let MonitorInfo;
let Session;
let rvmBus;
let defaultSession;
electronApp.on('ready', function() {
    MonitorInfo = require('../monitor_info.js');
    Session = require('../session').default;
    rvmBus = require('../rvm/rvm_message_bus').rvmMessageBus;

    MonitorInfo.on('monitor-info-changed', payload => {
        ofEvents.emit(route.system('monitor-info-changed'), payload);
    });

    Session.on('session-changed', payload => {
        ofEvents.emit(route.system('session-changed'), payload);
    });

    Session.on('idle-state-changed', payload => {
        ofEvents.emit(route.system('idle-state-changed'), payload);
    });

    defaultSession = session.defaultSession;
});

electronApp.on('synth-desktop-icon-clicked', payload => {
    payload.topic = 'system';
    payload.type = 'desktop-icon-clicked';
    ofEvents.emit(route.system('desktop-icon-clicked'), payload);
});

const eventPropagationMap = new Map();
eventPropagationMap.set(route.externalApplication('connected'), 'external-application-connected');
eventPropagationMap.set(route.externalApplication('disconnected'), 'external-application-disconnected');

eventPropagationMap.forEach((systemEvent, eventString) => {
    ofEvents.on(eventString, payload => {
        const systemEventProps = { topic: 'system', type: systemEvent };
        const initialPayload = Array.isArray(payload.data) ? payload.data : [payload];
        ofEvents.emit(route.system(systemEvent), Object.assign({}, ...initialPayload, systemEventProps));
    });
});

exports.System = {
    addEventListener: function(type, listener) {
        ofEvents.on(route.system(type), listener);

        var unsubscribe = () => {
            ofEvents.removeListener(route.system(type), listener);
        };

        return unsubscribe;
    },
    authenticateResourceFetch: function(identity, options) {
        authenticateFetch(options.uuid, options.username, options.password);
    },
    clearCache: function(identity, options, resolve) {
        /*
        fin.desktop.System.clearCache({
            cache: true,
            cookies: true,
            localStorage: true,
            appcache: true,
            userData: true // TODO: userData is the window bounds cache
        });
        */
        var settings = options || {};

        const availableStorages = ['appcache', 'cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers'];
        const storages = [];

        if (typeof settings.localStorage === 'boolean') {
            settings.localstorage = settings.localStorage;
        }

        // 5.0 defaults cache true if not specified
        if (Object.keys(settings).length === 0) {
            settings.cache = true;
        }
        if (typeof settings.cache === 'boolean') {
            settings.filesystem = settings.filesystem || settings.cache;
            settings.indexdb = settings.indexdb || settings.cache;
            settings.shadercache = settings.shadercache || settings.cache;
            settings.websql = settings.websql || settings.cache;
            settings.serviceworkers = settings.serviceworkers || settings.cache;
        }

        availableStorages.forEach(function(key) {
            if (settings[key]) {
                storages.push(key);
            }
        });

        const cacheOptions = {
            /* origin? */
            storages: storages,
            quotas: ['temporary', 'persistent', 'syncable']
        };

        electronApp.vlog(1, `clearCache ${JSON.stringify(storages)}`);

        defaultSession.clearCache(() => {
            defaultSession.clearStorageData(cacheOptions, () => {
                resolve();
            });
        });


    },
    createProxySocket: function(options, callback, errorCallback) {
        createChromiumSocket(Object.assign({}, options, { callback, errorCallback }));
    },
    authenticateProxySocket: function(options) {
        const url = options && options.url;
        electronApp.vlog(1, `authenticateProxySocket ${url}`);
        authenticateChromiumSocket(options);
    },
    deleteCacheOnExit: function(callback, errorCallback) {
        const folders = [{
            name: electronApp.getPath('userData') // deleteIfEmpty defaults to false on RVM side
        }, {
            name: electronApp.getPath('userDataRoot'),
            deleteIfEmpty: true
        }];

        const publishSuccess = rvmBus.publish({
            topic: 'cleanup',
            folders
        });

        if (publishSuccess) {
            callback();
        } else {
            errorCallback('Failed to send a message to the RVM.');
        }
    },
    exit: function() {
        electronApp.quit();
    },
    getAllWindows: function() {
        return coreState.getAllWindows();
    },
    getAllApplications: function() {
        return coreState.getAllApplications();
    },
    getAppAssetInfo: function(identity, options, callback, errorCallback) {
        options.srcUrl = coreState.getConfigUrlByUuid(identity.uuid);
        // TODO: Move this require to the top of file during future 'dependency injection refactor'
        // Must require here otherwise runtime error Cannot create browser window before app is ready
        var appAssetsFetcher = require('../rvm/runtime_initiated_topics/app_assets').appAssetsFetcher;
        appAssetsFetcher.fetchAppAsset(options.srcUrl, options.alias, callback, errorCallback);
    },
    getCommandLineArguments: function() {
        return electronApp.getCommandLineArguments();
    },
    getConfig: function() {
        return coreState.getStartManifest();
    },
    getCrashReporterState: function() {
        return crashReporter.crashReporterState();
    },
    getDeviceUserId: function() {
        const hash = crypto.createHash('sha256');

        let hostToken;
        let username;

        if (process.platform === 'darwin') {
            hostToken = os.networkInterfaces().en0[0].mac;
            username = process.env.USER;
        } else {

            // assume windows
            hostToken = electronApp.getHostToken();
            username = process.env.USERNAME;
        }

        if (!username || !hostToken) {
            throw new Error(`One of username (${username}) or host token (${hostToken}) not defined`);
        }

        hash.update(hostToken);
        hash.update(username);

        return hash.digest('hex');
    },
    getDeviceId: function() {
        return electronApp.getHostToken();
    },
    getEntityInfo: function(identity) {
        return coreState.getEntityInfo(identity);
    },
    getEnvironmentVariable: function(varsToExpand) {
        if (Array.isArray(varsToExpand)) {
            return varsToExpand.reduce(function(result, envVar) {
                result[envVar] = process.env[envVar] || null;
                return result;
            }, {});
        } else {
            return process.env[varsToExpand] || null;
        }
    },
    getFocusedWindow: function() {
        const { id } = electronBrowserWindow.getFocusedWindow() || {};
        const { uuid, name } = coreState.getWinObjById(id) || {};
        return uuid ? { uuid, name } : null;
    },
    getHostSpecs: function() {
        let state = new idleState();
        const theme = (process.platform === 'win32') ? { aeroGlassEnabled: electronApp.isAeroGlassEnabled() } : {};
        return Object.assign({
            cpus: os.cpus(),
            memory: os.totalmem(),
            name: electronApp.getSystemName(),
            arch: electronApp.getSystemArch(),
            gpu: {
                name: electronApp.getGpuName()
            },
            screenSaver: state.isScreenSaverRunning(),
        }, theme);
    },
    getLog: function(name, resolve) {
        // Prevent abuse of trying to read files with a path relative to cache directory
        var pathSafeName = path.basename(name);
        if (pathSafeName === name) {
            var pattern = /^debug.*\.log$/;
            if (pattern.test(pathSafeName)) {
                fs.readFile(electronApp.getPath('userCache') + '/' + pathSafeName, {
                    encoding: 'utf8'
                }, (err, data) => {
                    if (!err) {
                        resolve(undefined, data);
                    } else {
                        resolve(`Could not read log file ${name}`);
                    }
                });
            } else {
                resolve(`${name} is not a valid log file.`);
            }
        } else {
            resolve('Only log file in the base cache directory are supported.');
        }
    },
    getLogList: function(callback, options) {
        fs.readdir(electronApp.getPath('userCache'), function(err, files) {
            let opts = options || {};

            if (!err) {
                let pattern = opts.pattern || /^debug+(\w)*\.log$/;
                var logFiles = _.filter(files, fileName => {
                    return pattern.test(fileName);
                });


                var fileStats = [];
                if (logFiles.length) {
                    var index = 0;

                    var processFileStats = function() {
                        var name = logFiles[index++];

                        fs.stat(electronApp.getPath('userCache') + '/' + name, (err, stats) => {
                            if (!err) {
                                fileStats.push({
                                    name: name,
                                    size: stats.size,
                                    date: stats.mtime
                                });
                            }

                            if (index < logFiles.length) {
                                processFileStats();
                            } else {
                                if (typeof callback === 'function') {
                                    callback(undefined, fileStats);
                                }
                            }
                            //                            } else if (typeof callback === 'function') {
                            //                                callback('An error occured while trying to retrieve log information: ' + err);
                            //                            }
                        });
                    };

                    processFileStats();
                } else if (typeof callback === 'function') {
                    callback(undefined, fileStats);
                }
            } else if (typeof callback === 'function') {
                callback('Could not locate any log files');
            }
        });
    },
    getMinLogLevel: function() {
        try {
            const logLevel = electronApp.getMinLogLevel();

            return log.logLevelMappings.get(logLevel);
        } catch (e) {
            return e;
        }
    },
    getMonitorInfo: function() {
        return MonitorInfo.getInfo('api-query');
    },
    getMousePosition: function() {
        return MonitorInfo.getMousePosition();
    },
    getProcessList: function() {

        let allApps = coreState.getAllApplications();
        let runningAps = allApps.filter(app => {
            return app.isRunning;
        });

        let processList = runningAps.map(app => {
            var appObj = coreState.getAppObjByUuid(app.uuid),
                name = appObj._options.name,
                proc = appObj._processInfo || defaultProc;

            return {
                cpuUsage: proc.getCpuUsage(),
                name: name,
                nonPagedPoolUsage: proc.getNonPagedPoolUsage(),
                pageFaultCount: proc.getPageFaultCount(),
                pagedPoolUsage: proc.getPagedPoolUsage(),
                pagefileUsage: proc.getPagefileUsage(),
                peakNonPagedPoolUsage: proc.getPeakNonPagedPoolUsage(),
                peakPagedPoolUsage: proc.getPeakPagedPoolUsage(),
                peakPagefileUsage: proc.getPeakPagefileUsage(),
                peakWorkingSetSize: proc.getPeakWorkingSetSize(),
                processId: appObj.mainWindow.webContents.processId,
                uuid: appObj.uuid,
                workingSetSize: proc.getWorkingSetSize()
            };
        });

        return processList;
    },

    getProxySettings: function() {
        return {
            config: coreState.getManifestProxySettings(),
            system: session.defaultSession.getProxySettings()
        };
    },
    getRemoteConfig: function(url, callback, errorCallback) {
        fetchReadFile(url, true)
            .then(callback)
            .catch(errorCallback);
    },
    getVersion: function() {
        return process.versions['openfin'];
    },
    getRuntimeInfo: function(identity) {
        const { port, securityRealm, version } =
        portDiscovery.getPortInfoByArgs(coreState.argo, socketServer.getPort());
        const manifestUrl = coreState.getConfigUrlByUuid(identity.uuid);
        const architecture = process.arch;
        const cachePath = electronApp.getPath('userData');
        return { manifestUrl, port, securityRealm, version, architecture, cachePath };
    },
    getRvmInfo: function(identity, callback, errorCallback) {
        let appObject = coreState.getAppObjByUuid(identity.uuid);
        let sourceUrl = (appObject || {})._configUrl || '';

        // TODO: Move this require to the top of file during future 'dependency injection refactor'
        // Must require here otherwise runtime error Cannot create browser window before app is ready
        let RvmInfoFetcher = require('../rvm/runtime_initiated_topics/rvm_info.js');
        RvmInfoFetcher.fetch(sourceUrl, callback, errorCallback);
    },
    launchExternalProcess: function(identity, options, errDataCallback) { // Node-style callback used here
        options.srcUrl = coreState.getConfigUrlByUuid(identity.uuid);

        ProcessTracker.launch(identity, options, errDataCallback);
    },
    monitorExternalProcess: function(identity, options, callback, errorCallback) {
        const payload = ProcessTracker.monitor(identity, Object.assign({
            monitor: true
        }, options));

        if (payload) {
            callback(payload);
        } else {
            errorCallback('Error monitoring external process, pid: ' + options.pid);
        }
    },
    log: function(level, message) {
        return log.writeToLog(level, message, false);
    },
    setMinLogLevel: function(level) {
        try {
            const levelAsString = String(level); // We only accept log levels as strings here
            const mappedLevel = log.logLevelMappings.get(levelAsString);

            if (mappedLevel === undefined) {
                throw new Error(`Invalid logging level: ${level}`);
            }
            electronApp.setMinLogLevel(mappedLevel);
        } catch (e) {
            return e;
        }
    },
    debugLog: function(level, message) {
        return log.writeToLog(level, message, true);
    },
    openUrlWithBrowser: function(url) {
        shell.openExternal(url);
    },
    readRegistryValue: function(rootKey, subkey, value) {
        const registryPayload = electronApp.readRegistryValue(rootKey, subkey, value);

        if (registryPayload && registryPayload.error) {
            throw new Error(registryPayload.error);
        }

        return registryPayload;
    },
    releaseExternalProcess: function(processUuid) {
        ProcessTracker.release(processUuid);
    },
    removeEventListener: function(type, listener) {
        ofEvents.removeListener(route.system(type), listener);
    },
    showDeveloperTools: function(applicationUuid, windowName) {
        let winName, openfinWindow;

        if (!windowName) {
            winName = applicationUuid;
        } else {
            winName = windowName;
        }

        openfinWindow = coreState.getWindowByUuidName(applicationUuid, winName);

        if (openfinWindow && openfinWindow.browserWindow) {
            openfinWindow.browserWindow.openDevTools();
        }
    },

    showChromeNotificationCenter: function() {},
    startCrashReporter: function(identity, options) {
        const configUrl = coreState.argo['startup-url'] || coreState.argo['config'];
        const reporterOptions = Object.assign({ configUrl }, options);

        log.setToVerbose();
        return crashReporter.startOFCrashReporter(reporterOptions);
    },
    terminateExternalProcess: function(processUuid, timeout = 3000, child = false) {
        let status = ProcessTracker.terminate(processUuid, timeout, child);

        let result;
        if (status === 0) {
            result = 'failed';
        } else if (status === 1) {
            result = 'clean';
        } else {
            result = 'terminated';
        }

        return {
            result
        };
    },
    updateProxySettings: function(type, proxyAddress, proxyPort) {
        return coreState.setManifestProxySettings({
            type: type,
            proxyAddress: proxyAddress,
            proxyPort: proxyPort
        });
    },
    setCookie: function(opts, callback, errorCallback) {
        //OpenFin ttl = 0 means the cookie should live forever.
        // 5.0 Defaults to live forever even in the absence of ttl being defined
        let timeToLive = -1;
        if (typeof opts.ttl === 'number' && opts.ttl !== 0) {
            timeToLive = opts.ttl / 1000;
        }

        //Expand the OpenFin cookie shape to Electron cookie shape.
        //If an Electron cookie shape is passed then it is used.
        //https://github.com/openfin/runtime/blob/develop/docs/api/session.md#sescookiessetdetails-callback
        opts.expirationDate = Date.now() + timeToLive;
        opts.session = opts.session ? opts.session : opts.httpOnly;

        session.defaultSession.cookies.set(opts, function(error) {
            if (!error) {
                callback();
            } else {
                errorCallback(error);
            }
        });
    },
    getCookies: function(opts, callback, errorCallback) {
        const { url, name } = opts;
        if (url && url.length > 0 && name && name.length > 0) {
            session.defaultSession.cookies.get({ url, name }, (error, cookies) => {
                if (error) {
                    log.writeToLog(1, `cookies.get error ${error}`, true);
                    errorCallback(error);
                } else if (cookies.length > 0) {
                    const data =
                        cookies.filter(cookie => !cookie.httpOnly).map(cookie => {
                            return {
                                name: cookie.name,
                                expirationDate: cookie.expirationDate,
                                path: cookie.path,
                                domain: cookie.domain
                            };
                        });
                    log.writeToLog(1, `cookies filtered ${data.length}`, true);
                    if (data.length > 0) {
                        callback(data);
                    } else {
                        errorCallback(`Cookie not found ${name}`);
                    }
                } else {
                    log.writeToLog(1, `cookies result ${cookies.length}`, true);
                    errorCallback(`Cookie not found ${name}`);
                }
            });
        } else {
            errorCallback(`Error getting cookies`);
        }
    },
    flushCookieStore: function(callback) {
        session.defaultSession.cookies.flushStore(callback);
    },
    generateGUID: function() {
        return electronApp.generateGUID();
    },
    convertOptions: function(options) {
        return convertOptions.convertToElectron(options);
    },
    getNearestDisplayRoot: function(point) {
        return MonitorInfo.getNearestDisplayRoot(point);
    },
    raiseEvent: function(eventName, eventArgs) {
        return ofEvents.emit(eventName, eventArgs);
    },
    // eventsIter is an Array or other iterable object (such as a Map or Set)
    // whose elements are [key, value] pairs when iterated over
    raiseManyEvents: function(eventsIter) {

        for (let [eventName, args] of eventsIter) {
            ofEvents.emit(eventName, args);
        }
    },
    downloadAsset: function(identity, asset, cb) {
        const srcUrl = coreState.getConfigUrlByUuid(identity.uuid);
        const downloadId = asset.downloadId;

        //setup defaults.
        asset.args = asset.args || '';

        const rvmMessage = {
            topic: 'app-assets',
            type: 'download-asset',
            appConfig: srcUrl,
            showRvmProgressDialog: false,
            asset: asset,
            downloadId: downloadId
        };

        const publishSuccess = rvmBus.publish(rvmMessage, response => {
            if (response.error) {
                cb(new Error(response.error));
            } else {
                cb();
            }
        });

        if (!publishSuccess) {
            cb(new Error('RVM Message failed.'));
        }
    },

    downloadRuntime: function(identity, options, cb) {
        options.sourceUrl = coreState.getConfigUrlByUuid(identity.uuid);
        rvmBus.downloadRuntime(options, cb);

    },
    getAllExternalApplications: function() {
        return ExternalApplication.getAllExternalConnctions().map(eApp => {
            return {
                uuid: eApp.uuid
            };
        });
    },
    resolveUuid: function(identity, uuid, cb) {
        const externalConn = ExternalApplication.getAllExternalConnctions().find(c => c.uuid === uuid);
        const app = coreState.getAppObjByUuid(uuid);

        if (externalConn) {
            cb(null, {
                type: 'external-app',
                uuid: externalConn.uuid
            });
        } else if (app) {
            cb(null, {
                type: 'application',
                uuid: app.uuid
            });
        } else {
            cb(new Error('uuid not found.'));
        }
    },

    downloadPreloadScripts: function(identity, preloadScripts) {
        return downloadScripts(identity, preloadScripts);
    },

    getPluginModule: function(identity, name) {
        return plugins.getModule(identity, name);
    },

    getPreloadScripts: function(identity) {
        return loadScripts(identity);
    }
};
