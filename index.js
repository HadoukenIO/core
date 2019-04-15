/*
  index.js
*/

// built\-in modules
let fs = require('fs');
let path = require('path');
let electron = require('electron');
let os = require('os');
let app = electron.app; // Module to control application life.
let BrowserWindow = electron.BrowserWindow;
let crashReporter = electron.crashReporter;
let globalShortcut = electron.globalShortcut;
let ipc = electron.ipcMain;
let Menu = electron.Menu;

// npm modules
let _ = require('underscore');
let minimist = require('minimist');

// local modules
let Application = require('./src/browser/api/application.js').Application;
let System = require('./src/browser/api/system.js').System;
import { Window } from './src/browser/api/window';

let apiProtocol = require('./src/browser/api_protocol');
import socketServer from './src/browser/transports/socket_server';

import { addPendingAuthRequests, createAuthUI } from './src/browser/authentication_delegate';
let convertOptions = require('./src/browser/convert_options.js');
let coreState = require('./src/browser/core_state.js');
let webRequestHandlers = require('./src/browser/web_request_handler.js');
let errors = require('./src/common/errors.js');
import ofEvents from './src/browser/of_events';
import {
    portDiscovery
} from './src/browser/port_discovery';

import { reservedHotKeys } from './src/browser/api/global_hotkey';

import {
    default as connectionManager,
    meshEnabled,
    getMeshUuid,
    isMeshEnabledRuntime
} from './src/browser/connection_manager';

import * as log from './src/browser/log';

import {
    applyAllRemoteSubscriptions
} from './src/browser/remote_subscriptions';
import route from './src/common/route';

import { createWillDownloadEventListener } from './src/browser/api/file_download';
import duplicateUuidTransport from './src/browser/duplicate_uuid_delegation';
import { deleteApp, argv } from './src/browser/core_state';
import { lockUuid } from './src/browser/uuid_availability';

// locals
let firstApp = null;
let rvmBus;
let otherInstanceRunning = false;
let appIsReady = false;
const deferredLaunches = [];
let resolveServerReady;
const serverReadyPromise = new Promise((resolve) => {
    resolveServerReady = () => resolve();
});

app.on('child-window-created', function(parentId, childId, childOptions) {

    if (!coreState.addChildToWin(parentId, childId)) {
        console.warn('failed to add');
    }

    Window.create(childId, childOptions);
});

app.on('select-client-certificate', function(event, webContents, url, list, callback) {
    // No need to choose if there are
    // fewer than two certificates
    if (list.length < 2) {
        return;
    }

    event.preventDefault();

    let clientCertDialog = new BrowserWindow({
        width: 450,
        height: 280,
        show: false,
        frame: false,
        skipTaskbar: true,
        resizable: false,
        alwaysOnTop: true,
        webPreferences: {
            nodeIntegration: true,
            openfinIntegration: false
        }
    });

    let ipcUuid = app.generateGUID();
    let ipcTopic = 'client-certificate-selection/' + ipcUuid;

    function resolve(cert) {
        cleanup();
        callback(cert);
    }

    function cleanup() {
        ipc.removeListener(ipcTopic, onClientCertificateSelection);
        clientCertDialog.removeListener('closed', onClosed);
    }

    function onClientCertificateSelection(event, index) {
        if (index >= 0 && index < list.length) {
            resolve(list[index]);
            clientCertDialog.close();
        }
    }

    function onClosed() {
        resolve({}); // NOTE: Will cause a page load failure
    }

    ipc.on(ipcTopic, onClientCertificateSelection);
    clientCertDialog.on('closed', onClosed);

    let params = '?url=' + encodeURIComponent(url) + '&uuid=' + encodeURIComponent(ipcUuid) + '&certs=' + encodeURIComponent(_.pluck(list, 'issuerName'));
    clientCertDialog.loadURL(path.resolve(__dirname, 'assets', 'certificate.html') + params);
});

