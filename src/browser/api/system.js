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

// built-in modules
const fs = require('fs');
const os = require('os');
const electron = require('electron');
const electronApp = electron.app;
const ResourceFetcher = electron.resourceFetcher;
const session = electron.session;
const shell = electron.shell;
const { crashReporter } = electron;

// npm modules
const path = require('path');
const crypto = require('crypto');
const _ = require('underscore');

// local modules
const convertOptions = require('../convert_options.js');
const coreState = require('../core_state.js');
const electronIPC = require('../transports/electron_ipc.js');
import { ExternalApplication } from './external_application';
const log = require('../log.js');
import ofEvents from '../of_events';
const ProcessTracker = require('../process_tracker.js');
import route from '../../common/route';
import { fetchAndLoadPreloadScripts } from '../preload_scripts';


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

const preloadScriptsCache = {};

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

ofEvents.on(route.application('created', '*'), payload => {
    ofEvents.emit(route.system('application-created'), {
        topic: 'system',
        type: 'application-created',
        uuid: payload.source
    });
});

ofEvents.on(route.application('started', '*'), payload => {
    ofEvents.emit(route.system('application-started'), {
        topic: 'system',
        type: 'application-started',
        uuid: payload.source
    });
});

ofEvents.on(route.application('closed', '*'), payload => {
    ofEvents.emit(route.system('application-closed'), {
        topic: 'system',
        type: 'application-closed',
        uuid: payload.source
    });
});

ofEvents.on(route.application('crashed', '*'), payload => {
    ofEvents.emit(route.system('application-crashed'), {
        topic: 'system',
        type: 'application-crashed',
        uuid: payload.source
    });
});

ofEvents.on(route.externalApplication('connected'), payload => {
    ofEvents.emit(route.system('external-application-connected'), {
        topic: 'system',
        type: 'external-application-connected',
        uuid: payload.uuid
    });
});

ofEvents.on(route.externalApplication('disconnected'), payload => {
    ofEvents.emit(route.system('external-application-disconnected'), {
        topic: 'system',
        type: 'external-application-disconnected',
        uuid: payload.uuid
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
    clearCache: function(options, resolve) {
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

        var availableStorages = ['appcache', 'cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers'];
        var storages = [];

        if (typeof settings.localStorage === 'boolean') {
            settings['localstorage'] = settings.localStorage;
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

        var cacheOptions = {
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
    getHostSpecs: function() {
        return {
            cpus: os.cpus(),
            memory: os.totalmem(),
            name: electronApp.getSystemName(),
            arch: electronApp.getSystemArch(),
            gpu: {
                name: electronApp.getGpuName()
            }
        };
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
        const fetcher = new ResourceFetcher('string');

        fetcher.once('fetch-complete', (obj, status, data) => {
            if (status === 'success') {
                try {
                    const res = JSON.parse(data);
                    callback(res);
                } catch (e) {
                    errorCallback(e);
                }
            } else {
                errorCallback('Error retrieving remote config.');
            }
        });

        fetcher.fetch(url);
    },
    getVersion: function() {
        return process.versions['openfin'];
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
    debugLog: function(level, message) {
        return log.writeToLog(level, message, true);
    },
    openUrlWithBrowser: function(url) {
        shell.openExternal(url);
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
        crashReporter.startOFCrashReporter(reporterOptions);

        return crashReporter.crashReporterState();
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
    getWebSocketServerState: function() {
        return coreState.getSocketServerState();
    },
    generateGUID: function() {
        return electronApp.generateGUID();
    },
    convertOptions: function(options) {
        return convertOptions.convertToElectron(options);
    },
    getElIPCConfiguration: function() {
        return {
            channels: electronIPC.channels
        };
    },
    getNearestDisplayRoot: function(point) {
        return MonitorInfo.getNearestDisplayRoot(point);
    },
    raiseEvent: function(eventName, eventArgs) {
        return ofEvents.emit(eventName, eventArgs);
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

    downloadPreloadScripts: function(identity, preloadOption, cb) {
        fetchAndLoadPreloadScripts(identity, preloadOption, () => {
            cb(null);
        });
    },

    setPreloadScript: function(url, scriptText) {
        preloadScriptsCache[url] = scriptText;
    },

    getPreloadScript: function(url) {
        return preloadScriptsCache[url];
    },

    getSelectedPreloadScripts: function(preloadOption) {
        const response = {};

        const missingRequiredScripts = preloadOption.reduce((urls, preload) => {
            if (!preload.optional && !(preload.url in preloadScriptsCache)) {
                urls.push(preload.url);
            }
            return urls;
        }, []);

        if (!missingRequiredScripts.length) {
            const missingOptionalScript = '';
            response.scripts = preloadOption.map(preload => preloadScriptsCache[preload.url] || missingOptionalScript);
        } else {
            response.error = `Execution of preload scripts canceled because of missing required script(s) ${JSON.stringify(missingRequiredScripts)}`;
        }

        return response;
    }
};
