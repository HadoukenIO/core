// built-in modules
const fs = require('fs');
const os = require('os');
const electron = require('electron');
const electronApp = electron.app;
const electronBrowserWindow = electron.BrowserWindow;
const session = electron.session;
const shell = electron.shell;
const { crashReporter, IdleState } = electron;

// npm modules
const path = require('path');
const crypto = require('crypto');
const _ = require('underscore');

// local modules
import optionsConverter from '../convert_options.js';
import * as coreState from '../core_state.js';
import { ExternalApplication } from './external_application';
import * as logger from '../log';
import ofEvents from '../of_events';
import ProcessTracker from '../process_tracker.js';
import socketServer from '../transports/socket_server';
import { portDiscovery } from '../port_discovery';

import route from '../../common/route';
import { downloadScripts, loadScripts } from '../preload_scripts';
import { fetchReadFile } from '../cached_resource_fetcher';
import { createChromiumSocket, authenticateChromiumSocket } from '../transports/chromium_socket';
import { authenticateFetch, grantAccess } from '../cached_resource_fetcher';
import { getNativeWindowInfoLite } from '../utils';
import { isValidExternalWindow } from './external_window';

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
    MonitorInfo = require('../monitor_info.js').default;
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

export function addEventListener(type, listener) {
    ofEvents.on(route.system(type), listener);

    var unsubscribe = () => {
        ofEvents.removeListener(route.system(type), listener);
    };

    return unsubscribe;
}
export function authenticateResourceFetch(identity, options) {
    authenticateFetch(options.uuid, options.username, options.password);
}
export function clearCache(identity, options, resolve) {
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

    grantAccess(async () => {
        try {
            await defaultSession.clearCache().then(() => {
                defaultSession.clearStorageData(cacheOptions, () => {
                    resolve();
                });
            });
        } catch (e) {
            resolve(e);
        }
    });
}
export function createProxySocket(options, callback, errorCallback) {
    createChromiumSocket(Object.assign({}, options, { callback, errorCallback }));
}
export function authenticateProxySocket(options) {
    const url = options && options.url;
    electronApp.vlog(1, `authenticateProxySocket ${url}`);
    authenticateChromiumSocket(options);
}
export function deleteCacheOnExit(callback, errorCallback) {
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
}
export function exit() {
    electronApp.quit();
}
export function getAllWindows() {
    return coreState.getAllWindows();
}
export function getAllApplications() {
    return coreState.getAllApplications();
}
export function getAppAssetInfo(identity, options, callback, errorCallback) {
    options.srcUrl = coreState.getConfigUrlByUuid(identity.uuid);
    // TODO: Move this require to the top of file during future 'dependency injection refactor'
    // Must require here otherwise runtime error Cannot create browser window before app is ready
    var appAssetsFetcher = require('../rvm/runtime_initiated_topics/app_assets').appAssetsFetcher;
    appAssetsFetcher.fetchAppAsset(options.srcUrl, options.alias, callback, errorCallback);
}
export function getCommandLineArguments() {
    return electronApp.getCommandLineArguments();
}
export function getConfig() {
    return coreState.getStartManifest();
}
export function getCrashReporterState() {
    return crashReporter.crashReporterState();
}
export function getDeviceUserId() {
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
}
export function getDeviceId() {
    if (process.platform === 'win32') {
        return electronApp.getHostToken();
    } else {
        const hash = crypto.createHash('sha256');

        const macAddress = os.networkInterfaces().en0[0].mac;
        if (!macAddress) {
            throw new Error(`MAC address (${macAddress}) not defined`);
        }

        hash.update(macAddress);
        return hash.digest('hex');
    }
}
export function getEntityInfo(identity) {
    return coreState.getEntityInfo(identity);
}
export function getEnvironmentVariable(varsToExpand) {
    if (Array.isArray(varsToExpand)) {
        return varsToExpand.reduce(function(result, envVar) {
            result[envVar] = process.env[envVar] || null;
            return result;
        }, {});
    } else {
        return process.env[varsToExpand] || null;
    }
}
export function getFocusedWindow() {
    const { id } = electronBrowserWindow.getFocusedWindow() || {};
    const { uuid, name } = coreState.getWinObjById(id) || {};
    return uuid ? { uuid, name } : null;
}
export function getFocusedExternalWindow() {
    let { uuid } = electronBrowserWindow.getFocusedWindow() || {};
    return uuid ? { uuid } : null;
}
export function getHostSpecs() {
    let state = new IdleState();
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
}
export function getInstalledRuntimes(identity, callback, errorCallback) {
    var getInstalledRuntimesOpts = {
        uuid: identity.uuid,
        sourceUrl: coreState.getConfigUrlByUuid(identity.uuid)
    };

    var handleResponse = function(dataObj) {
        var failed = _.has(dataObj, 'time-to-live-expiration');
        if (!failed) {
            callback(dataObj.payload);
        } else {
            errorCallback(dataObj.payload);
        }
    };

    rvmBus.getInstalledRuntimes(getInstalledRuntimesOpts, handleResponse);
}
export function getLog(name, resolve) {
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
}
export function getLogList(callback, options) {
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
}
export function getMachineId() {
    if (process.platform === 'win32') {
        const registryInfo = this.readRegistryValue('HKEY_LOCAL_MACHINE', 'SOFTWARE\\Microsoft\\Cryptography', 'MachineGuid');
        return registryInfo.data;
    } else if (process.platform === 'darwin') {
        // This is implemented at the native level, as we need to access OS X-specific API functions.
        return electronApp.getMachineId();
    } else {
        return '';
    }
}
export function getMinLogLevel() {
    try {
        const logLevel = electronApp.getMinLogLevel();

        return logger.logLevelMappings.get(logLevel);
    } catch (e) {
        return e;
    }
}
export function getMonitorInfo() {
    return MonitorInfo.getInfo('api-query');
}
export function getMousePosition() {
    return MonitorInfo.getMousePosition();
}
export function getProcessList() {

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
}

