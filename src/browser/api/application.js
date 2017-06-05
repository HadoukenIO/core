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
/*
    src/browser/api/application.js
 */

// built-in modules
let path = require('path');
let electron = require('electron');
let BrowserWindow = electron.BrowserWindow;
let electronApp = electron.app;
let dialog = electron.dialog;
let globalShortcut = electron.globalShortcut;
let nativeImage = electron.nativeImage;
let ProcessInfo = electron.processInfo;
let ResourceFetcher = electron.resourceFetcher;
let Tray = electron.Tray;

// npm modules
let _ = require('underscore');

// local modules
let System = require('./system.js').System;
let Window = require('./window.js').Window;
let convertOpts = require('../convert_options.js');
let coreState = require('../core_state.js');
let externalApiBase = require('../api_protocol/api_handlers/api_protocol_base');
import {
    cachedFetch
} from '../cached_resource_fetcher';
import ofEvents from '../of_events';
let regex = require('../../common/regex');
let WindowGroups = require('../window_groups.js');
import {
    sendToRVM
} from '../rvm/utils';
import {
    validateNavigationRules
} from '../navigation_validation';
import * as log from '../log';
let subscriptionManager = new require('../subscription_manager.js').SubscriptionManager();

// locals
const TRAY_ICON_KEY = 'tray-icon-events';
let runtimeIsClosing = false;
let hasPlugins = false;
let rvmBus;
let MonitorInfo;
var Application = {};
let fetchingIcon = {};

// var OfEvents = [
//     'closed',
//     'error',
//     'crashed',
//     'not-responding',
//     'out-of-memory',
//     'responding',
//     'started',
//     'run-requested',
//     'window-navigation-rejected'
// ];


// this event is emitted from the native side to determine whether plugins should
// be enabled or not, since webContents don't seem to be available at the time of
// app creation. the hasPlugins flag denotes that 'plugins' is set to true
// in the app's window options
electronApp.on('use-plugins-requested', event => {
    if (hasPlugins) {
        event.preventDefault();
    }
});

electronApp.on('ready', function() {
    console.log('RVM MESSAGE BUS READY');
    rvmBus = require('../rvm/rvm_message_bus.js');
    MonitorInfo = require('../monitor_info.js');

    // listen to and broadcast 'broadcast' messages from RVM as an openfin app event
    rvmBus.on('rvm-message-bus/broadcast/application/manifest-changed', payload => {
        const manifests = payload && payload.manifests;
        if (manifests) {
            _.each(manifests, manifestObject => {
                var sourceUrl = manifestObject.sourceUrl;
                var json = manifestObject.json;
                var uuid = coreState.getUuidBySourceUrl(sourceUrl);
                if (uuid) {
                    ofEvents.emit(eventRoute(uuid, 'manifest-changed'), sourceUrl, json);
                } else {
                    console.log('Received manifest-changed event from RVM, unable to determine uuid from source url though:', sourceUrl);
                }
            });
        } else {
            console.log('Received manifest-changed event from RVM with invalid data object: ', payload);
        }
    });

});