portDiscovery.on(route.runtime('launched'), (portInfo) => {
    //check if the ports match:
    const myPortInfo = coreState.getSocketServerState();
    const myUuid = getMeshUuid();

    log.writeToLog('info', `Port discovery message received ${JSON.stringify(portInfo)}`);

    //TODO include old runtimes in the determination.
    if (meshEnabled && portInfo.port !== myPortInfo.port && isMeshEnabledRuntime(portInfo)) {

        connectionManager.connectToRuntime(myUuid, portInfo).then((runtimePeer) => {
            //one connected we broadcast our port discovery message.
            staggerPortBroadcast(myPortInfo);
            log.writeToLog('info', `Connected to runtime ${JSON.stringify(runtimePeer.portInfo)}`);

            applyAllRemoteSubscriptions(runtimePeer);

        }).catch(err => {
            log.writeToLog('info', `Failed to connect to runtime ${JSON.stringify(portInfo)}, ${JSON.stringify(errors.errorToPOJO(err))}`);
        });
    }
});

includeFlashPlugin();

// Opt in to launch crash reporter
initializeCrashReporter(coreState.argo);

initializeDiagnosticReporter(coreState.argo);

// Safe errors initialization
errors.initSafeErrors(coreState.argo);

// Has a local copy of an app config
if (coreState.argo['local-startup-url']) {
    try {
        // Use this version of the fs module because the decorated version checks if the file
        // has a matching signature file
        const originalFs = require('original-fs');
        let localConfig = JSON.parse(originalFs.readFileSync(coreState.argo['local-startup-url']));

        if (typeof localConfig['devtools_port'] === 'number') {
            if (!coreState.argo['remote-debugging-port']) {
                log.writeToLog(1, `remote-debugging-port: ${localConfig['devtools_port']}`, true);
                app.commandLine.appendSwitch('remote-debugging-port', localConfig['devtools_port'].toString());
            } else {
                log.writeToLog(1, 'Ignoring devtools_port from manifest', true);
            }
        }
    } catch (err) {
        log.writeToLog(1, err, true);
    }
}

const handleDelegatedLaunch = function(commandLine) {
    let otherInstanceArgo = minimist(commandLine);

    initializeCrashReporter(otherInstanceArgo);
    log.writeToLog('info', 'handling delegated launch with the following args');
    log.writeToLog('info', JSON.stringify(otherInstanceArgo));

    // delegated args from a second instance
    launchApp(otherInstanceArgo, false);

    // Will queue if server is not ready.
    serverReadyPromise.then(() => {
        const socketServerState = coreState.getSocketServerState();
        const portInfo = portDiscovery.getPortInfoByArgs(otherInstanceArgo, socketServerState.port);
        portDiscovery.broadcast(portInfo);
    });

    // command line flag --delete-cache-on-exit
    rvmCleanup(otherInstanceArgo);

    return true;
};

function handleDeferredLaunches() {
    deferredLaunches.forEach((commandLine) => {
        handleDelegatedLaunch(commandLine);
    });

    deferredLaunches.length = 0;
}

