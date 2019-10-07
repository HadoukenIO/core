/*
    src/browser/api/application.js
 */

// built-in modules
let os = require('os');
let path = require('path');
let electron = require('electron');
let queryString = require('querystring');
let url = require('url');
let BrowserWindow = electron.BrowserWindow;
let electronApp = electron.app;
let dialog = electron.dialog;
let globalShortcut = electron.globalShortcut;
let nativeImage = electron.nativeImage;
let ProcessInfo = electron.processInfo;
let Tray = electron.Tray;

// npm modules
let _ = require('underscore');

// local modules
let System = require('./system.js').System;
import { Window } from './window';
let convertOpts = require('../convert_options.js');
import * as coreState from '../core_state';
let externalApiBase = require('../api_protocol/api_handlers/api_protocol_base');
import { cachedFetch, fetchReadFile } from '../cached_resource_fetcher';
import ofEvents from '../of_events';
import WindowGroups from '../window_groups';
import { sendToRVM } from '../rvm/utils';
import { validateApplicationNavigation } from '../navigation_validation';
import * as log from '../log';
import SubscriptionManager from '../subscription_manager';
import route from '../../common/route';
import { isAboutPageUrl, isValidChromePageUrl, isFileUrl, isHttpUrl, isURLAllowed, getIdentityFromObject, isBase64 } from '../../common/main';
import { ERROR_BOX_TYPES } from '../../common/errors';
import { deregisterAllRuntimeProxyWindows } from '../window_groups_runtime_proxy';
import { releaseUuid } from '../uuid_availability';
import { launch } from '../../../js-adapter/src/main';
import { externalWindows } from './external_window';

const subscriptionManager = new SubscriptionManager();
const TRAY_ICON_KEY = 'tray-icon-events';
let runtimeIsClosing = false;
let hasPlugins = false;
let rvmBus;
let MonitorInfo;
export const Application = {};
let fetchingIcon = {};
let registeredUsersByApp = {};

// var OfEvents = [
//     'closed',
//     'error',
//     'crashed',
//     'not-responding',
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
    rvmBus = require('../rvm/rvm_message_bus').rvmMessageBus;
    log.writeToLog(1, 'RVM MESSAGE BUS READY', true);

    MonitorInfo = require('../monitor_info.js').default;

    // listen to and broadcast 'broadcast' messages from RVM as an openfin app event
    rvmBus.on(route.rvmMessageBus('broadcast', 'application', 'manifest-changed'), payload => {
        const manifests = payload && payload.manifests;
        if (manifests) {
            _.each(manifests, manifestObject => {
                var sourceUrl = manifestObject.sourceUrl;
                var json = manifestObject.json;
                var uuid = coreState.getUuidBySourceUrl(sourceUrl);
                if (uuid) {
                    ofEvents.emit(route.application('manifest-changed', uuid), sourceUrl, json);
                } else {
                    log.writeToLog(1, `Received manifest-changed event from RVM, unable to determine uuid from source url though: ${sourceUrl}`, true);
                }
            });
        } else {
            log.writeToLog(1, `Received manifest-changed event from RVM with invalid data object: ${payload}`, true);
        }
    });

    // listen to and process close-app requests originating from the RVM.
    rvmBus.on(route.rvmMessageBus('broadcast', 'application', 'close-app'), payload => {
        try {
            const { uuid } = payload;
            log.writeToLog('info', `received an RVM request to close application with uuid ${uuid}`);
            if (uuid) {
                Application.close({ uuid }, true);
                //we cannot wait for the callback here because of the shutdown sequence bug. also fire and forget mode.
                rvmBus.sendCloseAppRequested(payload);
            }
        } catch (err) {
            log.writeToLog('info', 'error processing RVM Request to close-app');
            log.writeToLog('info', err);
            rvmBus.sendCloseAppError(payload, err).catch(e => {
                log.writeToLog('info', 'error sending close app response to RVM');
                log.writeToLog('info', err);
            });
        }
    });

});