Application.create = function(opts, configUrl = '', parentIdentify = {}) {
    //Hide Window until run is called

    let appUrl = opts.url;
    if (appUrl === undefined && opts.mainWindowOptions) {
        appUrl = opts.mainWindowOptions.url;
    }

    // undefined or '' acceptable here (gets default in createAppObj); or non-empty string
    let isValidUrl = appUrl === undefined || typeof appUrl === 'string';
    if (!isValidUrl) {
        throw new Error(`Invalid application URL: ${appUrl}`);
    }

    let isValidUuid = isNonEmptyString(opts.uuid) && opts.uuid !== '*';
    if (!isValidUuid) {
        throw new Error(`Invalid application UUID: ${opts.uuid}`);
    }

    let isValidName = isNonEmptyString(opts.name) && opts.name !== '*';
    if (!isValidName) {
        throw new Error(`Invalid application name: ${opts.name}`);
    }

    let isAppRunning = coreState.getAppRunningState(opts.uuid);
    if (isAppRunning) {
        throw new Error(`Application with specified UUID already exists: ${opts.uuid}`);
    }

    let parentUuid = parentIdentify && parentIdentify.uuid;
    if (!validateNavigationRules(opts.uuid, appUrl, parentUuid, opts)) {
        throw new Error(`Application with specified URL is not allowed: ${opts.appUrl}`);
    }

    let existingApp = coreState.appByUuid(opts.uuid);
    if (existingApp) {
        coreState.removeApp(existingApp.id);
    }

    let appObj = createAppObj(opts.uuid, opts, configUrl);
    if (parentIdentify && parentIdentify.uuid) {
        appObj.parentUuid = parentIdentify.uuid;
    }

    return appObj;
};


Application.getCurrent = function() {
    //Implemented in RenderProcess
};

Application.getCurrentApplication = function() {
    console.warn('Deprecated. Please use getCurrent');
};


// TODO confirm with external connections, this does not get used
// in the render process
Application.wrap = coreState.getAppObjByUuid;

/**
 * Add a listener for the given Application event
 *
 * @param {Object} identity Object containing an uuid key with string value
 * @param {string} appEvent The event you are listening for
 * @param {function} listener A function to be called when the event is raised
 *
 * @returns {function} A function that removes the given listner
 */
Application.addEventListener = function(identity, appEvent, listener) {
    // TODO this leaves it up the the app to unsubscribe and is a potential
    //      leak. perhaps we need a way to unhook when an app disconnects
    //      automatically

    let uuid = identity.uuid;
    let eventString = eventRoute(uuid, appEvent);
    let errRegex = /^Attempting to call a function in a renderer window that has been closed or released/;

    let unsubscribe, safeListener, browserWinIsDead;

    /*
        for now, make a provision to auto-unhook if it fails to find
        the browser window

        TODO this needs to be added to the general unhook pipeline post
             the identity problem getting solved
     */
    safeListener = (...args) => {

        try {

            listener.call(null, ...args);

        } catch (err) {

            browserWinIsDead = errRegex.test(err.message);

            // if we error the browser window that this used to reference
            // has been destroyed, just remove the listener
            if (browserWinIsDead) {
                ofEvents.removeListener(eventString, safeListener);
            }
        }
    };

    ofEvents.on(eventString, safeListener);

    // set up the unhooking function to be called when the browser window
    // is destroyed
    unsubscribe = () => {
        ofEvents.removeListener(eventString, safeListener);
    };

    return unsubscribe;
};

//TODO:Ricardo: This is private do not expose it as part of the module.
function closeChildWins(identity) {
    Application.getChildWindows(identity).forEach(function(childWindow) {
        const childWindowIdentity = {
            name: childWindow.name,
            uuid: childWindow.uuid
        };
        Window.close(childWindowIdentity, true);
    });
}

Application.close = function(identity, force, callback) {
    let app = Application.wrap(identity.uuid);

    if (!app) {
        log.writeToLog(1, `Could not close app ${identity.uuid}`, true);

        if (typeof callback === 'function') {
            callback();
        }

        return;
    }

    let mainWin = app.mainWindow;

    if (force) {
        closeChildWins(identity);
    }

    if (mainWin) {
        const mainWindowIdentity = {
            name: app._options.uuid,
            uuid: app._options.uuid
        };
        Window.close(mainWindowIdentity, force, callback);
    }
};

Application.getChildWindows = function(identity /*, callback, errorCallback*/ ) {
    var app = Application.wrap(identity.uuid);

    return coreState.getChildrenByApp(app.id);
};

Application.getGroups = function( /* callback, errorCallback*/ ) {
    return WindowGroups.getGroups();
};


