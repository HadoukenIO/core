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
	src/browser/core_state.js
*/

// built-in modules
const electronApp = require('electron').app;

// npm modules
const minimist = require('minimist');

// local modules
import {
    ExternalApplication
} from './api/external_application';

// locals
const args = electronApp.getCommandLineArguments(); // command line string ("s" for "string")
const argv = electronApp.getCommandLineArgv(); // argument list ("v" for "vector")
const argo = minimist(argv); // minimist-style object ("o" for "object"; hash of command line options:values; see https://github.com/substack/minimist)

const coreState = {
    apps: []
};

// TODO: Remove after Dependency Injection refactor
var startManifest_ = {};

// TODO: Remove after Dependency Injection refactor
const manifestProxySettings_ = {
    proxyAddress: '',
    proxyPort: 0,
    type: 'system'
};


// TODO: Remove after Dependency Injection refactor
function setStartManifest(url, data) {
    startManifest_ = {
        url: url,
        data: data
    };

    setManifestProxySettings((data || {}).proxy);
}

// TODO: Remove after Dependency Injection refactor
function getStartManifest() {
    return startManifest_;
}

// Returns string on error
// TODO: Remove after Dependency Injection refactor
function setManifestProxySettings(proxySettings) {
    // Proxy settings from a config serve no behavioral purpose in 5.0
    // They are merely a read/write data-store.
    if (typeof proxySettings === 'object') {
        const type = proxySettings.type;
        if (type.indexOf('system') === -1 && type.indexOf('named') === -1) {
            return 'Invalid proxy type. Should be \"system\" or \"named\"';
        }

        manifestProxySettings_.proxyAddress = proxySettings.proxyAddress || '';
        manifestProxySettings_.proxyPort = proxySettings.proxyPort || 0;
        manifestProxySettings_.type = type;
    }
}

// TODO: Remove after Dependency Injection refactor
function getManifestProxySettings() {
    return manifestProxySettings_;
}

function windowExists(uuid, name) {
    return !!getOfWindowByUuidName(uuid, name);
}

function removeChildById(id) {
    const app = getAppByWin(id);

    if (app) {
        //if this was a child window make sure we clean up as well.
        app.children.forEach(win => {
            win.children = win.children.filter(wChildId => {
                return wChildId !== id;
            });
        });
        if (app && app.children) {
            app.children = app.children.filter(child => {
                return child.id !== id;
            });
        }
    }
}

function getChildrenByWinId(id) {
    const win = getWinById(id);
    return win && win.children;
}

function getAppByWin(winId) {
    return coreState.apps.find(app => app.children.find(getWinList => getWinList.id === winId));
}

function getAppById(appId) {
    return coreState.apps.find(app => app.id === appId); //This will hide a leak
}

function appByUuid(uuid) {
    return coreState.apps.find(app => uuid === app.uuid);
}

function setAppRunningState(uuid, running) {
    const app = appByUuid(uuid);
    if (app) {
        app.isRunning = !!running;
    }
}

function getAppRunningState(uuid) {
    const app = appByUuid(uuid);
    return app && app.isRunning;
}

function getAppRestartingState(uuid) {
    const app = appByUuid(uuid);
    return app && app.isRestarting;
}

function setAppRestartingState(uuid, restarting) {
    const app = appByUuid(uuid); // check if uuid is recognized

    if (app) {
        app.isRestarting = !!restarting;
    }
}

function setAppId(uuid, id) {
    const app = appByUuid(uuid);

    if (!app) {
        console.warn('setAppId - app not found', arguments);
        return;
    }

    app.id = id;
    app.children = [{
        id: id,
        openfinWindow: null,
        children: []
    }];
}


function getAppObjByUuid(uuid) {
    const app = appByUuid(uuid);
    return app && app.appObj;
}

function getExternalAppObjByUuid(uuid) {
    return ExternalApplication.getAllExternalConnctions().find(ea => ea.uuid === uuid);
}

function getUuidBySourceUrl(sourceUrl) {
    const app = coreState.apps.find(app => {
        const configUrl = app.appObj && app.appObj._configUrl;
        return configUrl && configUrl === sourceUrl;
    });

    return app && app.appObj && app.appObj.uuid;
}

function getConfigUrlByUuid(uuid) {
    let app = appByUuid(uuid);
    while (app && app.appObj && app.appObj.parentUuid) {
        app = appByUuid(app.appObj.parentUuid);
    }
    return app && app._configUrl;
}

