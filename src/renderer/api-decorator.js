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
    const initialOptions = getCurrentWindowOptionsSync();
    const entityInfo = getEntityInfoSync(initialOptions.uuid, initialOptions.name);

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
        return initialOptions;
    }

    function getCurrentWindowOptionsSync() {
        return syncApiCall('get-current-window-options');
    }

    function getWindowOptionsSync(identity) {
        return syncApiCall('get-window-options', identity);
    }

    function getEntityInfoSync(uuid, name) {
        return syncApiCall('get-entity-info', { uuid, name });
    }

    function getWindowIdentitySync() {
        let winOpts = getCurrentWindowOptionsSync();

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

                const options = getCurrentWindowOptionsSync();

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

    function raiseReadyEvents(entityInfo) {
        const { uuid, name, parent, entityType } = entityInfo;
        const winIdentity = { uuid, name };
        const parentFrameName = parent.name || name;

        raiseEventSync(`window/initialized/${uuid}-${name}`, winIdentity);

        // main window
        if (uuid === name) {
            raiseEventSync(`application/initialized/${uuid}`);
        }

        raiseEventSync(`window/dom-content-loaded/${uuid}-${name}`, winIdentity);
        raiseEventSync(`window/connected/${uuid}-${name}`, winIdentity);
        raiseEventSync(`window/frame-connected/${uuid}-${parentFrameName}`, {
            frameName: name,
            entityType
        });
        raiseEventSync(`frame/connected/${uuid}-${name}`, winIdentity);
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


        // Prevent iframes from attempting to do windowing actions, these will always be handled
        // by the main window frame.
        // TODO this needs to be revisited when we have xorigin frame api
        if (!window.frameElement) {
            showOnReady(glbl, initialOptions);
        }

        // The api-ready event allows the webContents to assign api priority. This must happen after
        // any spin up windowing action or you risk stealing api priority from an already connected frame
        electron.remote.getCurrentWebContents(renderFrameId).emit('openfin-api-ready', renderFrameId);

        wireUpMenu(glbl);
        wireUpZoomEvents();
        raiseReadyEvents(entityInfo);

        //TODO:Notifications to be removed from this file.
        if (/^notification-window/.test(initialOptions.name) &&
            !(/^about:blank/.test(location.href))) {

            fin.desktop.InterApplicationBus.subscribe('*',
                `publish-routing-info`,
                function() {

                    fin.desktop.InterApplicationBus.publish('notification-ready', {
                        uuid: initialOptions.uuid,
                        name: initialOptions.name,
                        url: location.href,
                        some: 'other thing',
                        routingInfo: window.payload
                    });

                });

            fin.desktop.InterApplicationBus.publish('notification-ready', {
                uuid: initialOptions.uuid,
                name: initialOptions.name,
                url: location.href
            });
        }
        //---------------------------------------------------------------
        //---------------------------------------------------------------


        currPageHasLoaded = true;

        if (getOpenerSuccessCallbackCalled() || window.opener === null || initialOptions.rawWindowOpen) {
            deferByTick(() => {
                pendingMainCallbacks.forEach((callback) => {
                    callback();
                });
            });
        }
    });


    function onContentReady(bindObject, callback) {

        if (currPageHasLoaded && (getOpenerSuccessCallbackCalled() || window.opener === null || initialOptions.rawWindowOpen)) {
            deferByTick(() => {
                callback();
            });
        } else {
            pendingMainCallbacks.push(callback);
        }
    }

    function createChildWindow(options, cb) {
        let requestId = ++childWindowRequestId;
        // initialize what's needed to create a child window via window.open
        let url = ((options || {}).url || undefined);
        let uniqueKey = generateGuidSync();
        let frameName = `openfin-child-window-${uniqueKey}`; //((options || {}).frameName || undefined);
        let features = ((options || {}).features || undefined);
        let webContentsId = getWebContentsId();
        // Reset state machine values that are set through synchronous handshake between native WebContent lifecycle observers and JS
        options.openfin = true;

        // Force window to be a child of its parent application.
        options.uuid = initialOptions.uuid;

        // Apply parent window background color to child window when child
        // window background color is unspecified.
        options.backgroundColor = options.backgroundColor || initialOptions.backgroundColor;

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
        const { preload } = 'preload' in convertedOpts ? convertedOpts : initialOptions;

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
            let details = {};
            let currSocketServerState = getSocketServerStateSync();

            details.port = currSocketServerState.port;
            details.ssl = currSocketServerState.isHttps;
            details.uuid = initialOptions.uuid;
            details.name = initialOptions.name;
            details.options = initialOptions;
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
            emitNoteProxyReady: emitNoteProxyReady,
            initialOptions,
            entityInfo
        }
    };

    /**
     * Preload script eval
     */
    ipc.once(`post-api-injection-${renderFrameId}`, () => {
        const { uuid, name } = initialOptions;
        const identity = { uuid, name };
        const windowOptions = entityInfo.entityType === 'iframe' ? getWindowOptionsSync(entityInfo.parent) :
            getCurrentWindowOptionsSync();

        let { plugin, preload } = convertOptionsToElectronSync(windowOptions);

        if (plugin.length) {
            evalPlugins(identity, plugin);
        }

        if (preload.length) {
            evalPreloadScripts(identity, preload);
        }
    });

    /**
     * Requests plugin contents from the Core and evals them in the current window
     */
    function evalPlugins(identity, pluginOption) {
        const action = 'set-window-plugin-state';
        let logBase = `[plugin] [${identity.uuid}]-[${identity.name}]: `;
        let plugins;

        try {
            plugins = syncApiCall('get-selected-preload-scripts', pluginOption);
        } catch (error) {
            return syncApiCall('write-to-log', { level: 'error', message: logBase + error });
        }

        plugins.forEach((plugin) => {
            const { name, version, content } = plugin;

            if (content !== null) {
                // TODO: handle empty script for bad urls

                try {
                    window.eval(content); /* jshint ignore:line */
                    asyncApiCall(action, { name, version, state: 'succeeded' });
                    syncApiCall('write-to-log', {
                        level: 'info',
                        message: logBase + `eval succeeded for ${name} ${version}`
                    });
                } catch (err) {
                    asyncApiCall(action, { name, version, state: 'failed' });
                    syncApiCall('write-to-log', {
                        level: 'info',
                        message: logBase + `eval failed for ${name} ${version}`
                    });
                }
            }
        });

        asyncApiCall(action, { allDone: true });
    }

    /**
     * Requests preload scripts contents from the Core and evals them in the current window
     */
    function evalPreloadScripts(identity, preloadOption) {
        const action = 'set-window-preload-state';
        let logBase = `[preload] [${identity.uuid}]-[${identity.name}]: `;
        let preloadScripts;

        try {
            preloadScripts = syncApiCall('get-selected-preload-scripts', preloadOption);
        } catch (error) {
            return syncApiCall('write-to-log', { level: 'error', message: logBase + error });
        }

        preloadScripts.forEach((preloadScript) => {
            const { url, content } = preloadScript;

            if (content !== null) {
                // TODO: handle empty script for bad urls

                try {
                    window.eval(content); /* jshint ignore:line */
                    asyncApiCall(action, { url, state: 'succeeded' });
                    syncApiCall('write-to-log', { level: 'info', message: logBase + `eval succeeded for ${url}` });
                } catch (err) {
                    asyncApiCall(action, { url, state: 'failed' });
                    syncApiCall('write-to-log', { level: 'error', message: logBase + `eval failed for ${err}` });
                }
            }
        });

        asyncApiCall(action, { allDone: true });
    }

}());
