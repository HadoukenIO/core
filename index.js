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
  index.js
*/

// built\-in modules
let fs = require('fs');
let path = require('path');
let electron = require('electron');
let app = electron.app; // Module to control application life.
let BrowserWindow = electron.BrowserWindow;
let crashReporter = electron.crashReporter;
let dialog = electron.dialog;
let globalShortcut = electron.globalShortcut;
let ipc = electron.ipcMain;

// npm modules
let _ = require('underscore');
let minimist = require('minimist');

// local modules
let Application = require('./src/browser/api/application.js').Application;
let System = require('./src/browser/api/system.js').System;
let Window = require('./src/browser/api/window.js').Window;

let apiProtocol = require('./src/browser/api_protocol');
let socketServer = require('./src/browser/transports/socket_server').server;

let authenticationDelegate = require('./src/browser/authentication_delegate.js');
let convertOptions = require('./src/browser/convert_options.js');
let coreState = require('./src/browser/core_state.js');
let errors = require('./src/common/errors.js');
import ofEvents from './src/browser/of_events';
import {
    portDiscovery
} from './src/browser/port_discovery';

import {
    default as connectionManager,
    meshEnabled
} from './src/browser/connection_manager';

import * as log from './src/browser/log';


// locals
let firstApp = null;
let crashReporterEnabled = false;
let rvmBus;
let otherInstanceRunning = false;
let appIsReady = false;
const deferredLaunches = [];
const USER_DATA = app.getPath('userData');


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
        nodeIntegration: true,
        openfinIntegration: false
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
    clientCertDialog.loadURL(path.resolve(__dirname, 'src', 'certificate', 'index.html') + params);
});

portDiscovery.on('runtime/launched', (portInfo) => {
    //check if the ports match:
    const myPortInfo = coreState.getSocketServerState();
    log.writeToLog('info', `Port discovery message received ${JSON.stringify(portInfo)}`);

    //TODO: Include REALM in the determination.
    if (meshEnabled && portInfo.port !== myPortInfo.port) {

        connectionManager.connectToRuntime(`${myPortInfo.version}:${myPortInfo.port}`, portInfo).then((runtimePeer) => {
            //one connected we broadcast our port discovery message.
            staggerPortBroadcast(myPortInfo);
            log.writeToLog('info', `Connected to runtime ${JSON.stringify(runtimePeer.portInfo)}`);

        }).catch(err => {
            log.writeToLog('info', `Failed to connect to runtime ${JSON.stringify(portInfo)}, ${JSON.stringify(errors.errorToPOJO(err))}`);
        });
    }
});

includeFlashPlugin();

// Opt in to launch crash reporter
initializeCrashReporter(coreState.argo);

// Has a local copy of an app config
if (coreState.argo['local-startup-url']) {
    try {
        let localConfig = JSON.parse(fs.readFileSync(coreState.argo['local-startup-url']));

        if (typeof localConfig['devtools_port'] === 'number') {
            console.log('remote-debugging-port:', localConfig['devtools_port']);
            app.commandLine.appendSwitch('remote-debugging-port', localConfig['devtools_port'].toString());
        }
    } catch (err) {
        console.error(err);
    }
}

const handleDelegatedLaunch = function(commandLine) {
    let otherInstanceArgo = minimist(commandLine);
    const socketServerState = coreState.getSocketServerState();
    const portInfo = portDiscovery.getPortInfoByArgs(otherInstanceArgo, socketServerState.port);

    initializeCrashReporter(otherInstanceArgo);

    // delegated args from a second instance
    launchApp(otherInstanceArgo, false);

    // Will queue if server is not ready.
    portDiscovery.broadcast(portInfo);

    // command line flag --delete-cache-on-exit
    rvmCleanup(otherInstanceArgo);

    return true;
};