export function getProxySettings() {
    return {
        config: coreState.getManifestProxySettings(),
        system: session.defaultSession.getProxySettings()
    };
}
export function getRemoteConfig(url, callback, errorCallback) {
    fetchReadFile(url, true)
        .then(callback)
        .catch(errorCallback);
}
export function getVersion() {
    return process.versions['openfin'];
}
export function getRuntimeInfo(identity) {
    const { port, securityRealm, version } =
    portDiscovery.getPortInfoByArgs(coreState.argo, socketServer.getPort());
    const manifestUrl = coreState.getConfigUrlByUuid(identity.uuid);
    const architecture = process.arch;
    const cachePath = electronApp.getPath('userData');
    const args = Object.assign({}, coreState.argo);
    args._ = undefined;
    return { manifestUrl, port, securityRealm, version, architecture, cachePath, args };
}
export function getRvmInfo(identity, callback, errorCallback) {
    let appObject = coreState.getAppObjByUuid(identity.uuid);
    let sourceUrl = (appObject || {})._configUrl || '';

    // TODO: Move this require to the top of file during future 'dependency injection refactor'
    // Must require here otherwise runtime error Cannot create browser window before app is ready
    let RvmInfoFetcher = require('../rvm/runtime_initiated_topics/rvm_info.js').default;
    RvmInfoFetcher.fetch(sourceUrl, callback, errorCallback);
}
export function getServiceConfiguration() {
    const rvmMessage = {
        topic: 'application',
        action: 'get-service-settings',
        sourceUrl: 'https://openfin.co'
    };

    return new Promise((resolve) => {
        rvmBus.publish(rvmMessage, response => {
            if (!response || !response.payload) {
                resolve(new Error('Bad Response from RVM'));
            } else if (response.payload.success === false) {
                resolve(new Error(response.payload.error || 'get-service-settings failed'));
            } else {
                resolve(response.payload.settings);
            }
        });
    });
}
export function launchExternalProcess(identity, options, errDataCallback) { // Node-style callback used here
    options.srcUrl = coreState.getConfigUrlByUuid(identity.uuid);

    ProcessTracker.launch(identity, options, errDataCallback);
}
export function monitorExternalProcess(identity, options, callback, errorCallback) {
    const payload = ProcessTracker.monitor(identity, Object.assign({
        monitor: true
    }, options));

    if (payload) {
        callback(payload);
    } else {
        errorCallback('Error monitoring external process, pid: ' + options.pid);
    }
}
export function log(level, message) {
    return logger.writeToLog(level, message, false);
}
export function setMinLogLevel(level) {
    try {
        const levelAsString = String(level); // We only accept log levels as strings here
        const mappedLevel = logger.logLevelMappings.get(levelAsString);

        if (mappedLevel === undefined) {
            throw new Error(`Invalid logging level: ${level}`);
        }
        electronApp.setMinLogLevel(mappedLevel);
    } catch (e) {
        return e;
    }
}
export function debugLog(level, message) {
    return logger.writeToLog(level, message, true);
}
export function openUrlWithBrowser(url) {
    shell.openExternal(url);
}
export function readRegistryValue(rootKey, subkey, value) {
    const registryPayload = electronApp.readRegistryValue(rootKey, subkey, value);

    if (registryPayload && registryPayload.error) {
        throw new Error(registryPayload.error);
    }

    return registryPayload;
}
export function releaseExternalProcess(processUuid) {
    ProcessTracker.release(processUuid);
}
export function removeEventListener(type, listener) {
    ofEvents.removeListener(route.system(type), listener);
}
export function showDeveloperTools(applicationUuid, windowName) {
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
}