Application.getManifest = function(identity, callback, errCallback) {
    let appObject = coreState.getAppObjByUuid(identity.uuid);
    let manifestUrl = appObject && appObject._configUrl;
    let fetcher;

    if (manifestUrl) {
        fetcher = new ResourceFetcher('string');
        fetcher.on('fetch-complete', (obj, status, data) => {
            try {
                log.writeToLog(1, `application manifest ${manifestUrl}`, true);
                log.writeToLog(1, data, true);

                let manifest = JSON.parse(data);
                if (typeof callback === 'function') {
                    callback(manifest);
                }
            } catch (err) {
                errCallback(new Error(`Error parsing JSON from ${manifestUrl}`));
            } finally {
                fetcher.removeAllListeners('fetch-complete');
                fetcher = null;
            }
        });
        // start async fetch
        fetcher.fetch(manifestUrl);

    } else {
        errCallback(new Error('App not started from manifest'));
    }
};

Application.getParentApplication = function(identity) {
    let appObject = coreState.getAppObjByUuid(identity.uuid);
    if (appObject && appObject.parentUuid) {
        return appObject.parentUuid;
    }
};

Application.getShortcuts = function(identity, callback, errorCallback) {
    let app = Application.wrap(identity.uuid);
    let manifestUrl = app && app._configUrl;

    // Only apps started from a manifest can retrieve shortcut configuration
    if (!manifestUrl) {
        return errorCallback(new Error('App must be started from a manifest to be able to request its shortcut configuration'));
    }

    sendToRVM({
            topic: 'application',
            action: 'get-shortcut-state',
            sourceUrl: manifestUrl
        }).then(callback, errorCallback)
        .catch(errorCallback);
};

Application.getInfo = function(identity, callback /*, errorCallback*/ ) {
    const app = Application.wrap(identity.uuid);

    const response = {
        launchMode: app.launchMode
    };

    callback(response);
};

Application.getWindow = function(identity) {
    let uuid = identity.uuid;

    return Window.wrap(uuid, uuid);
};

Application.grantAccess = function( /*action, callback, errorCallback*/ ) {
    console.warn('Deprecated');
};
Application.grantWindowAccess = function( /*action, windowName, callback, errorCallback*/ ) {
    console.warn('Deprecated');
};
Application.isRunning = function(identity /*, callback, errorCallback*/ ) {
    let uuid = identity && identity.uuid;
    return uuid && coreState.getAppRunningState(uuid) && !coreState.getAppRestartingState(uuid);
};
Application.pingChildWindow = function( /*name, callback, errorCallback*/ ) {
    console.warn('Deprecated');
};
Application.registerCustomData = function(identity, data, callback, errorCallback) {
    let app = Application.wrap(identity.uuid);

    if (!app) {
        errorCallback(new Error(`application with uuid ${identity.uuid} does not exist`));
    } else if (!rvmBus) {
        errorCallback(new Error('cannot connect to the RVM'));
    } else if (!data || !data.userId || !data.organization) {
        errorCallback(new Error('\'userId\' and \'organization\' fields are required to send custom data'));
    } else {
        let success = rvmBus.send('application', {
            action: 'register-custom-data',
            sourceUrl: app._configUrl,
            runtimeVersion: System.getVersion(),
            data
        });

        if (success) {
            callback();
        } else {
            errorCallback(new Error('there was an issue sending a message to the RVM'));
        }
    }
};

//TODO:Ricardo: This should be deprecated.
Application.removeEventListener = function(identity, type, listener /*, callback, errorCallback*/ ) {
    var app = Application.wrap(identity.uuid);

    ofEvents.removeListener(eventRoute(app.id, type), listener);
};

Application.removeTrayIcon = function(identity /*, callback, errorCallback*/ ) {
    const app = Application.wrap(identity.uuid);

    removeTrayIcon(app);
};