app.on('chrome-browser-process-created', function() {
    otherInstanceRunning = app.makeSingleInstance((commandLine) => {
        if (appIsReady) {
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
        app.quit();

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

    app.vlog(1, 'process.versions: ' + JSON.stringify(process.versions, null, 2));

    rvmBus = require('./src/browser/rvm/rvm_message_bus');


    app.allowNTLMCredentialsForAllDomains(true);

    if (process.platform === 'win32') {
        let integrityLevel = app.getIntegrityLevel();
        System.log('info', `Runtime integrity level of the app: ${integrityLevel}`);
    }

    rotateLogs(coreState.argo);

    //Once we determine we are the first instance running we setup the API's
    //Create the new Application.
    initServer();
    launchApp(coreState.argo, true);

    registerShortcuts();

    //subscribe to auth requests:
    app.on('login', (event, webContents, request, authInfo, callback) => {
        let browserWindow = webContents.getOwnerBrowserWindow();
        let ofWindow = coreState.getWinById(browserWindow.id).openfinWindow;

        let identity = {
            name: ofWindow._options.name,
            uuid: ofWindow._options.uuid
        };
        const windowEvtName = `window/auth-requested/${identity.uuid}-${identity.name}`;
        const appEvtName = `application/window-auth-requested/${identity.uuid}`;

        authenticationDelegate.addPendingAuthRequests(identity, authInfo, callback);
        if (ofEvents.listeners(windowEvtName).length < 1 && ofEvents.listeners(appEvtName).length < 1) {
            authenticationDelegate.createAuthUI(identity);
        } else {
            ofEvents.emit(windowEvtName, {
                topic: 'window',
                type: 'auth-requested',
                uuid: identity.uuid,
                name: identity.name,
                authInfo: authInfo
            });
            ofEvents.emit(appEvtName, {
                topic: 'application',
                type: 'window-auth-requested',
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

    rvmBus.on('rvm-message-bus/broadcast/download-asset/progress', payload => {
        if (payload) {
            ofEvents.emit(`system/asset-download-progress-${payload.downloadId}`, {
                totalBytes: payload.totalBytes,
                downloadedBytes: payload.downloadedBytes
            });
        }
    });

    rvmBus.on('rvm-message-bus/broadcast/download-asset/error', payload => {
        if (payload) {
            ofEvents.emit(`system/asset-download-error-${payload.downloadId}`, {
                reason: payload.error,
                err: errors.errorToPOJO(new Error(payload.error))
            });
        }
    });
    rvmBus.on('rvm-message-bus/broadcast/download-asset/complete', payload => {
        if (payload) {
            ofEvents.emit(`system/asset-download-complete-${payload.downloadId}`, {
                path: payload.path
            });
        }
    });

    // handle deferred launches
    deferredLaunches.forEach((commandLine) => {
        handleDelegatedLaunch(commandLine);
    });

    deferredLaunches.length = 0;

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
    }
}

function initializeCrashReporter(argo) {
    if (!crashReporterEnabled && argo['enable-crash-reporting']) {
        crashReporter.start({
            productName: 'OpenFin',
            companyName: 'OpenFin',
            submitURL: 'https://dl.openfin.co/services/crash-report',
            autoSubmit: true
        });
        crashReporterEnabled = true;
    }
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
                let filepath = path.join(USER_DATA, file.name);
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

    let filepath = path.join(USER_DATA, filename);

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
    convertOptions.fetchOptions(argo, configuration => {
        let {
            configUrl,
            configObject
        } = configuration;
        let openfinWinOpts = convertOptions.getWindowOptions(configObject);
        let startUpApp = configObject.startup_app; /* jshint ignore:line */
        let uuid = startUpApp && startUpApp.uuid;
        let ofApp = Application.wrap(uuid);
        let isRunning = Application.isRunning(ofApp);

        if (openfinWinOpts && !isRunning) {
            //making sure that if a window is pressent we set the window name === to the uuid as per 5.0
            openfinWinOpts.name = uuid;
            initFirstApp(openfinWinOpts, configUrl);
        } else if (uuid) {
            Application.run({
                uuid,
                name: uuid
            });
        }

        if (startExternalAdapterServer) {
            coreState.setStartManifest(configUrl, configObject);
            socketServer.start(configObject['websocket_port'] || 9696);
        }

        app.emit('synth-desktop-icon-clicked', {
            mouse: System.getMousePosition(),
            tickCount: app.getTickCount()
        });
    }, error => {
        log.writeToLog(1, error, true);

        if (!coreState.argo['noerrdialog']) {
            dialog.showErrorBox('Fatal Error', `${error}`);
        }

        app.quit();
    });
}


function initFirstApp(options, configUrl) {
    try {
        // Needs proper configs
        firstApp = Application.create(options, configUrl);

        Application.run({
            uuid: firstApp.uuid
        });

        // Emitted when the window is closed.
        firstApp.mainWindow.on('closed', function() {
            firstApp = null;
        });
    } catch (error) {
        log.writeToLog(1, error, true);

        if (rvmBus) {
            rvmBus.send('application', {
                action: 'hide-splashscreen',
                sourceUrl: configUrl
            });
        }

        if (!coreState.argo['noerrdialog']) {
            const errorMessage = options.loadErrorMessage || 'There was an error loading the application.';
            dialog.showErrorBox('Fatal Error', errorMessage);
        }

        if (coreState.shouldCloseRuntime()) {
            _.defer(() => {
                app.quit();
            });
        }
    }
}

function registerShortcuts() {
    const resetZoomShortcut = 'CommandOrControl+0';
    const zoomInShortcut = 'CommandOrControl+=';
    const zoomInShiftShortcut = 'CommandOrControl+Plus';
    const zoomOutShortcut = 'CommandOrControl+-';
    const zoomOutShiftShortcut = 'CommandOrControl+_';
    const devToolsShortcut = 'CommandOrControl+Shift+I';
    const reloadF5Shortcut = 'F5';
    const reloadShiftF5Shortcut = 'Shift+F5';
    const reloadCtrlRShortcut = 'CommandOrControl+R';
    const reloadCtrlShiftRShortcut = 'CommandOrControl+Shift+R';

    let zoom = (zoomIn, reset = false) => {
        return () => {
            let browserWindow = BrowserWindow.getFocusedWindow();
            let windowOptions = browserWindow && coreState.getWindowOptionsById(browserWindow.id);

            if (windowOptions && windowOptions.accelerator && windowOptions.accelerator.zoom) {
                browserWindow.webContents.send('zoom', zoomIn, reset);
            }
        };
    };

    let reload = () => {
        let browserWindow = BrowserWindow.getFocusedWindow();
        let windowOptions = browserWindow && coreState.getWindowOptionsById(browserWindow.id);

        if (windowOptions && windowOptions.accelerator && windowOptions.accelerator.reload) {
            browserWindow.webContents.reload();
        }
    };

    let reloadIgnoringCache = () => {
        let browserWindow = BrowserWindow.getFocusedWindow();
        let windowOptions = browserWindow && coreState.getWindowOptionsById(browserWindow.id);

        if (windowOptions && windowOptions.accelerator && windowOptions.accelerator.reloadIgnoringCache) {
            browserWindow.webContents.reloadIgnoringCache();
        }
    };

    app.on('browser-window-focus', () => {
        globalShortcut.register(resetZoomShortcut, zoom(undefined, true));
        globalShortcut.register(zoomInShortcut, zoom(true));
        globalShortcut.register(zoomInShiftShortcut, zoom(true));
        globalShortcut.register(zoomOutShortcut, zoom(false));
        globalShortcut.register(zoomOutShiftShortcut, zoom(false));

        globalShortcut.register(devToolsShortcut, () => {
            let browserWindow = BrowserWindow.getFocusedWindow();
            let windowOptions = browserWindow && coreState.getWindowOptionsById(browserWindow.id);

            if (windowOptions && windowOptions.accelerator && windowOptions.accelerator.devtools) {
                browserWindow.webContents.openDevTools();
            }
        });

        globalShortcut.register(reloadF5Shortcut, reload);
        globalShortcut.register(reloadShiftF5Shortcut, reloadIgnoringCache);
        globalShortcut.register(reloadCtrlRShortcut, reload);
        globalShortcut.register(reloadCtrlShiftRShortcut, reloadIgnoringCache);
    });

    app.on('browser-window-blur', () => {
        globalShortcut.unregister(resetZoomShortcut);
        globalShortcut.unregister(zoomInShortcut);
        globalShortcut.unregister(zoomInShiftShortcut);
        globalShortcut.unregister(zoomOutShortcut);
        globalShortcut.unregister(zoomOutShiftShortcut);
        globalShortcut.unregister(devToolsShortcut);
        globalShortcut.unregister(reloadF5Shortcut);
        globalShortcut.unregister(reloadShiftF5Shortcut);
        globalShortcut.unregister(reloadCtrlRShortcut);
        globalShortcut.unregister(reloadCtrlShiftRShortcut);
    });
}