app.on('chrome-browser-process-created', function() {
    otherInstanceRunning = app.makeSingleInstance((commandLine) => {
        log.writeToLog(1, `chrome-browser-process-created callback ${commandLine}`, true);
        const socketServerState = coreState.getSocketServerState();
        if (appIsReady && socketServerState && socketServerState.port) {
            return handleDelegatedLaunch(commandLine);
        } else {
            deferredLaunches.push(commandLine);
            return true;
        }
    });

    if (otherInstanceRunning) {
        if (appIsReady) {
            deleteProcessLogfile(true);
        }

        app.commandLine.appendArgument('noerrdialogs');
        process.argv.push('--noerrdialogs');
        app.exit(0);

        return;
    }
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', function() {
    appIsReady = true;

    if (otherInstanceRunning) {
        deleteProcessLogfile(true);

        app.quit();

        return;
    }

    app.registerNamedCallback('convertToElectron', convertOptions.convertToElectron);
    app.registerNamedCallback('getWindowOptionsById', coreState.getWindowOptionsById);

    if (process.platform === 'win32') {
        log.writeToLog('info', `group-policy build: ${process.buildFlags.groupPolicy}`);
        log.writeToLog('info', `enable-chromium build: ${process.buildFlags.enableChromium}`);
    }
    log.writeToLog('info', `build architecture: ${process.arch}`);
    app.vlog(1, 'process.versions: ' + JSON.stringify(process.versions, null, 2));

    rvmBus = require('./src/browser/rvm/rvm_message_bus').rvmMessageBus;


    app.allowNTLMCredentialsForAllDomains(true);

    if (process.platform === 'win32') {
        let integrityLevel = app.getIntegrityLevel();
        System.log('info', `Runtime integrity level of the app: ${integrityLevel}`);
    }

    rotateLogs(coreState.argo);

    migrateCookies();

    migrateLocalStorage(coreState.argo);

    //Once we determine we are the first instance running we setup the API's
    //Create the new Application.
    initServer();
    duplicateUuidTransport.init(handleDelegatedLaunch);
    webRequestHandlers.initHandlers();

    launchApp(coreState.argo, true);

    registerShortcuts();
    registerMacMenu();

    app.on('activate', function() {
        // On OS X it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        launchApp(coreState.argo, true);
    });

    //subscribe to auth requests:
    app.on('login', (event, webContents, request, authInfo, callback) => {
        let browserWindow = webContents.getOwnerBrowserWindow();
        let ofWindow = coreState.getWinById(browserWindow.id).openfinWindow;

        let identity = {
            name: ofWindow._options.name,
            uuid: ofWindow._options.uuid
        };
        const windowEvtName = route.window('auth-requested', identity.uuid, identity.name);
        const appEvtName = route.application('window-auth-requested', identity.uuid);

        addPendingAuthRequests(identity, authInfo, callback);
        if (ofEvents.listeners(windowEvtName).length < 1 && ofEvents.listeners(appEvtName).length < 1) {
            createAuthUI(identity);
        } else {
            ofEvents.emit(windowEvtName, {
                topic: 'window',
                type: 'auth-requested',
                uuid: identity.uuid,
                name: identity.name,
                authInfo: authInfo
            });
        }

        event.preventDefault();

    });

    // native code in AtomRendererClient::ShouldFork
    app.on('enable-chromium-renderer-fork', event => {
        // @TODO it should be an option for app, not runtime->arguments
        if (coreState.argo['enable-chromium-renderer-fork']) {
            app.vlog(1, 'applying Chromium renderer fork');
            event.preventDefault();
        }
    });

    rvmBus.on(route.rvmMessageBus('broadcast', 'download-asset', 'progress'), payload => {
        if (payload) {
            ofEvents.emit(route.system(`asset-download-progress-${payload.downloadId}`), {
                totalBytes: payload.totalBytes,
                downloadedBytes: payload.downloadedBytes
            });
        }
    });

    rvmBus.on(route.rvmMessageBus('broadcast', 'download-asset', 'error'), payload => {
        if (payload) {
            ofEvents.emit(route.system(`asset-download-error-${payload.downloadId}`), {
                reason: payload.error,
                err: errors.errorToPOJO(new Error(payload.error))
            });
        }
    });

    rvmBus.on(route.rvmMessageBus('broadcast', 'download-asset', 'complete'), payload => {
        if (payload) {
            ofEvents.emit(route.system(`asset-download-complete-${payload.downloadId}`), {
                path: payload.path
            });
        }
    });

    rvmBus.on(route.rvmMessageBus('broadcast', 'application', 'runtime-download-progress'), payload => {
        if (payload) {
            ofEvents.emit(route.system(`runtime-download-progress-${ payload.downloadId }`), payload);
        }
    });

    rvmBus.on(route.rvmMessageBus('broadcast', 'application', 'runtime-download-error'), payload => {
        if (payload) {
            ofEvents.emit(route.system(`runtime-download-error-${ payload.downloadId }`), {
                reason: payload.error,
                err: errors.errorToPOJO(new Error(payload.error))
            });
        }
    });

    rvmBus.on(route.rvmMessageBus('broadcast', 'application', 'runtime-download-complete'), payload => {
        if (payload) {
            ofEvents.emit(route.system(`runtime-download-complete-${ payload.downloadId }`), {
                path: payload.path
            });
        }
    });

    try {
        electron.session.defaultSession.on('will-download', (event, item, webContents) => {
            try {
                const { uuid, name } = webContents.browserWindowOptions;

                const downloadListener = createWillDownloadEventListener({ uuid, name });
                downloadListener(event, item, webContents);
            } catch (err) {
                log.writeToLog('info', 'Error while processing will-download event.');
                log.writeToLog('info', err);
            }
        });
    } catch (err) {
        log.writeToLog('info', 'Could not wire up File Download API');
        log.writeToLog('info', err);
    }
    handleDeferredLaunches();
    logSystemMemoryInfo();
}); // end app.ready