Application.restart = function(identity /*, callback, errorCallback*/ ) {
    let uuid = identity.uuid;
    const appObj = coreState.getAppObjByUuid(uuid);

    coreState.setAppRestartingState(uuid, true);

    try {
        Application.close(identity, true, () => {
            Application.run(identity, appObj._configUrl);
            ofEvents.once(eventRoute(uuid, 'initialized'), function() {
                coreState.setAppRestartingState(uuid, false);
            });
        });
    } catch (err) {
        coreState.setAppRestartingState(uuid, false);
        console.error(`Error restarting app <${uuid}>`);
        console.error(err.stack);
        throw err;
    }
};
Application.revokeAccess = function( /*action, callback, errorCallback*/ ) {
    console.warn('Deprecated');
};
Application.revokeWindowAccess = function( /*action, windowName, callback, errorCallback*/ ) {
    console.warn('Deprecated');
};

Application.run = function(identity, configUrl = '' /*, callback , errorCallback*/ ) {
    if (!identity) {
        return;
    }

    createAppObj(identity.uuid, null, configUrl);

    let uuid = identity.uuid,
        app = Application.wrap(uuid),
        appState = coreState.appByUuid(uuid),
        mainWindowOpts = _.clone(app._options),
        hideSplashTopic = eventRoute(uuid, 'hide-splashscreen'),
        eventListenerStrings = [],
        sourceUrl = appState.appObj._configUrl,
        hideSplashListener = () => {
            let rvmPayload = {
                action: 'hide-splashscreen',
                sourceUrl
            };

            if (rvmBus) {
                rvmBus.send('application', rvmPayload);
            }
        },
        appEventsForRVM = ['started', 'closed', 'ready', 'run-requested', 'crashed', 'error', 'not-responding', 'out-of-memory'],
        sendAppsEventsToRVMListener = (appEvent) => {
            if (!sourceUrl) {
                return; // Most likely an adapter, RVM can't do anything with what it didn't load(determined by sourceUrl) so ignore
            }
            let type = appEvent.type,
                rvmPayload = {
                    type,
                    sourceUrl
                };

            if (type === 'ready' || type === 'run-requested') {
                rvmPayload.hideSplashScreenSupported = true;
            } else if (type === 'closed') {

                // Don't send 'closed' event to RVM when app is restarting.
                // This solves the problem of apps not being able to make API
                // calls that rely on RVM and manifest URL
                if (appState.isRestarting) {
                    return;
                }

                rvmPayload.isClosing = coreState.shouldCloseRuntime([uuid]);
            }

            if (rvmBus) {
                rvmBus.send('application-event', JSON.stringify(rvmPayload));
            }
        };

    // if the runtime is in offline mode, the RVM still expects the
    // startup-url/config for communication
    let argo = coreState.argo;
    if (sourceUrl === argo['local-startup-url']) {
        sourceUrl = argo['startup-url'] || argo['config'];
    }

    if (coreState.getAppRunningState(uuid)) {
        if (coreState.sentFirstHideSplashScreen(uuid)) {
            // only resend if we've sent once before(meaning 1 window has shown)
            Application.emitHideSplashScreen(identity);
        }
        Application.emitRunRequested(identity);
        return;
    }

    // Set up RVM related listeners for events the RVM cares about
    ofEvents.on(hideSplashTopic, hideSplashListener);
    appEventsForRVM.forEach(appEvent => {
        ofEvents.on(eventRoute(uuid, appEvent), sendAppsEventsToRVMListener);
    });


    //for backwards compatibility main window needs to have name === uuid
    mainWindowOpts.name = uuid;

    coreState.setWindowObj(app.id, Window.create(app.id, mainWindowOpts));

    // fire the connected once the main window's dom is ready
    app.mainWindow.webContents.once('dom-ready', () => {

        var pid = app.mainWindow.webContents.processId;

        if (pid) {
            app._processInfo = new ProcessInfo(pid);
            // Must call once to start measuring CPU usage
            app._processInfo.getCpuUsage();
        }

        ofEvents.emit(eventRoute(uuid, 'connected'), {
            topic: 'application',
            type: 'connected',
            uuid
        });
    });

    // turn on plugins for the main window
    hasPlugins = convertOpts.convertToElectron(mainWindowOpts).webPreferences.plugins;

    // loadUrl will synchronously cause an event to be fired from the native side 'use-plugins-requested'
    // to determine whether plugins should be enabled. The event is handled at the top of the file
    app.mainWindow.loadURL(app._options.url);

    // give other windows a chance to not have plugins enabled
    hasPlugins = false;

    app.mainWindow.on('newListener', (eventString) => {
        eventListenerStrings.push(eventString);
    });

    // If you are the last app to close, take the runtime with you.
    // app will need to consider remote connections shortly...
    ofEvents.once(`window/closed/${uuid}-${uuid}`, () => {

        delete fetchingIcon[uuid];
        removeTrayIcon(app);

        ofEvents.emit(eventRoute(uuid, 'closed'), {
            topic: 'application',
            type: 'closed',
            uuid
        });

        eventListenerStrings.forEach(eventString => {
            app.mainWindow.removeAllListeners(eventString);
        });
        eventListenerStrings.length = 0;

        coreState.setAppRunningState(uuid, false);
        coreState.setSentFirstHideSplashScreen(uuid, false);

        ofEvents.removeAllListeners(hideSplashTopic);
        appEventsForRVM.forEach(appEvent => {
            ofEvents.removeListener(eventRoute(uuid, appEvent), sendAppsEventsToRVMListener);
        });

        coreState.removeApp(app.id);

        if (!runtimeIsClosing && coreState.shouldCloseRuntime()) {
            try {
                runtimeIsClosing = true;
                let appsToClose = coreState.getAllAppObjects();

                for (var i = appsToClose.length - 1; i >= 0; i--) {
                    let a = appsToClose[i];
                    if (a.uuid !== app.uuid) {
                        Application.close(a.identity, true);
                    }
                }
                rvmBus.closeTransport();

                // Force close any windows that have slipped past core-state
                BrowserWindow.getAllWindows().forEach(function(window) {
                    window.close();
                });

                // Unregister all shortcuts.
                globalShortcut.unregisterAll();

            } catch (err) {
                // comma separation seems to fail core side
                console.error('Error shutting down runtime');
                console.error(err);
                console.error(err.stack);
            } finally {
                electronApp.exit(0);
            }
        }
    });

    app.mainWindow.webContents.on('crashed', () => {
        ofEvents.emit(eventRoute(uuid, 'crashed'), {
            topic: 'application',
            type: 'crashed',
            uuid
        });

        ofEvents.emit(eventRoute(uuid, 'out-of-memory'), {
            topic: 'application',
            type: 'out-of-memory',
            uuid
        });
    });

    app.mainWindow.on('responsive', () => {
        ofEvents.emit(eventRoute(uuid, 'responding'), {
            topic: 'application',
            type: 'responding',
            uuid
        });
    });

    app.mainWindow.on('unresponsive', () => {
        ofEvents.emit(eventRoute(uuid, 'not-responding'), {
            topic: 'application',
            type: 'not-responding',
            uuid
        });
    });

    coreState.setAppRunningState(uuid, true);

    ofEvents.emit(eventRoute(uuid, 'started'), {
        topic: 'application',
        type: 'started',
        uuid
    });
};

