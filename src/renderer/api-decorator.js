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
/* global fin, window*/
// These are relative to the preload execution, the root of the proj

// THIS FILE GETS EVALED IN THE RENDERER PROCESS
(function() {

    const openfinVersion = process.versions.openfin;
    const processVersions = JSON.parse(JSON.stringify(process.versions));

    let renderFrameId = global.routingId;
    let customData = global.getFrameData(renderFrameId);
    let glbl = global;

    const electron = require('electron');
    const webFrame = electron.webFrame.createForRenderFrame(renderFrameId);
    const ipc = electron.ipcRenderer;

    let cachedOptions;
    let childWindowRequestId = 0;
    let windowId;
    let webContentsId = 0;

    let getOpenerSuccessCallbackCalled = () => {
        customData.openerSuccessCalled = customData.openerSuccessCalled || false;
        return customData.openerSuccessCalled;
    };

    // used by the notification service to emit the ready event
    function emitNoteProxyReady() {
        raiseEventSync('notification-service-ready', true);
    }

    function asyncApiCall(action, payload = {}) {
        ipc.send(renderFrameId, 'of-window-message', {
            action,
            payload,
            isSync: false,
            singleFrameOnly: true
        });
    }

    function syncApiCall(action, payload, singleFrameOnly = true, channel = 'of-window-message') {
        let apiPackage = {
            action: action,
            payload: payload,
            isSync: true,
            singleFrameOnly: singleFrameOnly
        };

        let responsePayload = JSON.parse(ipc.sendSync(renderFrameId, channel, apiPackage)).payload;

        if (responsePayload.success) {
            return responsePayload.data;
        } else if (responsePayload.error) {
            let err = new Error(responsePayload.error.message);
            err.origStack = responsePayload.error.stack;
            throw (err);
        } else {
            throw (responsePayload.reason);
        }
    }

    function getCachedWindowOptionsSync() {
        if (!cachedOptions) {
            cachedOptions = getWindowOptionsSync();
        }
        return cachedOptions;
    }

    function getWindowOptionsSync() {
        return syncApiCall('get-current-window-options');
    }

    function getWindowIdentitySync() {
        let winOpts = getCachedWindowOptionsSync();

        return {
            uuid: winOpts.uuid,
            name: winOpts.name
        };
    }

    function getSocketServerStateSync() {
        return syncApiCall('get-websocket-state');
    }

    function generateGuidSync() {
        return syncApiCall('generate-guid');
    }

    function convertOptionsToElectronSync(options) {
        return syncApiCall('convert-options', options);
    }

    function windowExistsSync(uuid, name) {
        return syncApiCall('window-exists', {
            uuid,
            name
        });
    }

    function getIpcConfigSync() {
        return syncApiCall('get-el-ipc-config');
    }

    function getCachedBoundsSync(uuid, name) {
        let bounds;
        try {
            bounds = syncApiCall('window-get-cached-bounds', {
                uuid: uuid,
                name: name
            });
        } catch (e) {
            //we really do not need to handle this error, as its probably just that the file did not exist.
            bounds = {};
        }

        return bounds;
    }

    function getMonitorInfoSync() {
        return syncApiCall('get-monitor-info');
    }

    function getNearestDisplayrootSync(point) {
        return syncApiCall('get-nearest-display-root', point);
    }

    function updateWindowOptionsSync(name, uuid, opts) {
        return syncApiCall('update-window-options', {
            name: name,
            uuid: uuid,
            options: opts
        });
    }

    function raiseEventSync(eventName, eventArgs) {
        return syncApiCall('raise-event', {
            eventName,
            eventArgs
        });
    }

    ///THESE CALLS NEED TO BE DONE WITH REMOTE, AS THEY ARE DONE BEFORE THE CORE HAS ID's
    function getWindowId() {
        if (!windowId) {
            windowId = electron.remote.getCurrentWindow(renderFrameId).id;
        }
        return windowId;
    }

    function getWebContentsId() {
        if (!webContentsId) {
            webContentsId = electron.remote.getCurrentWebContents(renderFrameId).getId();
        }
        return webContentsId;
    }
    ////END.

    function wireUpZoomEvents() {
        // listen for zoom-in/out keyboard shortcut
        // messages sent from the browser process
        ipc.on(`zoom-${renderFrameId}`, (event, zoom) => {
            if ('level' in zoom) {
                webFrame.setZoomLevel(zoom.level);
            } else if ('increment' in zoom) {
                webFrame.setZoomLevel(zoom.increment ? Math.floor(webFrame.getZoomLevel()) + zoom.increment : 0);
            }
        });

        document.addEventListener('mousewheel', event => {
            if (!event.ctrlKey || !cachedOptions.accelerator.zoom) {
                return;
            }

            let level = Math.floor(webFrame.getZoomLevel());
            webFrame.setZoomLevel(event.wheelDelta >= 0 ? ++level : --level);
        });
    }

    function intersectsRect(bounds, rect) {
        return !(bounds.left > rect.right || (bounds.left + bounds.width) < rect.left || bounds.top > rect.bottom || (bounds.top + bounds.height) < rect.top);
    }

    function boundsVisible(bounds, monitorInfo) {
        let visible = false;
        let monitors = [monitorInfo.primaryMonitor].concat(monitorInfo.nonPrimaryMonitors);

        for (let i = 0; i < monitors.length; i++) {
            if (intersectsRect(bounds, monitors[i].monitorRect)) {
                visible = true;
            }
        }
        return visible;
    }

    function setWindowBoundsSync(uuid, name, bounds) {
        try {
            syncApiCall('set-window-bounds', {
                uuid,
                name,
                left: bounds.left,
                top: bounds.top,
                width: bounds.width,
                height: bounds.height
            });
        } catch (error) {
            console.error(error);
        }
    }

    function showWindowSync(uuid, name) {
        try {
            syncApiCall('show-window', {
                uuid,
                name
            });
        } catch (error) {
            console.error(error);
        }
    }

    function maximizeWindowSync(uuid, name) {
        try {
            syncApiCall('maximize-window', {
                uuid,
                name
            });
        } catch (error) {
            console.error(error);
        }
    }

    function minimizeWindowSync(uuid, name) {
        try {
            syncApiCall('minimize-window', {
                uuid,
                name
            });
        } catch (error) {
            console.error(error);
        }
    }

    function showOnReady(global, currWindowOpts) {
        let autoShow = currWindowOpts.autoShow;
        let toShowOnRun = currWindowOpts.toShowOnRun;
        let onFinish = callback => {
            if (autoShow || toShowOnRun) {
                callback();
            }

            updateWindowOptionsSync(currWindowOpts.name, currWindowOpts.uuid, {
                hasLoaded: true
            });
        };

        if (currWindowOpts.saveWindowState && !currWindowOpts.hasLoaded) {
            let savedBounds = getCachedBoundsSync(currWindowOpts.uuid, currWindowOpts.name);
            let monitorInfo = getMonitorInfoSync();
            let restoreBounds = savedBounds;

            if (!boundsVisible(savedBounds, monitorInfo)) {
                let displayRoot = getNearestDisplayrootSync({
                    x: savedBounds.left,
                    y: savedBounds.top
                });
                restoreBounds.top = displayRoot.y;
                restoreBounds.left = displayRoot.x;
            }

            setWindowBoundsSync(currWindowOpts.uuid, currWindowOpts.name, restoreBounds);
            onFinish(() => {
                switch (restoreBounds.windowState) {
                    case 'maximized':
                        maximizeWindowSync(currWindowOpts.uuid, currWindowOpts.name);
                        break;
                    case 'minimized':
                        minimizeWindowSync(currWindowOpts.uuid, currWindowOpts.name);
                        break;
                    default:
                        showWindowSync(currWindowOpts.uuid, currWindowOpts.name);
                        break;
                }
            });
        } else {
            onFinish(() => {
                showWindowSync(currWindowOpts.uuid, currWindowOpts.name);
            });
        }
    }

    function wireUpMenu(global) {
        global.addEventListener('contextmenu', e => {
            if (!e.defaultPrevented) {
                e.preventDefault();

                const options = getWindowOptionsSync();

                if (options.contextMenu) {
                    const identity = getWindowIdentitySync();
                    syncApiCall('show-menu', {
                        uuid: identity.uuid,
                        name: identity.name,
                        editable: e.target.matches('input, textarea, [contenteditable]'),
                        hasSelectedText: e.target.selectionStart !== e.target.selectionEnd,
                        x: e.x,
                        y: e.y
                    }, false);
                }
            }
        });
    }

    function raiseReadyEvents(currWindowOpts) {
        let winIdentity = {
            uuid: currWindowOpts.uuid,
            name: currWindowOpts.name
        };
        raiseEventSync(`window/initialized/${currWindowOpts.uuid}-${currWindowOpts.name}`, winIdentity);
        // main window
        if (currWindowOpts.uuid === currWindowOpts.name) {
            raiseEventSync(`application/initialized/${currWindowOpts.uuid}`);
        }
        raiseEventSync(`window/dom-content-loaded/${currWindowOpts.uuid}-${currWindowOpts.name}`, winIdentity);
        raiseEventSync(`window/connected/${currWindowOpts.uuid}-${currWindowOpts.name}`, winIdentity);
    }

    function deferByTick(callback) {
        setTimeout(() => {
            if (typeof(callback) === 'function') {
                callback.call(window);
            }
        }, 1);
    }

    var pendingMainCallbacks = [];
    var currPageHasLoaded = false;

    global.addEventListener('load', function() {

        //---------------------------------------------------------------
        // TODO: extract this, used to be bound to ready
        //---------------------------------------------------------------
        let winOpts = getCachedWindowOptionsSync();

        // Prevent iframes from attempting to do windowing actions, these will always be handled
        // by the main window frame.
        if (!window.frameElement) {
            showOnReady(glbl, winOpts);
        }

        // The api-ready event allows the webContents to assign api priority. This must happen after
        // any spin up windowing action or you risk stealing api priority from an already connected frame
        electron.remote.getCurrentWebContents(renderFrameId).emit('openfin-api-ready', renderFrameId);

        wireUpMenu(glbl);
        wireUpZoomEvents();
        raiseReadyEvents(winOpts);

        //TODO:Notifications to be removed from this file.
        if (/^notification-window/.test(winOpts.name) &&
            !(/^about:blank/.test(location.href))) {

            fin.desktop.InterApplicationBus.subscribe('*',
                `publish-routing-info`,
                function() {

                    fin.desktop.InterApplicationBus.publish('notification-ready', {
                        uuid: winOpts.uuid,
                        name: winOpts.name,
                        url: location.href,
                        some: 'other thing',
                        routingInfo: window.payload
                    });

                });

            fin.desktop.InterApplicationBus.publish('notification-ready', {
                uuid: winOpts.uuid,
                name: winOpts.name,
                url: location.href
            });
        }
        //---------------------------------------------------------------
        //---------------------------------------------------------------


        currPageHasLoaded = true;

        if (getOpenerSuccessCallbackCalled() || window.opener === null || winOpts.rawWindowOpen) {
            deferByTick(() => {
                pendingMainCallbacks.forEach((callback) => {
                    callback();
                });
            });
        }
    });


    function onContentReady(bindObject, callback) {

        let winOpts = getCachedWindowOptionsSync();

        if (currPageHasLoaded && (getOpenerSuccessCallbackCalled() || window.opener === null || winOpts.rawWindowOpen)) {
            deferByTick(() => {
                callback();
            });
        } else {
            pendingMainCallbacks.push(callback);
        }
    }

    function createChildWindow(options, cb) {
        let requestId = ++childWindowRequestId;
        let winOpts = getCachedWindowOptionsSync();
        // initialize what's needed to create a child window via window.open
        let url = ((options || {}).url || undefined);
        let uniqueKey = generateGuidSync();
        let frameName = `openfin-child-window-${uniqueKey}`; //((options || {}).frameName || undefined);
        let features = ((options || {}).features || undefined);
        let webContentsId = getWebContentsId();
        // Reset state machine values that are set through synchronous handshake between native WebContent lifecycle observers and JS
        options.openfin = true;

        // Force window to be a child of its parent application.
        options.uuid = winOpts.uuid;

        // Apply parent window background color to child window when child
        // window background color is unspecified.
        options.backgroundColor = options.backgroundColor || winOpts.backgroundColor;

        let responseChannel = `${frameName}-created`;
        ipc.once(responseChannel, () => {
            setTimeout(() => {
                // Synchronous execution of window.open to trigger state tracking of child window
                let nativeWindow = window.open((url !== 'about:blank' ? url : ''), frameName, features);

                let popResponseChannel = `${frameName}-pop-request`;
                ipc.once(popResponseChannel, (sender, meta) => {
                    setTimeout(() => {
                        try {
                            let returnMeta = JSON.parse(meta);
                            cb({
                                nativeWindow: nativeWindow,
                                id: returnMeta.windowId
                            });
                        } catch (e) {}
                    }, 1);
                });
                setTimeout(() => {
                    ipc.send(renderFrameId, 'pop-child-window-request', popResponseChannel, frameName, webContentsId, requestId);
                }, 1);
            }, 1);
        });

        const convertedOpts = convertOptionsToElectronSync(options);
        const { preload } = 'preload' in convertedOpts ? convertedOpts : winOpts;

        if (!(preload && preload.length)) {
            proceed(); // short-circuit preload scripts fetch
        } else {
            const preloadScriptsPayload = {
                uuid: options.uuid,
                name: options.name,
                scripts: preload
            };
            fin.__internal_.downloadPreloadScripts(preloadScriptsPayload, proceed, proceed);
        }

        function proceed() {
            // PLEASE NOTE: Must stringify options object
            ipc.send(renderFrameId, 'add-child-window-request', responseChannel, frameName, webContentsId,
                requestId, JSON.stringify(convertedOpts));
        }
    }

    global.chrome = global.chrome || {};

    global.chrome.desktop = {
        getDetails: cb => {
            let winOpts = getCachedWindowOptionsSync();
            let details = {};
            let currSocketServerState = getSocketServerStateSync();

            details.port = currSocketServerState.port;
            details.ssl = currSocketServerState.isHttps;
            details.uuid = winOpts.uuid;
            details.name = winOpts.name;
            details.options = winOpts;
            details.versions = processVersions;

            cb(details);
        }
    };

    function openerSuccessCBCalled() {
        customData.openerSuccessCalled = true;

        deferByTick(() => {
            pendingMainCallbacks.forEach((callback) => {
                callback();
            });
        });
    }

    ///external API Decorator:
    global.fin = {
        desktop: {
            main: cb => {
                if (typeof(cb) === 'function') {
                    onContentReady(window, cb);
                }
            },
            getUuid: generateGuidSync,
            getVersion: () => {
                return openfinVersion;
            }
        },
        __internal_: {
            ipc: ipc,
            routingId: renderFrameId,
            getWindowIdentity: getWindowIdentitySync,
            convertOptionsToEl: convertOptionsToElectronSync,
            getCurrentWindowId: getWindowId,
            windowExists: windowExistsSync,
            ipcconfig: getIpcConfigSync(),
            createChildWindow: createChildWindow,
            getCachedWindowOptionsSync: getCachedWindowOptionsSync,
            openerSuccessCBCalled: openerSuccessCBCalled,
            emitNoteProxyReady: emitNoteProxyReady
        }
    };

    /**
     * Preload script eval
     */
    ipc.once(`post-api-injection-${renderFrameId}`, () => {
        const winOpts = getCachedWindowOptionsSync();
        const identity = {
            uuid: winOpts.uuid,
            name: winOpts.name
        };
        const { preload: preloadOption } = convertOptionsToElectronSync(getWindowOptionsSync());
        const action = 'set-window-preload-state';

        if (preloadOption.length) { // short-circuit
            let response;
            try {
                response = syncApiCall('get-selected-preload-scripts', preloadOption);
            } catch (error) {
                logPreload('error', identity, 'error', '', error);
            }

            if (response) {
                response.forEach((script, index) => {
                    if (script !== null) {
                        const { url } = preloadOption[index];

                        try {
                            const val = window.eval(script); /* jshint ignore:line */
                            logPreload('info', identity, `eval succeeded`, url, val);
                            asyncApiCall(action, { url, state: 'succeeded' });
                        } catch (err) {
                            logPreload('error', identity, 'eval failed', url, err);
                            asyncApiCall(action, { url, state: 'failed' });
                        }
                    }
                });
            }
        }

        asyncApiCall(action, { allDone: true });
    });

    function logPreload(level, identity, state, url, data) {
        if (url) {
            state += ` for ${url}`;
        }
        if (data) {
            state += ` with ${JSON.stringify(data)}`;
        }
        const message = `[PRELOAD] [${identity.uuid}]-[${identity.name}] ${state}`;
        syncApiCall('write-to-log', { level, message });
    }

}());