function staggerPortBroadcast(myPortInfo) {
    setTimeout(() => {
        try {
            portDiscovery.broadcast(myPortInfo);
        } catch (e) {
            log.writeToLog('info', e);
        }
    }, Math.floor(Math.random() * 50));
}

function includeFlashPlugin() {
    let pluginName;

    switch (process.platform) {
        case 'win32':
            pluginName = 'pepflashplayer.dll';
            break;
        case 'darwin':
            pluginName = 'PepperFlashPlayer.plugin';
            break;
        case 'linux':
            pluginName = 'libpepflashplayer.so';
            break;
        default:
            pluginName = '';
            break;
    }

    if (pluginName) {
        app.commandLine.appendSwitch('ppapi-flash-path', path.join(process.resourcesPath, 'plugins', 'flash', pluginName));
        // Currently for enable_chromium build the flash version need to be
        // specified. See RUN-4510 and RUN-4580.
        app.commandLine.appendSwitch('ppapi-flash-version', '30.0.0.154');
    }
}

function initializeCrashReporter(argo) {
    if (!needsCrashReporter(argo)) {
        return;
    }

    const configUrl = argo['startup-url'] || argo['config'];
    const diagnosticMode = argo['diagnostics'] || false;
    const sandboxDisabled = argo['sandbox'] === false; // means '--no-sandbox' flag exists

    if (diagnosticMode && !sandboxDisabled) {
        log.writeToLog('info', `'--no-sandbox' flag has been automatically added, ` +
            `because the application is running in diagnostics mode and has '--diagnostics' flag specified`);
        app.commandLine.appendSwitch('no-sandbox');
    }

    crashReporter.startOFCrashReporter({ diagnosticMode, configUrl });
}

function initializeDiagnosticReporter(argo) {
    if (!argo['diagnostics']) {
        return;
    }

    // This event may be fired more than once for an unresponsive window.
    ofEvents.on(route.window('not-responding', '*'), (payload) => {
        log.writeToLog('info', `Window is not responding. uuid: ${payload.data[0].uuid}, name: ${payload.data[0].name}`);
    });
    ofEvents.on(route.window('responding', '*'), (payload) => {
        log.writeToLog('info', `Window responding again. uuid: ${payload.data[0].uuid}, name: ${payload.data[0].name}`);
    });
}

function rotateLogs(argo) {
    // only keep the 7 most recent logfiles
    System.getLogList((err, files) => {
        if (err) {
            System.log('error', `logfile error: ${err}`);
        } else {
            files.filter(file => {
                return !(file.name === 'debug.log' || file.name.indexOf('debugp') === 0);
            }).sort((a, b) => {
                return (b.date - a.date);
            }).slice(6).forEach(file => {
                let filepath = path.join(app.getPath('userData'), file.name);
                fs.unlink(filepath, err => {
                    if (err) {
                        System.log('error', `cannot delete logfile: ${filepath}`);
                    } else {
                        System.log('info', `deleting logfile: ${filepath}`);
                    }
                });
            });
        }
    });

    app.reopenLogfile();

    // delete debugp????.log file
    deleteProcessLogfile(false);

    rvmCleanup(argo);
}

function deleteProcessLogfile(closeLogfile) {
    let filename = app.getProcessLogfileName();

    if (!filename) {
        System.log('info', 'process logfile name is undefined');
        System.log('info', coreState.argo);
        return;
    }

    let filepath = path.join(app.getPath('userData'), filename);

    if (closeLogfile) {
        app.closeLogfile();
    }

    try {
        fs.unlinkSync(filepath);
        System.log('info', `deleting process logfile: ${filepath}`);
    } catch (e) {
        System.log('error', `cannot delete process logfile: ${filepath}`);
    }
}