Application.send = function( /*topic, message*/ ) {
    console.warn('Deprecated. Please use InterAppBus');
};

Application.setShortcuts = function(identity, config, callback, errorCallback) {
    let app = Application.wrap(identity.uuid);
    let manifestUrl = app && app._configUrl;

    if (manifestUrl) {
        // Only apps started from a manifest can retrieve shortcut configuration
        const options = {
            topic: 'application',
            action: 'set-shortcut-state',
            sourceUrl: manifestUrl,
            data: config
        };
        sendToRVM(options)
            .then(callback, errorCallback)
            .catch(errorCallback);
    } else {
        errorCallback(new Error('App must be started from a manifest to be able to change its shortcut configuration'));
    }
};


Application.setTrayIcon = function(identity, iconUrl, callback, errorCallback) {
    let {
        uuid
    } = identity;

    if (fetchingIcon[uuid]) {
        errorCallback(new Error('currently fetching icon'));
        return;
    }

    fetchingIcon[uuid] = true;

    let app = Application.wrap(identity.uuid);

    // only one tray icon per app
    // cleanup the old one so it can be replaced
    removeTrayIcon(app);

    let mainWindowIdentity = app.identity;

    iconUrl = Window.getAbsolutePath(mainWindowIdentity, iconUrl);

    cachedFetch(app.uuid, iconUrl, (error, iconFilepath) => {
        if (!error) {
            if (app) {
                const iconImage = nativeImage.createFromPath(iconFilepath);
                const icon = app.tray = new Tray(iconImage);
                const monitorInfo = MonitorInfo.getInfo('system-query');
                const clickedRoute = eventRoute(app.uuid, 'tray-icon-clicked');

                const getData = (bounds, source) => {
                    const data = {
                        x: bounds.x,
                        y: bounds.y,
                        bounds,
                        monitorInfo
                    };
                    return Object.assign(data, source);
                };

                const makeClickHandler = (button) => {
                    return (event, bounds) => {
                        ofEvents.emit(clickedRoute, getData(bounds, {
                            button
                        }));
                    };
                };

                const hoverHandler = (event, bounds) => {
                    ofEvents.emit(eventRoute(app.uuid, 'tray-icon-hovering'), getData(bounds));
                };

                const listenerSignatures = [
                    ['hover', hoverHandler],
                    ['click', makeClickHandler(0)],
                    ['middle-click', makeClickHandler(1)],
                    ['right-click', makeClickHandler(2)]
                ];

                listenerSignatures.forEach(signature => icon.on.apply(icon, signature));

                const unsubscribe = () => {
                    listenerSignatures.forEach(signature => icon.removeListener.apply(icon, signature));
                };
                subscriptionManager.registerSubscription(unsubscribe, app.identity, TRAY_ICON_KEY);

                if (typeof callback === 'function') {
                    callback();
                }
            }
        } else {
            if (typeof errorCallback === 'function') {
                errorCallback(error);
            }
        }

        fetchingIcon[uuid] = false;
    });
};


