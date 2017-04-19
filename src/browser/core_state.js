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
var electronApp = require('electron').app;

// npm modules
var minimist = require('minimist');

// local modules
import {
    ExternalApplication
} from './api/external_application';


// locals
const args = electronApp.getCommandLineArguments(); // command line string ("s" for "string")
const argv = electronApp.getCommandLineArgv(); // argument list ("v" for "vector")
const argo = minimist(argv); // minimist-style object ("o" for "object"; hash of command line options:values; see https://github.com/substack/minimist)

var coreState = {
    apps: []
};

// TODO: Remove after Dependency Injection refactor
var startManifest_ = {};

// TODO: Remove after Dependency Injection refactor
var manifestProxySettings_ = {
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
        var type = proxySettings.type;
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

    let windowList = getWinList();
    let matchingWindows = windowList.filter(wrapper => {

        if (!wrapper.openfinWindow) {
            return false;
        }

        let uuidMatch = uuid === wrapper.openfinWindow.uuid;
        let nameMatch = name === wrapper.openfinWindow.name;

        return uuidMatch && nameMatch;
    });

    let hasMatchingWindows = matchingWindows.length;

    return hasMatchingWindows;
}

function removeChildById(id) {
    var app = getAppByWin(id);

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
    var win = getWinById(id);
    return win && win.children;
}



function getAppByWin(winId) {
    return coreState.apps.filter(app => {
        return app.children.filter(getWinList => {
            return getWinList.id === winId;
        }).length;
    })[0];
}


function getAppById(appId) {
    return coreState.apps.filter(app => {
        return app.id === appId;
    })[0]; //This will hide a leak
}

function appByUuid(uuid) {
    return coreState.apps.filter(app => {
        return uuid === app.uuid;
    })[0];
}

function setAppRunningState(uuid, running) {
    var app = appByUuid(uuid);

    if (!app) {

        // uuid was not recognized
        return;
    }

    app.isRunning = running;
}


function getAppRunningState(uuid) {
    var app = appByUuid(uuid);

    if (!app) {

        // uuid was not recognized
        return;
    }

    return app.isRunning;
}

function getAppRestartingState(uuid) {
    var app = appByUuid(uuid);

    if (!app) {
        return;
    }

    return app.isRestarting;
}

function setAppRestartingState(uuid, restarting) {
    var app = appByUuid(uuid);
    if (!app) {
        // uuid was not recognized
        return;
    }
    app.isRestarting = restarting;
}