function rvmCleanup(argo) {
    let deleteCacheOnExitFlag = 'delete-cache-on-exit';

    // notify RVM with necessary information to clean up cache folders on exit when we're called with --delete-cache-on-exit
    let deleteCacheOnExit = argo[deleteCacheOnExitFlag];
    if (deleteCacheOnExit) {
        System.deleteCacheOnExit(() => {
            console.log('Successfully sent a delete-cache-on-exit message to the RVM.');
        }, (err) => {
            console.log(err);
        });
    }
}

function migrateLocalStorage(argo) {
    const oldLocalStoragePath = argo['old-local-storage-path'] || '';
    const newLocalStoragePath = argo['new-local-storage-path'] || '';
    const localStorageUrl = argo['local-storage-url'] || '';

    if (oldLocalStoragePath && newLocalStoragePath && localStorageUrl) {
        try {
            System.log('info', 'Migrating Local Storage from ' + oldLocalStoragePath + ' to ' + newLocalStoragePath);
            app.migrateLocalStorage(oldLocalStoragePath, newLocalStoragePath, localStorageUrl);
            System.log('info', 'Migrated Local Storage');
        } catch (e) {
            System.log('error', `Couldn't migrate cache from ${oldLocalStoragePath} to ${newLocalStoragePath}`);
            System.log('error', e);
        }
    }
}

function initServer() {
    let attemptedHardcodedPort = false;

    apiProtocol.initApiHandlers();

    socketServer.on('server/error', function(err) {
        // Guard against non listen errors and infinite retries.
        if (err && err.syscall === 'listen' && !attemptedHardcodedPort) {
            // Assuming connection issue. Bind on any available port
            console.log('Assuming connection issue. Bind on any available port');
            attemptedHardcodedPort = true;
            socketServer.start(0);
        }
    });

    socketServer.on('server/open', function(port) {
        console.log('Opened on', port);
        portDiscovery.broadcast(portDiscovery.getPortInfoByArgs(coreState.argo, port));
        resolveServerReady();
        handleDeferredLaunches();
    });

    socketServer.on('connection/message', function(id, message) {
        console.log('Receieved message', message);
    });

    return socketServer;
}

//TODO: this function actually does more than just launch apps, it will initiate the web socket server and
//is essential for proper runtime startup and adapter connectivity. we want to split into smaller independent parts.
//please see the discussion on https://github.com/openfin/runtime-core/pull/194
function launchApp(argo, startExternalAdapterServer) {

    if (needsCrashReporter(argo)) {
        log.setToVerbose();
    }

    convertOptions.fetchOptions(argo, configuration => {
        const {
            configUrl,
            configObject,
            configObject: { licenseKey, shortcut = {} }
        } = configuration;

        coreState.setManifest(configUrl, configObject);

        if (argo['user-app-config-args']) {
            const tempUrl = configObject['startup_app'].url;
            const delimiter = tempUrl.indexOf('?') < 0 ? '?' : '&';
            configObject['startup_app'].url = `${tempUrl}${delimiter}${argo['user-app-config-args']}`;
        }

        const startupAppOptions = convertOptions.getStartupAppOptions(configObject);
        const uuid = startupAppOptions && startupAppOptions.uuid;
        const name = startupAppOptions && startupAppOptions.name;

        const ofApp = Application.wrap(uuid);
        const ofManifestUrl = ofApp && ofApp._configUrl;
        let isRunning = Application.isRunning(ofApp);

        const { company, name: shortcutName } = shortcut;
        let appUserModelId;
        let namePart;

        if (company) {
            namePart = shortcutName ? `.${shortcutName}` : '';
            appUserModelId = `${company}${namePart}`;
        } else {
            namePart = name ? `.${name}` : '';
            appUserModelId = `${uuid}${namePart}`;
        }

        app.setAppUserModelId(appUserModelId);

        // this ensures that external connections that start the runtime can do so without a main window
        let successfulInitialLaunch = true;
        let passedMutexCheck = false;
        let failedMutexCheck = false;
        if (uuid && !isRunning) {
            if (!lockUuid(uuid)) {
                deleteApp(uuid);
                duplicateUuidTransport.broadcast({ argv, uuid });
                failedMutexCheck = true;
            } else {
                passedMutexCheck = true;
            }
        }
        // comparing ofManifestUrl and configUrl shouldn't consider query strings. Otherwise, it will break deep linking
        const shouldRun = passedMutexCheck && (!isRunning || ofManifestUrl.split('?')[0] !== configUrl.split('?')[0]);
        if (startupAppOptions && shouldRun) {
            //making sure that if a window is present we set the window name === to the uuid as per 5.0
            startupAppOptions.name = uuid;
            successfulInitialLaunch = initFirstApp(configObject, configUrl, licenseKey);
        } else if (uuid && !failedMutexCheck) {
            Application.run({
                    uuid,
                    name: uuid
                },
                '',
                argo['user-app-config-args']
            );
        }

        if (startExternalAdapterServer && successfulInitialLaunch) {
            coreState.setStartManifest(configUrl, configObject);
            socketServer.start(configObject['websocket_port'] || 9696);
        }

        app.emit('synth-desktop-icon-clicked', {
            mouse: System.getMousePosition(),
            tickCount: app.getTickCount(),
            uuid
        });
    }, (error) => {
        const title = errors.ERROR_TITLE_APP_INITIALIZATION;
        const type = errors.ERROR_BOX_TYPES.APP_INITIALIZATION;
        const args = { error, title, type };
        errors.showErrorBox(args)
            .catch((error) => log.writeToLog('info', error))
            .then(app.quit);
    });
}