Application.getTrayIconInfo = function(identity, callback, errorCallback) {
    const app = Application.wrap(identity.uuid);
    const bounds = app && app.tray && app.tray.getIconRect();

    if (bounds) {
        callback({
            x: bounds.x,
            y: bounds.y,
            monitorInfo: MonitorInfo.getInfo('system-query'),
            bounds
        });
    } else {
        errorCallback(new Error('cannot get tray icon rect'));
    }
};


Application.scheduleRestart = function(identity, callback, errorCallback) {
    let app = Application.wrap(identity.uuid);

    if (!app) {
        errorCallback(new Error(`application with uuid ${identity.uuid} does not exist`));
    } else if (!rvmBus) {
        errorCallback(new Error('cannot connect to the RVM'));
    } else {
        let success = rvmBus.send('application', {
            action: 'relaunch-on-close',
            sourceUrl: app._configUrl,
            runtimeVersion: System.getVersion()
        });

        if (success) {
            callback();
        } else {
            errorCallback(new Error('there was an issue sending a message to the RVM'));
        }
    }
};

Application.terminate = function(identity, callback) {
    Application.close(identity, true, callback);
};

Application.emitHideSplashScreen = function(identity) {
    var uuid = identity && identity.uuid;
    if (uuid) {
        ofEvents.emit(eventRoute(uuid, 'hide-splashscreen'));
    }
};