export function showChromeNotificationCenter() {}
export function startCrashReporter(identity, options) {
    const configUrl = coreState.argo['startup-url'] || coreState.argo['config'];
    const reporterOptions = Object.assign({ configUrl }, options);

    logger.setToVerbose();
    return crashReporter.startOFCrashReporter(reporterOptions);
}
export function terminateExternalProcess(processUuid, timeout = 3000, child = false) {
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
}
export function updateProxySettings(type, proxyAddress, proxyPort) {
    return coreState.setManifestProxySettings({
        type: type,
        proxyAddress: proxyAddress,
        proxyPort: proxyPort
    });
}
export function setCookie(opts, callback, errorCallback) {
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
}
export function getCookies(opts, callback, errorCallback) {
    const { url, name } = opts;
    if (url && url.length > 0 && name && name.length > 0) {
        session.defaultSession.cookies.get({ url, name }, (error, cookies) => {
            if (error) {
                logger.writeToLog(1, `cookies.get error ${error}`, true);
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
                logger.writeToLog(1, `cookies filtered ${data.length}`, true);
                if (data.length > 0) {
                    callback(data);
                } else {
                    errorCallback(`Cookie not found ${name}`);
                }
            } else {
                logger.writeToLog(1, `cookies result ${cookies.length}`, true);
                errorCallback(`Cookie not found ${name}`);
            }
        });
    } else {
        errorCallback(`Error getting cookies`);
    }
}
export function flushCookieStore(callback) {
    session.defaultSession.cookies.flushStore(callback);
}
export function generateGUID() {
    return electronApp.generateGUID();
}
export function convertOptions(options) {
    return optionsConverter.convertToElectron(options);
}
export function getNearestDisplayRoot(point) {
    return MonitorInfo.getNearestDisplayRoot(point);
}
export function raiseEvent(eventName, eventArgs) {
    return ofEvents.emit(eventName, eventArgs);
}
// eventsIter is an Array or other iterable object (such as a Map or Set)
// whose elements are [key, value] pairs when iterated over
export function raiseManyEvents(eventsIter) {

    for (let [eventName, args] of eventsIter) {
        ofEvents.emit(eventName, args);
    }
}
export function downloadAsset(identity, asset, cb) {
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
}

export function downloadRuntime(identity, options, cb) {
    options.sourceUrl = coreState.getConfigUrlByUuid(identity.uuid);
    rvmBus.downloadRuntime(options, cb);

}
export function getAllExternalApplications() {
    return ExternalApplication.getAllExternalConnctions().map(eApp => {
        return {
            uuid: eApp.uuid
        };
    });
}
export function getAllExternalWindows() {
    const skipOpenFinWindows = true;
    const allNativeWindows = electronApp.getAllNativeWindowInfo(skipOpenFinWindows);
    const externalWindows = [];

    allNativeWindows.forEach(e => {
        const externalWindow = getNativeWindowInfoLite(e);
        const isValid = isValidExternalWindow(e);

        if (isValid) {
            externalWindows.push(externalWindow);
        }
    });

    return externalWindows;
}
export function resolveUuid(identity, uuid, cb) {
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
}

export function downloadPreloadScripts(identity, preloadScripts) {
    return downloadScripts(identity, preloadScripts);
}

export function getPreloadScripts(identity) {
    return loadScripts(identity);
}
export const System = {
    addEventListener,
    authenticateResourceFetch,
    clearCache,
    createProxySocket,
    authenticateProxySocket,
    deleteCacheOnExit,
    exit,
    getAllWindows,
    getAllApplications,
    getAppAssetInfo,
    getCommandLineArguments,
    getConfig,
    getCrashReporterState,
    getDeviceUserId,
    getDeviceId,
    getEntityInfo,
    getEnvironmentVariable,
    getFocusedWindow,
    getFocusedExternalWindow,
    getHostSpecs,
    getInstalledRuntimes,
    getLog,
    getLogList,
    getMachineId,
    getMinLogLevel,
    getMonitorInfo,
    getMousePosition,
    getProcessList,
    getProxySettings,
    getRemoteConfig,
    getVersion,
    getRuntimeInfo,
    getRvmInfo,
    getServiceConfiguration,
    launchExternalProcess,
    monitorExternalProcess,
    log,
    setMinLogLevel,
    debugLog,
    openUrlWithBrowser,
    readRegistryValue,
    releaseExternalProcess,
    removeEventListener,
    showDeveloperTools,
    showChromeNotificationCenter,
    startCrashReporter,
    terminateExternalProcess,
    updateProxySettings,
    setCookie,
    getCookies,
    flushCookieStore,
    generateGUID,
    convertOptions,
    getNearestDisplayRoot,
    raiseEvent,
    raiseManyEvents,
    downloadAsset,
    downloadRuntime,
    getAllExternalApplications,
    getAllExternalWindows,
    resolveUuid,
    downloadPreloadScripts,
    getPreloadScripts
};