function setAppObj(appId, appObj) {
    const app = getAppById(appId);

    if (!app) {
        console.warn('setAppObj - app not found', arguments);
        return; //throw new Error('setAppObj - app not found');
    }

    if (!appObj) {
        console.warn('setAppObj - no app object provided', arguments);
        return; //throw new Error('setAppObj - no app object provided');
    }

    app.appObj = appObj;

    return app;
}


function getAppObj(appId) {
    const app = getAppById(appId);

    if (!app) {
        console.warn('getAppObj - app not found', arguments);
        return; //throw new Error('getAppObj - app not found');
    }

    return app.appObj;
}


function setAppOptions(opts, configUrl = '') {
    const app = appByUuid(opts.uuid);

    if (!app) {
        console.warn('setAppOptions - app not found', arguments);
        return; //throw new Error('setAppObj - app not found');
    }

    app._options = opts; // need to save options so app can re-run
    app._configUrl = configUrl;

    return app;
}


function getWinById(winToFind) {
    return getWinList().find(win => win.id === winToFind);
}


function getChildrenByApp(appId) {
    const app = getAppById(appId);

    if (!app) {
        console.warn('getChildrenByApp - app not found', arguments);
        return; //throw new Error('getAppObj - app not found');
    }

    // Only return children who have an openfin window object and are not the app's main window (5.0 behavior)
    return app.children
        .filter(child => child.openfinWindow && child.openfinWindow.name !== child.openfinWindow.uuid)
        .map(child => child.openfinWindow);
}


function addChildToWin(parentId, childId) {
    const app = getAppByWin(parentId);

    if (!app) {
        console.warn('addChildToWin - parent app not found', arguments);
        return; //throw new Error('addChildToWin - parent app not found');
    }

    // reenable?
    //	if (parentId !== childId) {
    const parent = getWinById(parentId);

    if (!parent) {
        console.warn('addChildToWin - parent window not found', arguments);
        return; //throw new Error('addChildToWin - parent window not found');
    }

    parent.children.push(childId);
    //		}

    return app.children.push({
        id: childId,
        parentId: parentId,
        openfinWindow: null,
        children: []
    });
}


function getWinObjById(id) {
    const win = getWinById(id);

    if (!win) {
        console.warn('getWinObjById - window not found', arguments);
        return; //throw new Error('getWinObjById - window not found');

    }

    //console.log('\n\ngetWinObjById DONE', arguments);
    return win.openfinWindow;
}


function addApp(id, uuid) {
    // id is optional

    coreState.apps.push({
        uuid,
        id: id,
        appObj: null,
        isRunning: false,
        sentHideSplashScreen: false, // hide-splashscreen is sent to RVM on 1st window show & immediately on subsequent app launches if already sent once
        children: [{
            id: id,
            openfinWindow: null,
            children: []
        }]
    });

    return coreState.apps;
}

function sentFirstHideSplashScreen(uuid) {
    const app = appByUuid(uuid);
    return app && app.sentHideSplashScreen;
}

function setSentFirstHideSplashScreen(uuid, sent) {
    const app = appByUuid(uuid);
    if (app) {
        app.sentHideSplashScreen = sent;
    }
}

// what should the name be?
function setWindowObj(winId, openfinWindow) {
    const win = getWinById(winId);

    if (!win) {
        console.warn('setWindow - window not found', arguments);
        return; //throw new Error('setWindow - window not found');
    }

    if (!openfinWindow) {
        console.warn('setWindow - no window object provided', arguments);
        return; //throw new Error('setWindow - no window object provided');
    }

    win.openfinWindow = openfinWindow;

    return win;
}

function removeApp(id) {
    const app = getAppById(id);

    if (!app) {
        console.warn('removeApp - app not found', arguments);
        return; //throw new Error('removeApp - app not found');
    }

    delete app.appObj;

    app.isRunning = false;

    // coreState.apps = coreState.apps.filter(app => app.id !== id);

    // return coreState.apps;
}

function getWindowOptionsById(id) {
    const win = getWinById(id);
    return win.openfinWindow && win.openfinWindow._options;
}


function getMainWindowOptions(winId) {
    const app = getAppByWin(winId);

    if (!app) {
        console.warn('getMainWindowOptions - app not found', arguments);
        return; //throw new Error('getMainWindowOptions - app not found');
    }

    if (!app.appObj) {
        console.warn('getMainWindowOptions - app opts not found', arguments);
        return; //throw new Error('getMainWindowOptions - app opts not found');
    }

    // console.log('getMainWindowOptions', app.appObj._options);
    return app.appObj._options;
}