Application.emitRunRequested = function(identity) {
    var uuid = identity && identity.uuid;
    if (uuid) {
        ofEvents.emit(eventRoute(uuid, 'run-requested'), {
            topic: 'application',
            type: 'run-requested',
            uuid
        });
    }
};

Application.wait = function( /*callback, errorCallback*/ ) {
    console.warn('Awaiting native implementation');
};

// support legacy notifyOnContentLoaded and notifyOnContentLoaded
var appLoadedListeners = {}; // target window identity => array of window Ids for listener
var appConnectedListeners = {}; // target window identity => array of window Ids for listener
function registerAppLoadedListener(targetIdentity, listenerIdentity) {
    let targetKey = `${targetIdentity.uuid}-${targetIdentity.name}`;
    let listenerKey = `${listenerIdentity.uuid}-${listenerIdentity.name}`;
    let listeners = appLoadedListeners[targetKey] || {};
    listeners[listenerKey] = listenerIdentity;
    appLoadedListeners[targetKey] = listeners;
}

function registerAppConnectedListener(targetIdentity, listenerIdentity) {
    let targetKey = `${targetIdentity.uuid}-${targetIdentity.name}`;
    let listenerKey = `${listenerIdentity.uuid}-${listenerIdentity.name}`;
    let listeners = appConnectedListeners[targetKey] || {};
    listeners[listenerKey] = listenerIdentity;
    appConnectedListeners[targetKey] = listeners;
}

function broadcastAppLoaded(targetIdentity) {
    if (targetIdentity && targetIdentity.uuid && targetIdentity.name) {
        let targetKey = `${targetIdentity.uuid}-${targetIdentity.name}`;
        let listeners = appLoadedListeners[targetKey];
        if (listeners) {
            let loadedMessage = {
                action: 'app-loaded',
                payload: {
                    appUuid: targetIdentity.uuid,
                    uuid: targetIdentity.uuid + targetIdentity.name,
                    name: targetIdentity.name
                }
            };

            _.each(listeners, listener => {
                //TODO: this needs to be refactored to look like the other event listeners.
                externalApiBase.sendToIdentity(listener, loadedMessage);
            });
        }
    }
}

function broadcastOnAppConnected(targetIdentity) {
    if (targetIdentity && targetIdentity.uuid && targetIdentity.name) {
        let targetKey = `${targetIdentity.uuid}-${targetIdentity.name}`;
        let listeners = appConnectedListeners[targetKey];
        if (listeners) {
            let connectedMessage = {
                action: 'app-connected',
                payload: {
                    appUuid: targetIdentity.uuid,
                    uuid: targetIdentity.uuid + targetIdentity.name,
                    name: targetIdentity.name
                }
            };

            _.each(listeners, listener => {
                //TODO: this needs to be refactored to look like the other event listeners.
                externalApiBase.sendToIdentity(listener, connectedMessage);
            });
        }
    }
}

ofEvents.on('window/dom-content-loaded/*', payload => {
    broadcastAppLoaded(payload.data[0]);
});
ofEvents.on('window/connected/*', payload => {
    broadcastOnAppConnected(payload.data[0]);
});

Application.notifyOnContentLoaded = function(target, identity) {
    registerAppLoadedListener(target, identity);
    console.warn('Deprecated. Please addEventListener');
};
Application.notifyOnAppConnected = function(target, identity) {
    registerAppConnectedListener(target, identity);
    console.warn('Deprecated. Please addEventListener');
};


function removeTrayIcon(app) {

    if (app && app.tray) {
        try {
            app.tray.destroy();
            app.tray = null;
            subscriptionManager.removeSubscription(app.identity, TRAY_ICON_KEY);

        } catch (e) {
            log.writeToLog(1, e, true);
        }
    }
}