Application.create = function(opts, configUrl = '', parentIdentity = {}) {
    //Hide Window until run is called

    let appUrl;
    const { uuid, name, customFrame } = opts;

    if (customFrame) {
        convertOpts.toCustomFrame(opts);
    }

    appUrl = opts.url;
    const initialAppOptions = Object.assign({}, opts);

    if (appUrl === undefined && opts.mainWindowOptions) {
        appUrl = opts.mainWindowOptions.url;
    }

    // undefined or '' acceptable here (gets default in createAppObj); or non-empty string
    const isValidUrl = appUrl === undefined || typeof appUrl === 'string';
    if (!isValidUrl) {
        throw new Error(`Invalid application URL: ${appUrl}`);
    }

    const isValidUuid = isNonEmptyString(uuid) && uuid !== '*';
    if (!isValidUuid) {
        throw new Error(`Invalid application UUID: ${uuid}`);
    }

    const isValidName = isNonEmptyString(name) && name !== '*';
    if (!isValidName) {
        throw new Error(`Invalid application name: ${name}`);
    }

    const isAppRunning = coreState.getAppRunningState(uuid) || coreState.getExternalAppObjByUuid(uuid);
    if (isAppRunning) {
        throw new Error(`Application with specified UUID already exists: ${uuid}`);
    }

    const parentUuid = parentIdentity && parentIdentity.uuid;
    if (!validateApplicationNavigation(appUrl, uuid, opts, parentUuid)) {
        throw new Error(`Application with specified URL is not allowed: ${opts.appUrl}`);
    }

    const existingApp = coreState.appByUuid(uuid);
    if (existingApp) {
        coreState.removeApp(existingApp.id);
    }

    const appObj = createAppObj(uuid, opts, configUrl);
    const app = coreState.appByUuid(opts.uuid);

    if (parentIdentity && parentIdentity.uuid) {
        // This is a reference to the meta `app` object that is stored in core state,
        // not the actual `application` object created above. Here we are attaching the parent
        // identity to it.
        app.parentUuid = parentUuid;
    }
    app.initialAppOptions = initialAppOptions;

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
    let eventString = route.application(appEvent, uuid);
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
Application.destroy = function(identity, ack, nack) {
    if (coreState.getAppRunningState(identity.uuid)) {
        nack('Cannot destroy a running application');
    } else {
        coreState.deleteApp(identity.uuid);
        ack();
    }
};
Application.getChildWindows = function(identity /*, callback, errorCallback*/ ) {
    const uuid = identity.uuid;
    const appError = checkApplicationAvailability(uuid);

    if (appError) {
        throw new Error(appError);
    } else {
        const app = Application.wrap(uuid);
        return coreState.getChildrenByApp(app.id);
    }
};

Application.getGroups = function( /* callback, errorCallback*/ ) {
    return WindowGroups.getGroups();
};

Application.getManifest = function(identity, manifestUrl, callback, errCallback) {
    // When manifest URL is not provided, get the manifest for the current application
    if (!manifestUrl) {
        const appObject = coreState.getAppObjByUuid(identity.uuid);
        manifestUrl = appObject && appObject._configUrl;
    }

    if (manifestUrl) {
        const configObj = coreState.getManifestByUrl(manifestUrl);
        if (configObj) {
            callback(configObj);
        } else {
            fetchReadFile(manifestUrl, true)
                .then(callback)
                .catch(errCallback);
        }
    } else {
        errCallback(new Error('App not started from manifest'));
    }
};

Application.getParentApplication = function(identity) {
    const app = coreState.appByUuid(identity.uuid);
    const {
        parentUuid
    } = app || {};

    return parentUuid;
};

Application.getZoomLevel = function(identity, callback) {
    const uuid = identity.uuid;
    const appError = checkApplicationAvailability(uuid);

    if (appError) {
        throw new Error(appError);
    } else {
        const app = coreState.appByUuid(uuid);
        Window.getZoomLevel(app.appObj.identity, callback);
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

Application.getInfo = function(identity, callback) {
    const app = coreState.appByUuid(identity.uuid);

    const manifestObj = coreState.getClosestManifest(identity);
    const { url, manifest } = manifestObj || {};

    const parentUuid = Application.getParentApplication(identity);
    const launchMode = app && app.appObj && app.appObj.launchMode;

    const response = {
        initialOptions: app.initialAppOptions,
        launchMode,
        manifestUrl: url,
        manifest,
        parentUuid,
        runtime: {
            version: System.getRuntimeInfo(identity).version
        }
    };

    callback(response);
};

Application.getWindow = function(identity) {
    let uuid = identity.uuid;

    return coreState.getWindowByUuidName(uuid, uuid);
};

Application.grantAccess = function() {
    console.warn('Deprecated');
};
Application.grantWindowAccess = function() {
    console.warn('Deprecated');
};
Application.isRunning = function(identity) {
    let uuid = identity && identity.uuid;
    return !!(uuid && coreState.getAppRunningState(uuid) && !coreState.getAppRestartingState(uuid));
};
Application.pingChildWindow = function() {
    console.warn('Deprecated');
};
Application.registerUser = function(identity, userName, appName, callback, errorCallback) {
    const uuid = identity.uuid;
    const app = coreState.getAppByUuid(uuid) || coreState.getExternalAppObjByUuid(uuid);

    if (!app) {
        errorCallback(new Error(`application with uuid ${uuid} does not exist`));
        return;
    }

    const licenseKey = app.licenseKey;
    const configUrl = coreState.getConfigUrlByUuid(uuid);

    if (!licenseKey) {
        errorCallback(new Error(`application with uuid ${uuid} has no licenseKey specified`));
    } else if (!configUrl) {
        errorCallback(new Error(`application with uuid ${uuid} has no _configUrl specified`));
    } else if (!rvmBus) {
        errorCallback(new Error('cannot connect to the RVM'));
    } else if (!userName) {
        errorCallback(new Error('\'userId\' field is required to register user'));
    } else if (!appName) {
        errorCallback(new Error('\'appName\' field is required to register user'));
    } else if (userName.length > 128) {
        errorCallback(new Error('\'userName\' is too long; must be <= 128 characters'));
    } else if (appName.length > 32) {
        errorCallback(new Error('\'appName\' is too long; must be <= 32 characters'));
    } else if (uuid in registeredUsersByApp && registeredUsersByApp[uuid].has(userName)) {
        errorCallback(new Error(`userName ${userName} is already registered for appName ${appName} with app uuid ${uuid}`));
    } else {
        if (!(uuid in registeredUsersByApp)) {
            registeredUsersByApp[uuid] = new Set();
        }
        registeredUsersByApp[uuid].add(userName);

        sendToRVM({
                topic: 'application',
                action: 'register-user',
                sourceUrl: configUrl,
                runtimeVersion: System.getVersion(),
                payload: {
                    userName: userName,
                    appName: appName
                }
            }).then(callback, errorCallback)
            .catch(errorCallback);
    }
};

//TODO:Ricardo: This should be deprecated.
Application.removeEventListener = function(identity, type, listener) {
    var app = Application.wrap(identity.uuid);

    ofEvents.removeListener(route.application(type, app.id), listener);
};

Application.removeTrayIcon = function(identity) {
    const app = Application.wrap(identity.uuid);

    removeTrayIcon(app);
};

Application.restart = function(identity) {
    const uuid = identity.uuid;
    const appError = checkApplicationAvailability(uuid);

    if (appError) {
        throw new Error(appError);
    }

    const appObj = coreState.getAppObjByUuid(uuid);

    coreState.setAppRestartingState(uuid, true);

    try {
        Application.close(identity, true, () => {
            Application.run(identity, appObj._configUrl);
            ofEvents.once(route.application('initialized', uuid), function() {
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

Application.revokeAccess = function() {
    console.warn('Deprecated');
};

Application.revokeWindowAccess = function() {
    console.warn('Deprecated');
};

// userAppConfigArgs must be set to 'undefined' because
// regular parameters cannot come after default parameters.
Application.run = function(identity, configUrl = '', userAppConfigArgs = undefined) {
    if (!identity) {
        return;
    }

    const app = createAppObj(identity.uuid, null, configUrl);
    const mainWindowOpts = convertOpts.convertToElectron(app._options);

    run(identity, mainWindowOpts, userAppConfigArgs);
};

function run(identity, mainWindowOpts, userAppConfigArgs) {
    const windowIdentity = getIdentityFromObject(mainWindowOpts);
    const uuid = identity.uuid;
    const appWasAlreadyRunning = coreState.getAppRunningState(uuid);
    const app = Application.wrap(uuid);
    const appState = coreState.appByUuid(uuid);
    let sourceUrl = appState.appObj._configUrl;
    const hideSplashTopic = route.application('hide-splashscreen', uuid);
    const eventListenerStrings = [];
    const hideSplashListener = () => {
        let rvmPayload = {
            topic: 'application',
            action: 'hide-splashscreen',
            sourceUrl
        };

        if (rvmBus) {
            rvmBus.publish(rvmPayload);
        }
    };

    // First check the local option set for any license info, then check
    // if any license info was stamped on the meta app obj (this is the case
    // when the app was manifest launched), finally check the parent's meta
    // obj. If any is found assign this to the current app's meta object. This
    // will ensure it is carried forward to and descendant app launches.
    const genLicensePayload = () => {
        let licenseKey = mainWindowOpts.licenseKey;

        licenseKey = licenseKey || coreState.getLicenseKey({ uuid });
        licenseKey = licenseKey || coreState.getLicenseKey({ uuid: appState.parentUuid });

        coreState.setLicenseKey({ uuid }, licenseKey);

        const parentUuid = appState.parentUuid || null;

        let parentConfigUrl = null;
        if (parentUuid) {
            parentConfigUrl = coreState.getConfigUrlByUuid(parentUuid);
        }

        return {
            licenseKey,
            uuid,
            client: {
                type: 'js'
            },
            parentApp: {
                uuid: parentUuid,
                configUrl: parentConfigUrl
            }
        };
    };
    const appEventsForRVM = ['closed', 'ready', 'run-requested', 'crashed', 'error', 'not-responding'];
    const appStartedHandler = () => {
        rvmBus.registerLicenseInfo({ data: genLicensePayload() }, sourceUrl);
    };
    const sendAppsEventsToRVMListener = (appEvent) => {
        if (!sourceUrl) {
            return; // Most likely an adapter, RVM can't do anything with what it didn't load(determined by sourceUrl) so ignore
        }
        let type = appEvent.type,
            rvmPayload = {
                topic: 'application-event',
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
            rvmBus.publish(rvmPayload);
        }
    };

    // if the runtime is in offline mode, the RVM still expects the
    // startup-url/config for communication
    let argo = coreState.argo;
    if (sourceUrl === argo['local-startup-url']) {
        sourceUrl = argo['startup-url'] || argo['config'];
    }

    if (appWasAlreadyRunning) {
        if (coreState.sentFirstHideSplashScreen(uuid)) {
            // only resend if we've sent once before(meaning 1 window has shown)
            Application.emitHideSplashScreen(identity);
        }

        Application.emitRunRequested(identity, queryString.parse(userAppConfigArgs));
        return;
    }

    // Set up RVM related listeners for events the RVM cares about
    ofEvents.on(hideSplashTopic, hideSplashListener);
    ofEvents.on(route.application('started', uuid), appStartedHandler);
    appEventsForRVM.forEach(appEvent => {
        ofEvents.on(route.application(appEvent, uuid), sendAppsEventsToRVMListener);
    });


    //for backwards compatibility main window needs to have name === uuid
    mainWindowOpts = Object.assign({}, mainWindowOpts, { name: uuid }); //avoid mutating original object

    const win = Window.create(app.id, mainWindowOpts);
    coreState.setWindowObj(app.id, win);

    // fire the connected once the main window's dom is ready
    app.mainWindow.webContents.once('dom-ready', () => {
        //edge case where the window might be destroyed by the time we get here.
        if (!app.mainWindow.isDestroyed()) {
            const pid = app.mainWindow.webContents.processId;

            if (pid) {
                app._processInfo = new ProcessInfo(pid);

                // Must call once to start measuring CPU usage
                app._processInfo.getCpuUsage();
            }

            ofEvents.emit(route.application('connected', uuid), { topic: 'application', type: 'connected', uuid });
        } else {
            //Window was closed before constructor
            const constructorCallbackMessage = {
                success: false,
                data: {
                    message: 'Window closed before web context initiatiated'
                }
            };
            ofEvents.emit(route.window('fire-constructor-callback', uuid, uuid), constructorCallbackMessage);
        }
    });

    // function finish() {
    // turn on plugins for the main window
    hasPlugins = convertOpts.convertToElectron(mainWindowOpts).webPreferences.plugins;

    // give other windows a chance to not have plugins enabled
    hasPlugins = false;

    app.mainWindow.on('newListener', (eventString) => {
        eventListenerStrings.push(eventString);
    });

    // If you are the last app to close, take the runtime with you.
    // app will need to consider remote connections shortly...
    ofEvents.once(route.window('closed', uuid, uuid), () => {
        delete fetchingIcon[uuid];
        removeTrayIcon(app);
        releaseUuid(uuid);
        if (uuid in registeredUsersByApp) {
            delete registeredUsersByApp[uuid];
        }

        ofEvents.emit(route.application('closed', uuid), { topic: 'application', type: 'closed', uuid });

        eventListenerStrings.forEach(eventString => {
            app.mainWindow.removeAllListeners(eventString);
        });
        eventListenerStrings.length = 0;

        coreState.setAppRunningState(uuid, false);
        coreState.setSentFirstHideSplashScreen(uuid, false);

        ofEvents.removeAllListeners(hideSplashTopic);
        appEventsForRVM.forEach(appEvent => {
            ofEvents.removeListener(route.application(appEvent, uuid), sendAppsEventsToRVMListener);
        });
        ofEvents.removeListener(route.application('started', uuid), appStartedHandler);

        coreState.removeApp(app.id);

        const shouldCloseRuntime =
            app._options._type !== ERROR_BOX_TYPES.RENDERER_CRASH &&
            !app._options._runtimeAuthDialog &&
            !runtimeIsClosing &&
            coreState.shouldCloseRuntime() &&
            process.platform !== 'darwin';

        if (shouldCloseRuntime) {
            try {
                runtimeIsClosing = true;
                let appsToClose = coreState.getAllAppObjects();

                for (var i = appsToClose.length - 1; i >= 0; i--) {
                    let a = appsToClose[i];
                    if (a.uuid !== app.uuid) {
                        Application.close(a.identity, true);
                    }
                }

                //deregister all proxy windows
                deregisterAllRuntimeProxyWindows();

                // Release all external windows to prevent bringing them
                // down when the runtime closes.
                externalWindows.forEach((nativeWindow) => {
                    nativeWindow.setExternalWindowNativeId('');
                });

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

    const { preloadScripts } = mainWindowOpts;
    const loadUrl = () => {
        app.mainWindow.loadURL(app._options.url);
        ofEvents.emit(route.application('started', uuid), { topic: 'application', type: 'started', uuid });
    };
    coreState.setAppRunningState(uuid, true);
    if (isValidChromePageUrl(app._options.url) || appWasAlreadyRunning) {
        loadUrl();
        // no API injection for chrome pages, so call .show here
        app.mainWindow.show();
    } else {
        System.downloadPreloadScripts(windowIdentity, preloadScripts)
            .catch((error) => {
                log.writeToLog(1, 'Error while downloading preload scripts for identity ' +
                    `${uuid}-${name} on app run. Will proceed running the app. ` +
                    `Error received: ${error}`, true);
            })
            .then(loadUrl);
    }
}

/**
 * Run an application via RVM Call
 */
Application.runWithRVM = function(manifestUrl, appIdentity, opts = {}) {
    const { uuid } = appIdentity;
    // on mac/linux, launch the app, else hand off to RVM
    if (os.platform() !== 'win32') {
        return launch({ manifestUrl: manifestUrl });
    } else {
        if (opts.userAppConfigArgs) {
            opts.userAppConfigArgsStr = new url.URLSearchParams(opts.userAppConfigArgs).toString();
            delete opts.userAppConfigArgs;
        }
        return sendToRVM({
            topic: 'application',
            action: 'launch-app',
            sourceUrl: coreState.getConfigUrlByUuid(uuid),
            data: {
                configUrl: manifestUrl,
                rvmLaunchOptions: opts
            }
        });
    }
};

/**
 * Run an application via RVM
 */
Application.batchRunWithRVM = function(identity, manifestUrls) {
    return sendToRVM({
        topic: 'application',
        action: 'launch-apps',
        sourceUrl: coreState.getConfigUrlByUuid(identity.uuid),
        data: {
            configUrlArray: manifestUrls
        }
    });
};

Application.send = function() {
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

Application.setAppLogUsername = function(identity, username) {
    let app = Application.wrap(identity.uuid);

    const options = {
        topic: 'application',
        action: 'application-log-username',
        sourceUrl: app._configUrl,
        data: { 'userName': username }
    };
    return sendToRVM(options);
};


Application.setTrayIcon = function(identity, iconUrl, callback, errorCallback) {
    let { uuid } = identity;

    if (fetchingIcon[uuid]) {
        errorCallback(new Error('currently fetching icon'));
        return;
    }

    fetchingIcon[uuid] = true;

    const appError = checkApplicationAvailability(uuid);
    if (appError) {
        errorCallback(new Error(appError));
    }

    const app = Application.wrap(uuid);

    // only one tray icon per app
    // cleanup the old one so it can be replaced
    removeTrayIcon(app);

    const mainWindowIdentity = app.identity;

    if (!isBase64(iconUrl)) {
        iconUrl = Window.getAbsolutePath(mainWindowIdentity, iconUrl);
    }

    cachedFetch(mainWindowIdentity, iconUrl, (error, iconFilepath) => {
        if (!error) {
            if (app) {
                let iconImage;
                if (isBase64(iconUrl)) {
                    const imageBuf = Buffer.from(iconUrl, 'base64');
                    iconImage = nativeImage.createFromBuffer(imageBuf);
                } else {
                    iconImage = nativeImage.createFromPath(iconFilepath);
                }
                const icon = app.tray = new Tray(iconImage);
                const monitorInfo = MonitorInfo.getInfo('system-query');
                const clickedRoute = route.application('tray-icon-clicked', app.uuid);

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
                    ofEvents.emit(route.application('tray-icon-hovering', app.uuid), getData(bounds));
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

Application.setZoomLevel = function(identity, level) {
    const uuid = identity.uuid;
    const appError = checkApplicationAvailability(uuid);

    if (appError) {
        throw new Error(appError);
    } else {
        const app = coreState.appByUuid(uuid);

        // set zoom level for each child window
        app.children.forEach(function(childWindow) {
            const childWindowIdentity = {
                name: childWindow.openfinWindow.name,
                uuid: childWindow.openfinWindow.uuid
            };
            Window.setZoomLevel(childWindowIdentity, level);
        });
    }
};

Application.sendApplicationLog = function(identity) {
    let app = Application.wrap(identity.uuid);

    const options = {
        topic: 'application',
        action: 'application-log-send',
        sourceUrl: app._configUrl
    };

    return sendToRVM(options);
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
    const uuid = identity.uuid;
    const appError = checkApplicationAvailability(uuid);

    if (appError) {
        errorCallback(new Error(appError));
    } else if (!rvmBus) {
        errorCallback(new Error('cannot connect to the RVM'));
    } else {
        const app = Application.wrap(uuid);
        const success = rvmBus.publish({
            topic: 'application',
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
        ofEvents.emit(route.application('hide-splashscreen', uuid));
    }
};

Application.emitRunRequested = function(identity, userAppConfigArgs) {
    const uuid = identity && identity.uuid;
    if (uuid) {
        ofEvents.emit(route.application('run-requested', uuid), {
            topic: 'application',
            type: 'run-requested',
            uuid,
            userAppConfigArgs
        });
    }
};

Application.wait = function() {
    console.warn('Awaiting native implementation');
};
Application.getViews = getViews;

function getViews(identity) {
    const app = coreState.getAppByUuid(identity.uuid);
    return app ? app.views.map(({ uuid, name }) => ({ uuid, name })) : [];
}

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

ofEvents.on(route.window('dom-content-loaded', '*'), payload => {
    broadcastAppLoaded(payload.data[0]);
});

ofEvents.on(route.window('connected', '*'), payload => {
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

        const isValidUrl = isValidChromePageUrl(opts.url) || isHttpUrl(opts.url) || isFileUrl(opts.url) ||
            isAboutPageUrl(opts.url) || path.isAbsolute(opts.url);
        if (!isValidUrl || !isURLAllowed(opts.url)) {
            throw new Error(`Invalid URL supplied: ${opts.url}`);
        }

        let eOpts = convertOpts.convertToElectron(opts);

        // save the original value of autoShow, but set it false so we can
        // show only after the DOMContentLoaded event to prevent the flash
        opts.toShowOnRun = eOpts['autoShow'];
        eOpts.show = false;

        appObj.mainWindow = new BrowserWindow(eOpts);
        appObj.mainWindow.setFrameConnectStrategy(eOpts.frameConnect || 'last');
        appObj.id = appObj.mainWindow.webContents.id;

        appObj.mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
            if (isMainFrame) {
                if (errorCode === -3 || errorCode === 0) {
                    // 304 can trigger net::ERR_ABORTED, ignore it
                    log.writeToLog(1, `ignoring net error ${errorCode} for ${opts.uuid}`, true);
                } else {
                    log.writeToLog(1, `receiving net error ${errorCode} for ${opts.uuid}`, true);
                    if (!coreState.argo['noerrdialogs'] && configUrl) {
                        const errorMsgForDialog = errorDescription || `error code ${ errorCode }`;
                        // NOTE: don't show this dialog if the app is created via the api
                        const errorMessage = opts.loadErrorMessage || `There was an error loading the application: ${ errorMsgForDialog }`;
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

        ofEvents.emit(route.application('created', uuid), {
            topic: 'application',
            type: 'application-created',
            uuid
        });
    }
    return appObj;
}

function isNonEmptyString(str) {
    return typeof str === 'string' && str.length > 0;
}

function checkApplicationAvailability(uuid) {
    const app = Application.wrap(uuid);
    if (!app) {
        return `application with uuid '${uuid}' does not exist`;
    } else {
        return null;
    }
}
