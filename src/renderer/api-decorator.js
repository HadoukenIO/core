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
    const glbl = global;
    const QUEUE_COUNTER_NAME = 'queueCounter';
    const noteGuidRegex = /^A21B62E0-16B1-4B10-8BE3-BBB6B489D862/;
    const openfinVersion = process.versions.openfin;
    const processVersions = JSON.parse(JSON.stringify(process.versions));
    let renderFrameId = glbl.routingId;
    let customData = glbl.getFrameData(renderFrameId);

    const electron = require('electron');

    // Mock webFrame if unavailable
    const webFrame = (electron.webFrame ?
        electron.webFrame.createForRenderFrame(renderFrameId) : {
            getZoomLevel: () => { return 1.0; },
            setZoomLevel: () => {}
        });

    const ipc = electron.ipcRenderer;
    let childWindowRequestId = 0;
    let windowId;
    let webContentsId = 0;

    const elIPCConfig = glbl.__startOptions.elIPCConfig;
    const entityInfo = glbl.__startOptions.entityInfo;
    const initialOptions = glbl.__startOptions.options;
    const runtimeArguments = glbl.__startOptions.runtimeArguments;
    const socketServerState = glbl.__startOptions.socketServerState;

    let getOpenerSuccessCallbackCalled = () => {
        customData.openerSuccessCalled = customData.openerSuccessCalled || false;
        return customData.openerSuccessCalled;
    };

    function isNotificationType(name) {

        const isNotification = noteGuidRegex.test(name);
        const isQueueCounter = name === QUEUE_COUNTER_NAME;

        return isNotification || isQueueCounter;
    }

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

    function getWindowIdentitySync() {

        return {
            uuid: initialOptions.uuid,
            name: initialOptions.name
        };
    }

    function getSocketServerStateSync() {
        return socketServerState;
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
        return elIPCConfig;
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
            if (!event.ctrlKey || !initialOptions.accelerator.zoom) {
                return;
            }

            let level = Math.floor(webFrame.getZoomLevel());
            webFrame.setZoomLevel(event.wheelDelta >= 0 ? ++level : --level);
        });
    }

    function wireUpMenu(global) {
        global.addEventListener('contextmenu', e => {
            if (!e.defaultPrevented) {
                e.preventDefault();

                const identity = entityInfo.entityType === 'iframe' ? entityInfo.parent : entityInfo;

                fin.desktop.Window.getCurrent().getOptions(options => {
                    if (options.contextMenu) {
                        syncApiCall('show-menu', {
                            uuid: identity.uuid,
                            name: identity.name,
                            editable: e.target.matches('input, textarea, [contenteditable]'),
                            hasSelectedText: e.target.selectionStart !== e.target.selectionEnd,
                            x: e.x,
                            y: e.y
                        }, false);
                    }
                });
            }
        });
    }

    function disableModifiedClicks(global) {
        global.addEventListener('auxclick', e => {
            e.preventDefault();
        });
        global.addEventListener('click', e => {
            const tag = e.target.tagName;
            const modifiedClick = e.shiftKey || e.metaKey || e.ctrlKey || e.altKey;
            const mightOpenNewWindow = tag === 'A' || tag === 'IMG';
            if (mightOpenNewWindow && modifiedClick) {
                e.preventDefault();
            } else if (modifiedClick && (tag === 'BUTTON' || tag === 'INPUT')) {
                if (e.target.type === 'submit') {
                    e.preventDefault();
                }

            }
        });
    }

    function raiseReadyEvents(entityInfo) {
        const { uuid, name, parent, entityType } = entityInfo;
        const winIdentity = { uuid, name };
        const parentFrameName = parent.name || name;
        const eventMap = new Map();

        eventMap.set(`window/initialized/${uuid}-${name}`, winIdentity);

        // main window
        if (uuid === name) {
            eventMap.set(`application/initialized/${uuid}`);
        }

        eventMap.set(`window/dom-content-loaded/${uuid}-${name}`, winIdentity);
        eventMap.set(`window/connected/${uuid}-${name}`, winIdentity);
        eventMap.set(`window/frame-connected/${uuid}-${parentFrameName}`, {
            frameName: name,
            entityType
        });
        eventMap.set(`frame/connected/${uuid}-${name}`, winIdentity);

        asyncApiCall('raise-many-events', [...eventMap]);
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

        // The api-ready event allows the webContents to assign api priority. This must happen after
        // any spin up windowing action or you risk stealing api priority from an already connected frame
        electron.remote.getCurrentWebContents(renderFrameId).emit('openfin-api-ready', renderFrameId);

        wireUpMenu(glbl);
        disableModifiedClicks(glbl);
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
                    const userAppConfigArgs = initialOptions.userAppConfigArgs;
                    if (userAppConfigArgs) { // handle deep linking callback
                        callback(userAppConfigArgs);
                    } else {
                        callback();
                    }
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
        let uniqueKey = fin.desktop.getUuid();
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
        const { preloadScripts } = 'preloadScripts' in convertedOpts ? convertedOpts : initialOptions;

        if (!(preloadScripts && preloadScripts.length) || isNotificationType(options.name)) {
            proceed(); // short-circuit preload scripts fetch
        } else {
            const preloadScriptsPayload = {
                uuid: options.uuid,
                name: options.name,
                scripts: preloadScripts
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
            getUuid: process.getGUID,
            getVersion: () => {
                return openfinVersion;
            }
        },
        __internal_: {
            ipc: ipc,
            routingId: renderFrameId,
            getWindowIdentity: getWindowIdentitySync,
            getCurrentWindowId: getWindowId,
            windowExists: windowExistsSync,
            ipcconfig: getIpcConfigSync(),
            createChildWindow: createChildWindow,
            getCachedWindowOptionsSync: getCachedWindowOptionsSync,
            openerSuccessCBCalled: openerSuccessCBCalled,
            emitNoteProxyReady: emitNoteProxyReady,
            initialOptions,
            entityInfo,
            runtimeArguments
        }
    };

    /**
     * An event indicating the moment OpenFin API is injected
     */
    ipc.once(`post-api-injection-${renderFrameId}`, () => {
        const { uuid, name } = initialOptions;

        if (!isNotificationType(name)) {
            if (!runtimeArguments.includes('--async-plugins')) {
                // Synchronous (old) implementation of plugin loading
                evalPlugins(uuid, name);
            }
            evalPreloadScripts(uuid, name);
        }
    });

    /**
     * Request plugin modules from the Core and execute them in the current window
     */
    function evalPlugins(uuid, name) {
        const action = 'set-window-plugin-state';
        const plugins = syncApiCall('get-plugin-modules');
        const log = (msg) => {
            asyncApiCall('write-to-log', {
                level: 'info',
                message: `[plugins] [${uuid}]-[${name}]: ${msg}`
            });
        };

        plugins.forEach((plugin) => {
            // _content: contains plugin module code as a string to eval in this window
            const { name, version, _content } = plugin;

            if (!_content) {
                log(`Skipped execution of plugin module [${name} ${version}], ` +
                    `because the content is not available`);
                return;
            }

            try {
                window.eval(_content); /* jshint ignore:line */
                log(`Succeeded execution of plugin module [${name} ${version}]`);
                asyncApiCall(action, { name, version, state: 'succeeded' });
            } catch (error) {
                window.console.error(`${error.name}: ${error.message}\nPlugin: ${name} ${version}`);
                log(`Failed execution of plugin module [${name} ${version}]`);
                asyncApiCall(action, { name, version, state: 'failed' });
            }
        });

        asyncApiCall(action, { allDone: true });
    }

    /**
     * Request preload scripts from the Core and execute them in the current window
     */
    function evalPreloadScripts(uuid, name) {
        const action = 'set-window-preload-state';
        const preloadScripts = syncApiCall('get-preload-scripts');

        const requiredScriptsFailed = preloadScripts.some((e) => {
            let isRequired = true;

            if (typeof e.mandatory === 'boolean') {
                isRequired = e.mandatory;
            } else if (typeof e.optional === 'boolean') {
                isRequired = !e.optional; // backwards compatibility
            }

            return !e._content && isRequired;
        });

        const log = (msg) => {
            asyncApiCall('write-to-log', {
                level: 'info',
                message: `[preloadScripts] [${uuid}]-[${name}]: ${msg}`
            });
        };

        if (requiredScriptsFailed) {
            // Don't evaluate preload scripts when there
            // is at least one load-failed that is required
            log(`Aborted execution of preload scripts, ` +
                `because at least one required preload script failed to load`);

        } else {
            preloadScripts.forEach((preloadScript) => {
                // _content: contains preload script code as a string to eval in this window
                const { url, _content } = preloadScript;

                if (!_content) {
                    log(`Skipped execution of preload script for URL [${url}], ` +
                        `because the content is not available`);
                    return;
                }

                try {
                    window.eval(_content); /* jshint ignore:line */
                    log(`Succeeded execution of preload script for URL [${url}]`);
                    asyncApiCall(action, { url, state: 'succeeded' });
                } catch (error) {
                    window.console.error(`${error.name}: ${error.message}\nPreload script: ${url}`);
                    log(`Failed execution of preload script for URL [${url}]: ${error}`);
                    asyncApiCall(action, { url, state: 'failed' });
                }
            });
        }

        asyncApiCall(action, { allDone: true });
    }

}());