function createAppObj(uuid, opts, configUrl = '') {
    let appObj;
    let app = coreState.appByUuid(uuid);
    if (app && app.appObj) {
        appObj = app.appObj;
    } else {
        if (!opts) {
            opts = app._options;
        }
        let _processInfo;
        let toShowOnRun = false;

        appObj = {
            _configUrl: configUrl,
            _options: opts,
            tray: null,
            uuid: opts.uuid,
            get identity() {
                return {
                    uuid: this.uuid,
                    name: this.uuid
                };
            },
            _processInfo,
            toShowOnRun
        };

        _.each(typeof opts.mainWindowOptions === 'object' && opts.mainWindowOptions, (value, key) => {
            switch (key) {
                case 'name':
                    break;
                case 'url':
                    // only copy over mainWindowOptions value if the opts value is invalid
                    if (isNonEmptyString(opts[key])) {
                        break;
                    }
                    /* falls through */
                default:
                    opts[key] = value;
            }
        });

        opts.url = opts.url || 'about:blank';

        if (!regex.isURL(opts.url) && !isURI(opts.url) && !opts.url.startsWith('about:') && !path.isAbsolute(opts.url)) {
            throw new Error(`Invalid URL supplied: ${opts.url}`);
        }

        let eOpts = convertOpts.convertToElectron(opts);

        // save the original value of autoShow, but set it false so we can
        // show only after the DOMContentLoaded event to prevent the flash
        opts.toShowOnRun = eOpts['autoShow'];
        eOpts.show = false;

        appObj.mainWindow = new BrowserWindow(eOpts);
        appObj.mainWindow.setFrameConnectStrategy(eOpts.frameConnect || 'last');
        appObj.id = appObj.mainWindow.id;

        appObj.mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
            if (isMainFrame) {
                if (errorCode === -3 || errorCode === 0) {
                    // 304 can trigger net::ERR_ABORTED, ignore it
                    log.writeToLog(1, `ignoring net error ${errorCode} for ${opts.uuid}`, true);
                } else {
                    log.writeToLog(1, `receiving net error ${errorCode} for ${opts.uuid}`, true);
                    if (!coreState.argo['noerrdialog'] && configUrl) {
                        // NOTE: don't show this dialog if the app is created via the api
                        const errorMessage = opts.loadErrorMessage || 'There was an error loading the application.';
                        dialog.showErrorBox('Fatal Error', errorMessage);
                    }
                    _.defer(() => {
                        Application.close({
                            uuid: opts.uuid
                        }, true);
                    });
                }
            }
        });

        // the name must match the uuid for apps to match 5.0
        opts.name = opts.uuid;

        appObj._options = opts;

        // Set application launch mode
        if (!configUrl) {
            // If the app doesn't have config url, then it
            // means it was started by an adapter

            appObj.launchMode = 'adapter';

        } else {
            // When an app starts with a config, ask RVM
            // about how that app was launched

            appObj.launchMode = undefined; // placeholder, will be overwritten once RVM responds

            sendToRVM({
                topic: 'application',
                action: 'launched-from',
                sourceUrl: configUrl
            }).then(response => {
                // RVM told us how the app was launched,
                // we now need to update the app props
                appObj.launchMode = response.source;
                coreState.setAppObj(appObj.id, appObj);
            }).catch(() => {
                // no-one is watching for errors, so just ignoring
            });
        }

        if (!app) {
            coreState.addApp(appObj.id, uuid);
            coreState.setAppOptions(opts, configUrl);
        } else {
            coreState.setAppId(uuid, appObj.id);
        }
        coreState.setAppObj(appObj.id, appObj);

        ofEvents.emit(eventRoute(uuid, 'created'), {
            topic: 'application',
            type: 'application-created',
            uuid
        });
    }
    return appObj;
}

function isURI(str) {
    return /^file:\/\/\/?/.test(str);
}

function isNonEmptyString(str) {
    return typeof str === 'string' && str.length > 0;
}

function eventRoute(id, name) {
    return `application/${name}/${id}`;
}

module.exports.Application = Application;