function setAppId(uuid, id) {
    var app = appByUuid(uuid);

    if (!app) {

        console.warn('setAppId - app not found', arguments);
        // uuid was not recognized
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
    var app = appByUuid(uuid);

    return app && app.appObj;
}

function getExternalAppObjByUuid(uuid) {
    return ExternalApplication.getAllExternalConnctions().find(ea => ea.uuid === uuid);
}

function getUuidBySourceUrl(sourceUrl) {
    var app = coreState.apps.filter(app => {
        var appObj = app.appObj,
            configUrl = appObj && appObj._configUrl;

        if (configUrl) {
            return configUrl === sourceUrl;
        }

        return false;
    })[0];

    return app && app.appObj && app.appObj.uuid;
}

function setAppObj(appId, appObj) {
    var app = getAppById(appId);

    if (!app) {
        console.warn('setAppObj - app not found', arguments);
        return undefined;
        //throw new Error('setAppObj - app not found');

    }

    if (!appObj) {
        console.warn('setAppObj - no app object provided', arguments);
        return undefined;
        //throw new Error('setAppObj - no app object provided');

    }

    app.appObj = appObj;

    return app;
}


function getAppObj(appId) {
    var app = getAppById(appId);

    if (!app) {
        console.warn('getAppObj - app not found', arguments);
        return undefined;
        //throw new Error('getAppObj - app not found');

    }

    return app.appObj;
}

function setAppOptions(opts, configUrl = '') {
    var app = appByUuid(opts.uuid);

    if (!app) {
        console.warn('setAppOptions - app not found', arguments);
        return undefined;
        //throw new Error('setAppObj - app not found');

    }

    app._options = opts; // need to save options so app can re-run
    app._configUrl = configUrl;

    return app;
}

function getWinById(winToFind) {
    return getWinList().filter(win => {
        return win.id === winToFind;
    })[0];
}


function getChildrenByApp(appId) {
    let app = getAppById(appId);
    let nonMainWindows, childOpenfinWindows;

    nonMainWindows = app.children.filter(child => {
        let openfinWindow = child.openfinWindow;
        let name, uuid, isMainWindow;

        if (!openfinWindow) {

            // openfin window object not present, do not include
            // in the filtered list
            return false;
        }

        name = openfinWindow.name;
        uuid = openfinWindow.uuid;
        isMainWindow = name === uuid;

        // do not include the main window, this is 5.0 behavior
        return !isMainWindow;

    });

    childOpenfinWindows = nonMainWindows.map(child => {
        return child.openfinWindow;
    });

    return childOpenfinWindows;
}


function addChildToWin(parentId, childId) {
    var app = getAppByWin(parentId),
        parent;

    if (!app) {
        console.warn('addChildToWin - parent app not found', arguments);
        return undefined;
        //throw new Error('addChildToWin - parent app not found');

    }

    // reenable?
    //	if (parentId !== childId) {
    parent = getWinById(parentId);

    if (!parent) {
        console.warn('addChildToWin - parent window not found', arguments);
        return undefined;
        //throw new Error('addChildToWin - parent window not found');

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
    var win = getWinById(id);

    if (!win) {
        console.warn('getWinObjById - window not found', arguments);
        return undefined;
        //throw new Error('getWinObjById - window not found');

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
    let app = appByUuid(uuid);
    return app && app.sentHideSplashScreen;
}

function setSentFirstHideSplashScreen(uuid, sent) {
    let app = appByUuid(uuid);
    if (app) {
        app.sentHideSplashScreen = sent;
    }
}

// what should the name be?
function setWindowObj(winId, openfinWindow) {
    var win = getWinById(winId);

    if (!win) {
        console.warn('setWindow - window not found', arguments);
        return undefined;
        //throw new Error('setWindow - window not found');

    }

    if (!openfinWindow) {
        console.warn('setWindow - no window object provided', arguments);
        return undefined;
        //throw new Error('setWindow - no window object provided');

    }

    win.openfinWindow = openfinWindow;

    return win;
}

function removeApp(id) {
    var toRemove = getAppById(id);

    if (!toRemove) {
        console.warn('removeApp - app not found', arguments);
        return undefined;
        //throw new Error('removeApp - app not found');

    }

    delete toRemove.appObj;

    toRemove.isRunning = false;

    // coreState.apps = coreState.apps.filter(app => {
    //     return app.id !== id;
    // });

    // return coreState.apps;
}

function getWindowOptionsById(id) {
    let win = getWinById(id),
        openfinWindow = win.openfinWindow,
        options = openfinWindow && openfinWindow._options;

    return options;
}


function getMainWindowOptions(winId) {
    var app = getAppByWin(winId);

    if (!app) {
        console.warn('getMainWindowOptions - app not found', winId);
        return undefined;
        //throw new Error('getMainWindowOptions - app not found');
    }

    if (!app.appObj) {
        console.warn('getMainWindowOptions - app opts not found', winId);
        return undefined;
        //throw new Error('getMainWindowOptions - app opts not found');
    }

    // console.log('getMainWindowOptions', app.appObj._options);
    return app.appObj._options;
}


function getWindowByUuidName(uuid, name) {
    var win = getOfWindowByUuidName(uuid, name);

    return win && win.openfinWindow;
}

function getOfWindowByUuidName(uuid, name) {
    let win = getWinList().filter(win => {
        let nameMatches,
            uuidMatches,
            bothMatch,
            openfinWindow = win.openfinWindow;

        if (!openfinWindow) {

            return false;
        }

        nameMatches = openfinWindow.name === name;
        uuidMatches = openfinWindow.uuid === uuid;
        bothMatch = nameMatches && uuidMatches;

        return bothMatch;

    })[0];

    return win;
}

/**
 * returns a list of wrapped window objects
 * TODO flatten this one level
 */

function getWinList() {
    return coreState.apps.map(app => {
        return app.children;
    }).reduce((wins, myWins) => {
        return wins.concat(myWins);
    }, []);
}

function getAllApplications() {
    return coreState.apps.map(app => {
        return {
            isRunning: app.isRunning,
            uuid: app.uuid,
            parentUuid: app.appObj && app.appObj.parentUuid
        };
    });
}

//TODO: should this function replace getAllApplications ?
function getAllAppObjects() {
    //return a copy.
    return coreState.apps.map(app => {
        return app.appObj;
    }).filter(a => {
        return a;
    });
}

function getAllWindows() {
    var Window = require('./api/window.js').Window;
    let windowList = coreState.apps.map(app => {
        let childWindows, mainWin;

        childWindows = app.children.filter(win => {
            return win.openfinWindow && win.id !== app.id;
        }).map(cWin => {

            let bounds = Window.getBounds({
                uuid: cWin.openfinWindow.uuid,
                name: cWin.openfinWindow.name
            });
            bounds.name = cWin.openfinWindow.name;

            return bounds;
        }) || [];

        //get the mainWindow info
        mainWin = app.children.filter(win => {
            return win.openfinWindow && win.id === app.id;
        }).map(main => {
            let bounds = Window.getBounds({
                uuid: main.openfinWindow.uuid,
                name: main.openfinWindow.name
            });

            bounds.name = main.openfinWindow.name;

            return bounds;
        });

        return {
            uuid: app.uuid,
            childWindows,
            mainWindow: mainWin[0] || {}
        };
    });

    return windowList;
}

function remoteAppPropDecorator(uuid, prop) {
    return function() {
        var origArgs = Array.prototype.slice.call(arguments, 0);

        var browserInstance = getAppObjByUuid(uuid);
        browserInstance[prop].apply(browserInstance, origArgs);

    };
}

function anyAppRestarting() {
    let restartingApps = coreState.apps.filter(app => {
        return app.isRestarting === true;
    });
    return restartingApps.length > 0;
}

function shouldCloseRuntime(ignoreArray) {
    let ignoredApps = ignoreArray || [];
    let extConnections = ExternalApplication.getAllExternalConnctions();
    let connections = extConnections.filter((conn) => {
        let {
            nonPersistent
        } = conn;
        let nonPersistentUndefined = typeof nonPersistent === 'undefined';

        return nonPersistentUndefined ? true : !nonPersistent;
    });

    if (anyAppRestarting()) {
        console.log('not close Runtime during app restart');
        return false;
    } else {
        let applications = getAllAppObjects().filter(app => {
            let nonPersistent = app._options.nonPersistent !== undefined ? app._options.nonPersistent : app._options.nonPersistant;
            let isRunning = getAppRunningState(app.uuid);
            return (isRunning && app && ignoredApps.indexOf(app.uuid) === -1 && !nonPersistent);
        });
        return connections.length === 0 && applications.length === 0;
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