function initFirstApp(configObject, configUrl, licenseKey) {
    let startupAppOptions;
    let successfulLaunch = false;

    try {
        startupAppOptions = convertOptions.getStartupAppOptions(configObject);

        validatePreloadScripts(startupAppOptions);

        // Needs proper configs
        firstApp = Application.create(startupAppOptions, configUrl);

        coreState.setLicenseKey({ uuid: startupAppOptions.uuid }, licenseKey);

        Application.run({
            uuid: firstApp.uuid
        });

        firstApp.mainWindow.on('closed', function() {
            firstApp = null;
        });

        successfulLaunch = true;

    } catch (error) {

        if (rvmBus) {
            rvmBus.publish({
                topic: 'application',
                action: 'hide-splashscreen',
                sourceUrl: configUrl
            });
        }

        const message = startupAppOptions.loadErrorMessage;
        const title = errors.ERROR_TITLE_APP_INITIALIZATION;
        const type = errors.ERROR_BOX_TYPES.APP_INITIALIZATION;
        const args = { error, message, title, type };
        errors.showErrorBox(args)
            .catch((error) => log.writeToLog('info', error))
            .then(() => {
                if (coreState.shouldCloseRuntime()) {
                    app.quit();
                }
            });
    }

    return successfulLaunch;
}

//Please add any hotkeys added here to the the reservedHotKeys list.
function registerShortcuts() {
    app.on('browser-window-focus', (event, browserWindow) => {
        const windowOptions = coreState.getWindowOptionsById(browserWindow.id);
        const accelerator = windowOptions && windowOptions.accelerator || {};
        const webContents = browserWindow.webContents;

        if (accelerator.zoom) {
            const zoom = increment => { return () => { webContents.send('zoom', { increment }); }; };

            globalShortcut.register('CommandOrControl+0', zoom(0));

            globalShortcut.register('CommandOrControl+=', zoom(+1));
            globalShortcut.register('CommandOrControl+Plus', zoom(+1));

            globalShortcut.register('CommandOrControl+-', zoom(-1));
            globalShortcut.register('CommandOrControl+_', zoom(-1));
        }

        if (accelerator.devtools) {
            const devtools = () => { webContents.openDevTools(); };
            globalShortcut.register('CommandOrControl+Shift+I', devtools);
        }

        if (accelerator.reload) {
            const reload = () => { webContents.reload(); };
            globalShortcut.register('F5', reload);
            globalShortcut.register('CommandOrControl+R', reload);
        }

        if (accelerator.reloadIgnoringCache) {
            const reloadIgnoringCache = () => { webContents.reloadIgnoringCache(); };
            globalShortcut.register('Shift+F5', reloadIgnoringCache);
            globalShortcut.register('CommandOrControl+Shift+R', reloadIgnoringCache);
        }
    });

    const unhookShortcuts = (event, browserWindow) => {
        if (!globalShortcut.isDestroyed()) {
            reservedHotKeys.forEach(a => globalShortcut.unregister(a));
        }
    };

    app.on('browser-window-closed', unhookShortcuts);
    app.on('browser-window-blur', unhookShortcuts);
}