function getWindowByUuidName(uuid, name) {
    const win = getOfWindowByUuidName(uuid, name);
    return win && win.openfinWindow;
}

function getOfWindowByUuidName(uuid, name) {
    return getWinList().find(win => win.openfinWindow &&
        win.openfinWindow.uuid === uuid &&
        win.openfinWindow.name === name
    );
}

/**
 * returns a list of wrapped window objects
 * TODO flatten this one level
 */

function getWinList() {
    return coreState.apps
        .map(app => app.children) //with children
        .reduce((wins, myWins) => wins.concat(myWins), []); //flatten
}

function getAllApplications() {
    return coreState.apps.map(app => {
        return {
            isRunning: app.isRunning,
            uuid: app.uuid,
            parentUuid: app.parentUuid
        };
    });
}

//TODO: should this function replace getAllApplications ?
function getAllAppObjects() {
    return coreState.apps
        .filter(app => app.appObj) //with openfin app object
        .map(app => app.appObj); //and return same
}

function getAllWindows() {
    const getBounds = require('./api/window.js').Window.getBounds; // do not move this line!
    return coreState.apps.map(app => {
        const windowBounds = app.children
            .filter(win => win.openfinWindow && win.id !== app.id)
            .map(win => {
                const bounds = getBounds({
                    uuid: win.openfinWindow.uuid,
                    name: win.openfinWindow.name
                });
                bounds.name = win.openfinWindow.name;
                return bounds;
            });

        return {
            uuid: app.uuid,
            childWindows: windowBounds,
            mainWindow: windowBounds[0] || {}
        };
    });
}

function remoteAppPropDecorator(uuid, prop) {
    return function() {
        const origArgs = Array.prototype.slice.call(arguments, 0);
        const browserInstance = getAppObjByUuid(uuid);
        browserInstance[prop].apply(browserInstance, origArgs);
    };
}

function anyAppRestarting() {
    return !!coreState.apps.find(app => app.isRestarting);
}

function shouldCloseRuntime(ignoreArray) {
    const ignoredApps = ignoreArray || [];

    if (anyAppRestarting()) {
        console.log('not close Runtime during app restart');
        return false;
    } else {
        const extConnections = ExternalApplication.getAllExternalConnctions();
        const hasPersistentConnections = extConnections.find(
            conn => conn.nonPersistent === undefined || !conn.nonPersistent
        );

        return !hasPersistentConnections && !getAllAppObjects().find(app =>
            getAppRunningState(app.uuid) && // app is running
            ignoredApps.indexOf(app.uuid) < 0 && // app is not being ignored
            !(app._options.nonPersistent !== undefined ? app._options.nonPersistent : app._options.nonPersistant) // app is persistent
        );
    }
}

//TODO: This needs to go go away, pending socket server refactor.
var socketServerState = {};

//TODO: This needs to go go away, pending socket server refactor.
function setSocketServerState(state) {
    socketServerState = state;
}

//TODO: This needs to go go away, pending socket server refactor.
function getSocketServerState() {
    return socketServerState;
}

// methods
module.exports = {
    addApp,
    addChildToWin,
    argo,
    args,
    argv,
    appByUuid,
    coreState,
    getAllApplications,
    getAllAppObjects,
    getAllWindows,
    getAppById,
    getAppByWin,
    getAppObj,
    getAppObjByUuid,
    getUuidBySourceUrl,
    getConfigUrlByUuid,
    getAppRunningState,
    getAppRestartingState,
    getChildrenByApp,
    getChildrenByWinId,
    getMainWindowOptions,
    getManifestProxySettings,
    getOfWindowByUuidName,
    getSocketServerState,
    getStartManifest,
    getWinById,
    getWindowByUuidName,
    getWindowOptionsById,
    getWinObjById,
    remoteAppPropDecorator,
    removeApp,
    removeChildById,
    sentFirstHideSplashScreen,
    setAppId,
    setAppObj,
    setAppOptions,
    setAppRunningState,
    setAppRestartingState,
    setManifestProxySettings,
    setStartManifest,
    setWindowObj,
    setSentFirstHideSplashScreen,
    setSocketServerState,
    shouldCloseRuntime,
    windowExists,
    getExternalAppObjByUuid
};