function registerMacMenu() {
    if (process.platform === 'darwin') {
        const template = [{
                label: 'OpenFin',
                submenu: [
                    { role: 'quit' }
                ]
            },
            {
                role: 'editMenu'
            }
        ];
        const menu = Menu.buildFromTemplate(template);
        Menu.setApplicationMenu(menu);
    }
}

function migrateCookies() {
    if (!process.buildFlags.enableChromium) {
        return;
    }
    const userData = app.getPath('userData');
    const cookiePath = path.join(path.join(userData, 'Default'));
    const legacyCookiePath = userData;
    const cookieFile = path.join(path.join(cookiePath, 'Cookies'));
    const cookieJrFile = path.join(path.join(cookiePath, 'Cookies-journal'));
    const legacyCookieFile = path.join(path.join(legacyCookiePath, 'Cookies'));
    const legacyCookieJrFile = path.join(path.join(legacyCookiePath, 'Cookies-journal'));
    try {
        if (fs.existsSync(legacyCookieFile) && !fs.existsSync(cookieFile)) {
            log.writeToLog('info', `migrating cookies from ${legacyCookiePath} to ${cookiePath}`);
            fs.copyFileSync(legacyCookieFile, cookieFile);
            fs.copyFileSync(legacyCookieJrFile, cookieJrFile);
        } else {
            log.writeToLog(1, `skip cookie migration in ${cookiePath}`, true);
        }
    } catch (err) {
        log.writeToLog('info', `Error migrating cookies from ${legacyCookiePath} to ${cookiePath} ${err}`);
        try {
            fs.unlinkSync(cookieFile);
        } catch (ignored) {}
        try {
            fs.unlinkSync(cookieJrFile);
        } catch (ignored) {}
    }
}

function needsCrashReporter(argo) {
    return !!(argo['diagnostics'] || argo['enable-crash-reporting']);
}

function validatePreloadScripts(options) {
    const { name, uuid } = options;
    const genErrorMsg = (propName) => {
        return `Invalid shape of '${propName}' window option. Please, consult the API documentation.`;
    };
    const isValidPreloadScriptsArray = (v = []) => v.every((e) => {
        return typeof e === 'object' && typeof e.url === 'string';
    });

    if ('preload' in options) {
        log.writeToLog('info', `[preloadScripts] [${uuid}]-[${name}]: 'preload' option ` +
            `is deprecated, use 'preloadScripts' instead`);

        if (Array.isArray(options.preload)) {
            if (!isValidPreloadScriptsArray(options.preload)) {
                throw new Error(genErrorMsg('preload'));
            }
        } else if (typeof options.preload !== 'string' && options.preload) {
            throw new Error(genErrorMsg('preload'));
        }

    } else if ('preloadScripts' in options) {
        if (Array.isArray(options.preloadScripts)) {
            if (!isValidPreloadScriptsArray(options.preloadScripts)) {
                throw new Error(genErrorMsg('preloadScripts'));
            }
        } else {
            if (options.preloadScripts) {
                throw new Error(genErrorMsg('preloadScripts'));
            } else {
                log.writeToLog('info', `[preloadScripts] [${uuid}]-[${name}]: Consider using an empty ` +
                    `array with 'preloadScripts', instead of a falsy value`);
            }
        }
    }

    return true;
}

function logSystemMemoryInfo() {
    const systemMemoryInfo = process.getSystemMemoryInfo();

    log.writeToLog('info', `System memory info for: ${process.platform} ${os.release()} ${electron.app.getSystemArch()}`);

    for (const i of Object.keys(systemMemoryInfo)) {
        log.writeToLog('info', `${i}: ${systemMemoryInfo[i]} KB`);
    }
}
