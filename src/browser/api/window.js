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
    src/browser/api/window.js
 */

// build-in modules
let fs = require('fs');
let path = require('path');
let url = require('url');
let electron = require('electron');
let BrowserWindow = electron.BrowserWindow;
let electronApp = electron.app;
let Menu = electron.Menu;
let nativeImage = electron.nativeImage;

// npm modules
let _ = require('underscore');

// local modules
let animations = require('../animations.js');
let authenticationDelegate = require('../authentication_delegate.js');
let BoundsChangedStateTracker = require('../bounds_changed_state_tracker.js');
let clipBounds = require('../clip_bounds.js').default;
let convertOptions = require('../convert_options.js');
let coreState = require('../core_state.js');
let ExternalWindowEventAdapter = require('../external_window_event_adapter.js');
import {
    cachedFetch
} from '../cached_resource_fetcher';
let log = require('../log');
import ofEvents from '../of_events';
let ProcessTracker = require('../process_tracker.js');
let regex = require('../../common/regex');
let subscriptionManager = new require('../subscription_manager.js').SubscriptionManager();
let WindowGroups = require('../window_groups.js');
import {
    validateNavigation,
    navigationValidator
} from '../navigation_validation';


// locals
const isWin32 = process.platform === 'win32';
const windowPosCacheFolder = 'winposCache';
const userCache = electronApp.getPath('userCache');

let Window = {};

let browserWindowEventMap = {
    'api-injection-failed': {
        topic: 'api-injection-failed'
    },
    'blur': {
        topic: 'blurred'
    },
    'synth-bounds-change': {
        topic: 'bounds-changing', // or bounds-changed
        decorator: boundsChangeDecorator
    },
    'close': {
        topic: 'close-requested',
        decorator: closeRequestedDecorator
    },
    'disabled-frame-bounds-changed': {
        topic: 'disabled-frame-bounds-changed',
        decorator: disabledFrameBoundsChangeDecorator
    },
    'disabled-frame-bounds-changing': {
        topic: 'disabled-frame-bounds-changing',
        decorator: disabledFrameBoundsChangeDecorator
    },
    'focus': {
        topic: 'focused'
    },
    'opacity-changed': {
        decorator: opacityChangedDecorator
    },
    'user-movement-disabled': {
        topic: 'frame-disabled'
    },
    'user-movement-enabled': {
        topic: 'frame-enabled'
    },
    'visibility-changed': {
        topic: 'hidden', // or 'shown'
        decorator: visibilityChangedDecorator
    },
    'maximize': {
        topic: 'maximized'
    },
    'minimize': {
        topic: 'minimized'
    },
    'restore': {
        topic: 'restored'
    },
    'resize': {
        topic: 'bounds-changing',
        decorator: boundsChangeDecorator
    },
    'unmaximize': {
        topic: 'restored'
    }
    // 'move': {
    //     topic: 'bounds-changing'
    // }
};

let webContentsEventMap = {
    'did-get-response-details': {
        topic: 'resource-response-received',
        decorator: responseReceivedDecorator
    },
    'did-fail-load': {
        topic: 'resource-load-failed',
        decorator: loadFailedDecorator
    }
};

/*
    For the bounds stuff, looks like 5.0 does not take actions until the
    window moves or has a resizing event. that is the same here. in the
    future we can explicitly set them if, say, you are larger than a max
    that you just set
*/
let optionSetters = {
    contextMenu: function(newVal, browserWin) {
        let contextMenuBool = !!newVal;

        setOptOnBrowserWin('contextMenu', contextMenuBool, browserWin);
        browserWin.setMenu(null);
    },
    frame: function(newVal, browserWin) {
        let frameBool = !!newVal;

        setOptOnBrowserWin('frame', frameBool, browserWin);
        browserWin.setHasFrame(frameBool);

        if (!frameBool) {
            // reapply corner rounding
            let cornerRounding = getOptFromBrowserWin('cornerRounding', browserWin, {
                width: 0,
                height: 0
            });
            browserWin.setRoundedCorners(cornerRounding.width, cornerRounding.height);

            // reapply resize region
            applyAdditionalOptionsToWindowOnVisible(browserWin, () => {
                let resizeRegion = getOptFromBrowserWin('resizeRegion', browserWin, {
                    size: 2,
                    bottomRightCorner: 4
                });
                browserWin.setResizeRegion(resizeRegion.size);
                browserWin.setResizeRegionBottomRight(resizeRegion.bottomRightCorner);
            });
        }
    },
    alphaMask: function(newVal, browserWin) {
        if (!newVal || typeof newVal.red !== 'number' || typeof newVal.green !== 'number' || typeof newVal.blue !== 'number') {
            return;
        }

        applyAdditionalOptionsToWindowOnVisible(browserWin, () => {
            browserWin.setAlphaMask(newVal.red, newVal.green, newVal.blue);
        });
        setOptOnBrowserWin('alphaMask', newVal, browserWin);
    },
    hideOnClose: function(newVal, browserWin) {
        let newHideOnCloseBool = !!newVal; // ensure bool
        let oldHideOnCloseBool = getOptFromBrowserWin('hideOnClose', browserWin, false);

        let uuid = browserWin._options.uuid;
        let name = browserWin._options.name;
        let openfinWindow = Window.wrap(uuid, name);
        let hideOnCloseListener = openfinWindow.hideOnCloseListener;
        let closeEventString = `window/close-requested/${uuid}-${name}`;

        if (newHideOnCloseBool && !oldHideOnCloseBool) {
            ofEvents.on(closeEventString, hideOnCloseListener);
        } else if (!newHideOnCloseBool && oldHideOnCloseBool) {
            ofEvents.removeListener(closeEventString, hideOnCloseListener);
        }

        setOptOnBrowserWin('hideOnClose', newHideOnCloseBool, browserWin);
    },
    alwaysOnTop: function(newVal, browserWin) {
        var onTopBool = !!newVal; // ensure bool

        browserWin.setAlwaysOnTop(onTopBool);
        setOptOnBrowserWin('alwaysOnTop', onTopBool, browserWin);
    },
    cornerRounding: function(newVal, browserWin) {
        if (!newVal || typeof newVal.width !== 'number' || typeof newVal.height !== 'number') {
            return;
        }

        let frame = getOptFromBrowserWin('frame', browserWin, true);
        if (!frame) {
            browserWin.setRoundedCorners(newVal.width, newVal.height);
        }
        setOptOnBrowserWin('cornerRounding', newVal, browserWin);
    },
    maxHeight: function(newVal, browserWin) {
        var maxWidth = getOptFromBrowserWin('maxWidth', browserWin, -1);

        browserWin.setMaximumSize(maxWidth, newVal);
        setOptOnBrowserWin('maxHeight', newVal, browserWin);
    },
    maxWidth: function(newVal, browserWin) {
        var maxHeight = getOptFromBrowserWin('maxHeight', browserWin, -1);

        browserWin.setMaximumSize(newVal, maxHeight);
        setOptOnBrowserWin('maxWidth', newVal, browserWin);
    },
    maximizable: function(newVal, browserWin) {
        let maxBool = !!newVal;

        browserWin.setMaximizable(maxBool);
        setOptOnBrowserWin('maximizable', maxBool, browserWin);
    },
    minimizable: function(newVal, browserWin) {
        let minBool = !!newVal;

        browserWin.setMinimizable(minBool);
        setOptOnBrowserWin('minimizable', minBool, browserWin);
    },
    minHeight: function(newVal, browserWin) {
        var minWidth = getOptFromBrowserWin('minWidth', browserWin, -1);

        browserWin.setMinimumSize(minWidth, newVal);
        setOptOnBrowserWin('minHeight', newVal, browserWin);
    },
    minWidth: function(newVal, browserWin) {
        var minHeight = getOptFromBrowserWin('minHeight', browserWin, -1);

        browserWin.setMinimumSize(newVal, minHeight);
        setOptOnBrowserWin('minWidth', newVal, browserWin);
    },
    opacity: function(newVal, browserWin) {
        if (typeof newVal !== 'number') {
            return;
        }

        let frame = getOptFromBrowserWin('frame', browserWin, true);
        if (frame) {
            // TODO Kick an error or deprecated message to the renderer process
            //      indicating that the opacity should only be set when frameless.
            //      5.0 allows you to do this, but it's not desireable
            console.log('Opacity only supported on frameless windows');
        }

        let opacity = newVal;
        opacity = opacity < 0 ? 0 : opacity;
        opacity = opacity > 1 ? 1 : opacity;

        applyAdditionalOptionsToWindowOnVisible(browserWin, () => {
            browserWin.setOpacity(opacity);
        });
        setOptOnBrowserWin('opacity', opacity, browserWin);
    },
    resizable: function(newVal, browserWin) {
        var resizeBool = !!newVal; // ensure bool val

        browserWin.setResizable(resizeBool);
        setOptOnBrowserWin('resizable', resizeBool, browserWin);
    },
    icon: function(newVal, browserWin) {
        if (typeof newVal !== 'string') {
            return;
        }
        setOptOnBrowserWin('icon', newVal, browserWin);
        setTaskbarIcon(browserWin, getWinOptsIconUrl(browserWin._options));
    },
    taskbarIcon: function(newVal, browserWin) {
        if (typeof newVal !== 'string') {
            return;
        }
        setOptOnBrowserWin('taskbarIcon', newVal, browserWin);
        // NOTE: as long as 'icon' is defined, this will never have any effect
        setTaskbarIcon(browserWin, getWinOptsIconUrl(browserWin._options));
    },
    applicationIcon: function(newVal, browserWin) {
        if (typeof newVal !== 'string') {
            return;
        }
        setOptOnBrowserWin('applicationIcon', newVal, browserWin);
        // NOTE: as long as 'icon' and 'taskbarIcon' are defined, this will never have any effect
        setTaskbarIcon(browserWin, getWinOptsIconUrl(browserWin._options));
    },
    resizeRegion: function(newVal, browserWin) {
        if (!newVal || typeof newVal.size !== 'number' || typeof newVal.bottomRightCorner !== 'number') {
            return;
        }

        applyAdditionalOptionsToWindowOnVisible(browserWin, () => {
            let frame = getOptFromBrowserWin('frame', browserWin, true);
            if (!frame) {
                browserWin.setResizeRegion(newVal.size);
                browserWin.setResizeRegionBottomRight(newVal.bottomRightCorner);
            }
        });
        setOptOnBrowserWin('resizeRegion', newVal, browserWin);
    },
    hasLoaded: function(newVal, browserWin) {
        if (typeof(newVal) === 'boolean') {
            browserWin._options.hasLoaded = newVal;
        }
    },
    showTaskbarIcon: function(newVal, browserWin) {
        let showTaskbarIconBool = !!newVal;
        setOptOnBrowserWin('showTaskbarIcon', showTaskbarIconBool, browserWin);
        browserWin.setSkipTaskbar(!showTaskbarIconBool);
    }
};


Window.create = function(id, opts) {
    let name = opts.name;
    let uuid = opts.uuid;
    let identity = {
        name,
        uuid
    };
    let baseOpts;
    let uuidname;
    let browserWindow;
    let _openListeners;
    let webContents;
    let _options;
    let _boundsChangedHandler;
    let groupUuid = null; // windows by default don't belong to any groups
    let urlBeforeunload;

    let hideReason = 'hide';
    let hideOnCloseListener = () => {
        let openfinWindow = Window.wrap(uuid, name);
        openfinWindow.hideReason = 'hide-on-close';
        browserWindow.hide();
    };

    function onDidUnload() {
        urlBeforeunload = webContents ? webContents.getURL() : null;
    }

    function onDocumentLoaded() {
        const url = webContents.getURL();
        if (url === urlBeforeunload) {
            emitReloadedEvent({
                uuid,
                name
            }, url);
        }
        urlBeforeunload = '';
    }

    let _externalWindowEventAdapter;

    // we need to be able to handle the wrapped case, ie. dont try to
    // grab the browser window instance because it may not exist, or
    // perhaps just try ...
    if (!opts._noregister) {

        browserWindow = BrowserWindow.fromId(id);

        // this is a first pass at teardown. for now, push the unsubscribe
        // function for each subscription you make, on closed, remove them all
        // if you listen on 'closed' it will crash as your resources are
        // already gone at that point
        _openListeners = [];

        webContents = browserWindow.webContents;

        //Legacy 5.0 feature, if customWindowAlert flag is found all alerts will be suppresed,
        //instead we will raise application event : 'window-alert-requested'.
        if (coreState.getAppObjByUuid(identity.uuid)._options.customWindowAlert) {
            handleCustomAlerts(id, opts);
        }
        // each window now inherits the main window's base options. this can
        // be made to be the parent's options if that makes more sense...
        baseOpts = coreState.getMainWindowOptions(id) || {};
        _options = _.extend(_.clone(baseOpts), convertOptions.convertToElectron(opts));

        // (taskbar) a child window should be grouped in with the application
        // if a taskbarIconGroup isn't specified
        _options.taskbarIconGroup = _options.taskbarIconGroup || baseOpts.uuid;

        // inherit from mainWindow unless specified
        _options.frameConnect = _options.frameConnect || baseOpts.frameConnect || 'last';

        // pass along if we should show once DOMContentLoaded. this gets used
        // in the api-decorator DOMContentLoaded listener
        _options.toShowOnRun = opts.toShowOnRun;

        // we need to know if this window has been loaded successfully at least once.
        _options.hasLoaded = false;

        uuid = _options.uuid;
        name = _options.name;
        uuidname = `${uuid}-${name}`;
        const WINDOW_UNLOAD_EVENT = `window/unload/${uuid}/${name}`;
        const WINDOW_DOCUMENT_LOADED = 'document-loaded';

        browserWindow._options = _options;

        // set taskbar icon
        setTaskbar(browserWindow);

        // apply options to browserWindow
        applyAdditionalOptionsToWindow(browserWindow);

        // Handles state tracking for bounds-chang(ed/ing) event tracking.
        // When a valid change state is detected, the event 'synth-bounds-change'
        // is emitted containing a majority of the 5.0 style payload
        //
        _boundsChangedHandler = new BoundsChangedStateTracker(uuid, name, browserWindow);

        // external window listeners
        if (browserWindow.isExternalWindow()) {
            _externalWindowEventAdapter = new ExternalWindowEventAdapter(browserWindow);
        }

        let teardownListeners = () => {
            // tear down any listeners...
            _openListeners.forEach(unhook => {
                unhook();
            });

            //tear down any listeners on external event emitters.
            ofEvents.removeListener(WINDOW_UNLOAD_EVENT, onDidUnload);
            webContents.removeListener(WINDOW_DOCUMENT_LOADED, onDocumentLoaded);
        };

        let windowTeardown = createWindowTearDown(identity, id);

        //wire up unload/navigate events for reload.
        ofEvents.on(WINDOW_UNLOAD_EVENT, onDidUnload);
        webContents.on(WINDOW_DOCUMENT_LOADED, onDocumentLoaded);

        // once the window is closed, be sure to close all the children
        // it may have and remove it from the
        browserWindow.on('close', (event) => {
            let ofWindow = Window.wrap(uuid, name);
            let closeEventString = `window/close-requested/${uuidname}`;
            let listenerCount = ofEvents.listenerCount(closeEventString);

            // here we can only prevent electron windows, not external windows, from closing when the 'x' button is clicked.
            // external windows will need to be handled on the adapter side
            if (listenerCount && !ofWindow.forceClose && !browserWindow.isExternalWindow()) {
                if (!browserWindow.isDestroyed()) {
                    event.preventDefault();
                    return;
                }
            }

            ofEvents.emit(`window/synth-close/${uuidname}`, {
                name,
                uuid,
                topic: 'window',
                type: 'synth-close'
            });

            // can't unhook when the 'closed' event fires; browserWindow is already destroyed then
            browserWindow.webContents.removeAllListeners('page-favicon-updated');

            // make sure that this uuid/name combo does not have any lingering close-requested subscriptions.
            ofEvents.removeAllListeners(closeEventString);
        });

        browserWindow.on('closed', () => {
            if (browserWindow._options.saveWindowState) {
                let cachedBounds = _boundsChangedHandler.getCachedBounds();
                saveBoundsToDisk(identity, cachedBounds, err => {
                    if (err) {
                        log.writeToLog('info', err);
                    }
                    windowTeardown();
                    // These were causing an exception on close if the window was reloaded
                    _boundsChangedHandler.teardown();
                    teardownListeners();
                });
            } else {
                windowTeardown();
                _boundsChangedHandler.teardown();
                teardownListeners();
            }
        });

        let mapEvents = function(eventMap, eventEmitter) {
            // todo this should be on demand, for now just blast them all
            Object.keys(eventMap).forEach(evnt => {
                var mappedMeta = eventMap[evnt];
                var mappedTopic = mappedMeta.topic || '';

                var electronEventListener = function( /*event , arg1, ... */ ) {

                    // if the window has already been removed from core_state,
                    // don't propogate anymore events
                    if (!Window.wrap(uuid, name)) {
                        return;
                    }

                    // Bare minimum shape of an OpenFin window event payload
                    let payload = {

                        // todo: remove this hard-code
                        //reason: 'self',
                        name,
                        uuid,
                        topic: 'window',
                        type: mappedTopic /* May be overridden by decorator */
                    };

                    let eventString = `window/${payload.type}/${uuidname}`;
                    let decoratorFn = mappedMeta.decorator || noOpDecorator;

                    // Payload is modified by the decorator and returns true on success
                    if (decoratorFn(payload, arguments)) {
                        // Let the decorator apply changes to the type
                        eventString = `window/${payload.type}/${uuidname}`;
                        ofEvents.emit(eventString, payload);
                    }
                };

                eventEmitter.on(evnt, electronEventListener);

                // push the unhooking functions in to the queue
                _openListeners.push(() => {
                    eventEmitter.removeListener(evnt, electronEventListener);
                });
            });
        };

        mapEvents(browserWindowEventMap, browserWindow);
        mapEvents(webContentsEventMap, webContents);

        // hideOnClose is deprecated; treat it as if it's just another
        // listener on the 'close-requested' event
        if (getOptFromBrowserWin('hideOnClose', browserWindow, false)) {
            let closeEventString = `window/close-requested/${uuidname}`;
            ofEvents.on(closeEventString, hideOnCloseListener);
        }

        // Event listener for group changed
        let groupChangedEventString = 'group-changed';
        let groupChangedListener = (event) => {
            var _win = coreState.getWindowByUuidName(uuid, name) || {};
            var _groupUuid = _win.groupUuid || null;

            if (event.groupUuid === _groupUuid) {
                var payload = event.payload;

                payload.name = name;
                /* jshint ignore:start */
                payload.uuid = _win.app_uuid;
                /* jshint ignore:end */

                if (payload.reason === 'disband') {
                    payload.memberOf = 'nothing';
                } else if (payload.reason === 'leave') {
                    payload.memberOf = payload.sourceWindowName === name ? 'nothing' : 'source';
                } else {
                    var isSource = _.find(payload.sourceGroup, {
                        windowName: name
                    });
                    payload.memberOf = isSource ? 'source' : 'target';
                }

                var eventString = `window/${payload.type}/${uuidname}`;
                ofEvents.emit(eventString, payload);
            }
        };
        let groupChangedUnsubscribe = () => {
            WindowGroups.removeListener(groupChangedEventString, groupChangedListener);
        };

        WindowGroups.on(groupChangedEventString, groupChangedListener);
        subscriptionManager.registerSubscription(groupChangedUnsubscribe, identity, groupChangedEventString);

        // Event listener for external process started
        let synthProcessStartedEventString = `synth-process-started/${uuidname}`;
        let synthProcessStartedListener = (payload) => {
            var eventString = `window/external-process-started/${uuidname}`;

            ofEvents.emit(eventString, _.extend(payload, {
                name,
                uuid,
                topic: 'window',
                type: 'external-process-started'
            }));
        };
        let synthProcessStartedUnsubscribe = () => {
            ProcessTracker.removeListener(synthProcessStartedEventString, synthProcessStartedListener);
        };

        ProcessTracker.on(synthProcessStartedEventString, synthProcessStartedListener);
        subscriptionManager.registerSubscription(synthProcessStartedUnsubscribe, identity, synthProcessStartedEventString);

        // Event listener for external process termination
        let synthProcessTerminatedEventString = `synth-process-terminated/${uuidname}`;
        let synthProcessTerminatedListener = (payload) => {
            var eventString = `window/external-process-exited/${uuidname}`;

            ofEvents.emit(eventString, _.extend(payload, {
                name,
                uuid,
                topic: 'window',
                type: 'external-process-exited'
            }));
        };
        let synthProcessTerminatedUnsubscribe = () => {
            ProcessTracker.removeListener(synthProcessTerminatedEventString, synthProcessTerminatedListener);
        };

        ProcessTracker.on(synthProcessTerminatedEventString, synthProcessTerminatedListener);
        subscriptionManager.registerSubscription(synthProcessTerminatedUnsubscribe, identity, synthProcessTerminatedEventString);

        // will-navigate URL for white/black listing
        const navValidator = navigationValidator(uuid, name, id);
        validateNavigation(webContents, identity, navValidator);

        let startLoadingSubscribe = (event, url) => {
            ofEvents.emit(`application/window-start-load/${uuid}`, {
                name,
                uuid,
                url
            });
        };
        let startLoadingString = 'did-start-loading';
        webContents.on(startLoadingString, startLoadingSubscribe);
        let startLoadingUnsubscribe = () => {
            webContents.removeListener(startLoadingString, startLoadingSubscribe);
        };
        subscriptionManager.registerSubscription(startLoadingUnsubscribe, identity, startLoadingString);

        let documentLoadedSubscribe = (event, isMain, documentName) => {
            if (isMain && uuid === name) { // main window
                ofEvents.emit(`application/ready/${uuid}`, {
                    type: 'ready',
                    uuid
                });
            }
            ofEvents.emit(`application/window-end-load/${uuid}`, {
                name,
                uuid,
                isMain,
                documentName
            });

            ofEvents.emit(`application/window-end-load`, {
                name,
                uuid
            });
        };
        let documentLoadedString = 'document-loaded';
        webContents.on(documentLoadedString, documentLoadedSubscribe);
        let documentLoadedUnsubscribe = () => {
            webContents.removeListener(documentLoadedString, documentLoadedSubscribe);
        };
        subscriptionManager.registerSubscription(documentLoadedUnsubscribe, identity, documentLoadedString);

        // picked up in src/browser/external_connection/interappbus_external_api.js
        // hooks up (un)subscribe listeners
        ofEvents.emit(`window/init-subscription-listeners`, {
            name,
            uuid
        });

        let constructorCallbackMessage = {
            success: true
        };

        let emitErrMessage = (errCode) => {
            let chromeErrLink = 'https://cs.chromium.org/chromium/src/net/base/net_error_list.h';

            constructorCallbackMessage.success = false;
            constructorCallbackMessage.data = {
                networkErrorCode: errCode,
                message: `error #${errCode}. See ${chromeErrLink} for details`
            };

            ofEvents.emit(`window/fire-constructor-callback/${uuid}-${name}`, constructorCallbackMessage);
        };

        let resourceResponseReceivedHandler, resourceLoadFailedHandler;

        let resourceResponseReceivedEventString = `window/resource-response-received/${uuidname}`;
        let resourceLoadFailedEventString = `window/resource-load-failed/${uuidname}`;

        let httpResponseCode = null;

        resourceResponseReceivedHandler = (details) => {
            httpResponseCode = details.httpResponseCode;
            ofEvents.removeListener(resourceLoadFailedEventString, resourceLoadFailedHandler);
        };

        resourceLoadFailedHandler = (failure) => {
            if (failure.errorCode === -3) {
                // 304 can trigger net::ERR_ABORTED, ignore it
                electronApp.vlog(1, `ignoring net error -3 for ${failure.validatedURL}`);
            } else {
                emitErrMessage(failure.errorCode);
                ofEvents.removeListener(resourceResponseReceivedEventString, resourceResponseReceivedHandler);
            }
        };

        if (opts.url === 'about:blank') {
            webContents.once('did-finish-load', () => {
                constructorCallbackMessage.data = {
                    httpResponseCode
                };
                ofEvents.emit(`window/fire-constructor-callback/${uuid}-${name}`, constructorCallbackMessage);
            });

        } else {
            ofEvents.once(resourceResponseReceivedEventString, resourceResponseReceivedHandler);
            ofEvents.once(resourceLoadFailedEventString, resourceLoadFailedHandler);
            ofEvents.once(`window/connected/${uuidname}`, () => {
                constructorCallbackMessage.data = {
                    httpResponseCode,
                    apiInjected: true
                };
                ofEvents.emit(`window/fire-constructor-callback/${uuid}-${name}`, constructorCallbackMessage);
            });
            ofEvents.once(`window/api-injection-failed/${uuidname}`, () => {
                electronApp.vlog(1, `api-injection-failed ${uuidname}`);
                // can happen if child window has a different domain.   @TODO allow injection for different domains
                if (_options.autoShow) {
                    browserWindow.show();
                }
                constructorCallbackMessage.data = {
                    httpResponseCode,
                    apiInjected: false
                };
                ofEvents.emit(`window/fire-constructor-callback/${uuid}-${name}`, constructorCallbackMessage);
            });
        }

    } // end noregister

    var winObj = {
        name,
        uuid,
        _options,
        _openListeners,
        id,
        browserWindow,
        groupUuid,
        hideReason,
        hideOnCloseListener,

        forceClose: false,

        /* jshint ignore:start */

        app_uuid: uuid, // this is a 5.0 requirement

        /* jshint ignore:end */

        children: [],

        // TODO this should be removed once it's safe in favor of the
        //      more descriptive browserWindow key
        _window: browserWindow
    };

    if (!coreState.getWinObjById(id)) {
        coreState.setWindowObj(id, winObj);

        ofEvents.emit(`application/window-created/${uuid}`, {
            topic: 'application',
            type: 'window-created',
            uuid,
            name
        });
    }

    return winObj;
};


Window.wrap = function(uuid, name) {
    return coreState.getWindowByUuidName(uuid, name);
};

Window.connected = function() {};

Window.isEmbedded = function() {};

Window.addEventListener = function(identity, targetIdentity, type, listener) {
    // TODO this leaves it up the the app to unsubscribe and is a potential
    //      leak. perhaps we need a way to unhook when an app disconnects
    //      automatically

    var uuidname = `${targetIdentity.uuid}-${targetIdentity.name}`;
    //should we check that the type is valid, probably...

    //should we check that the type is valid, probably...
    let eventString = `window/${type}/${uuidname}`;
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

    electronApp.vlog(1, `addEventListener ${eventString}`);
    ofEvents.on(eventString, safeListener);

    unsubscribe = () => {
        ofEvents.removeListener(eventString, safeListener);
    };
    return unsubscribe;
};

Window.animate = function(identity, transitions, options = {}, callback = () => {}, errorCallback = () => {}) {
    let browserWindow = getElectronBrowserWindow(identity);

    if (!browserWindow) {
        callback();
        return;
    }

    let animationMeta = transitions || {};
    let animationTween = (options && options.tween) || 'ease-in-out';
    animationMeta.interrupt = (options || {}).interrupt;
    if (typeof animationMeta.interrupt !== 'boolean') {
        animationMeta.interrupt = true;
    }

    animations.getAnimationHandler().add(browserWindow, animationMeta, animationTween, callback, errorCallback);
};

Window.blur = function(identity) {
    let browserWindow = getElectronBrowserWindow(identity);

    if (!browserWindow) {
        return;
    }

    browserWindow.blur();
};

Window.bringToFront = function(identity) {
    let browserWindow = getElectronBrowserWindow(identity);

    if (!browserWindow) {
        return;
    }

    browserWindow.bringToFront();
};


// TODO investigate the close sequence, there appears to be a case were you
// try to wrap and close an already closed window
Window.close = function(identity, force, callback = () => {}) {
    let browserWindow = getElectronBrowserWindow(identity);

    if (!browserWindow) {
        callback();
        return;
    }

    let payload = {
        force
    };

    let defaultAction = () => {
        if (!browserWindow.isDestroyed()) {
            let openfinWindow = Window.wrap(identity.uuid, identity.name);
            openfinWindow.forceClose = true;
            browserWindow.close();
        }
    };

    ofEvents.once(`window/closed/${identity.uuid}-${identity.name}`, () => {
        callback();
    });

    handleForceActions(identity, force, 'close-requested', payload, defaultAction);
};


Window.disableFrame = function(identity) {
    let browserWindow = getElectronBrowserWindow(identity);

    if (!browserWindow) {
        return;
    }

    browserWindow.setUserMovementEnabled(false);
};

Window.embed = function(identity, parentHwnd) {
    let browserWindow = getElectronBrowserWindow(identity);

    if (!browserWindow) {
        return;
    }

    if (isWin32) {
        browserWindow.setMessageObserver(0x0100, parentHwnd); // WM_KEYDOWN
        browserWindow.setMessageObserver(0x0101, parentHwnd); // WM_KEYUP
        browserWindow.setMessageObserver(0x0104, parentHwnd); // WM_SYSKEYDOWN
        browserWindow.setMessageObserver(0x0105, parentHwnd); // WM_SYSKEYUP
    }

    ofEvents.emit(`window/embedded/${identity.uuid}-${identity.name}`, {
        topic: 'window',
        type: 'window-embedded',
        name: identity.name,
        uuid: identity.uuid
    });
};

Window.enableFrame = function(identity) {
    let browserWindow = getElectronBrowserWindow(identity);

    if (!browserWindow) {
        return;
    }

    browserWindow.setUserMovementEnabled(true);
};

Window.executeJavascript = function(identity, code, callback = () => {}) {
    let browserWindow = getElectronBrowserWindow(identity);

    if (!browserWindow) {
        callback(new Error(`Could not locate window '${identity.name}'`));
        return;
    }

    browserWindow.webContents.executeJavaScript(code, true, (result) => {
        callback(undefined, result);
    });
};

Window.flash = function(identity) {
    let browserWindow = getElectronBrowserWindow(identity);

    if (!browserWindow) {
        return;
    }

    browserWindow.flashFrame(true);
};

Window.stopFlashing = function(identity) {
    let browserWindow = getElectronBrowserWindow(identity);

    if (!browserWindow) {
        return;
    }

    browserWindow.flashFrame(false);
};

Window.focus = function(identity) {
    let browserWindow = getElectronBrowserWindow(identity);

    if (!browserWindow) {
        return;
    }

    browserWindow.focus();
};

Window.getBounds = function(identity) {
    let browserWindow = getElectronBrowserWindow(identity);

    if (!browserWindow) {
        return {
            height: 0,
            left: -1,
            top: -1,
            width: 0,
            right: -1,
            bottom: -1
        };
    }

    let bounds = browserWindow.getBounds();

    //5.0 Compatibility:
    //right and bottom should not be documented.
    return {
        height: bounds.height,
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        right: bounds.width + bounds.x,
        bottom: bounds.height + bounds.y
    };
};


Window.getGroup = function(identity) {
    let browserWindow = getElectronBrowserWindow(identity);

    if (!browserWindow) {
        return [];
    }

    let openfinWindow = Window.wrap(identity.uuid, identity.name);
    return WindowGroups.getGroup(openfinWindow.groupUuid);
};


Window.getWindowInfo = function(identity) {
    let browserWindow = getElectronBrowserWindow(identity, 'get info for');
    let webContents = browserWindow.webContents;

    return {
        url: webContents.getURL(),
        title: webContents.getTitle(),
        canNavigateForward: webContents.canGoForward(),
        canNavigateBack: webContents.canGoBack()
    };
};


Window.getAbsolutePath = function(identity, path) {
    let browserWindow = getElectronBrowserWindow(identity, 'get URL for');
    let windowURL = browserWindow.webContents.getURL();

    return (path || path === 0) ? url.resolve(windowURL, path) : '';
};


Window.getNativeId = function(identity) {
    let browserWindow = getElectronBrowserWindow(identity, 'get ID for');

    return browserWindow.nativeId;
};


Window.getNativeWindow = function() {};


Window.getOptions = function(identity) {
    let browserWindow = getElectronBrowserWindow(identity, 'get options for');

    return browserWindow._options;
};

Window.getParentApplication = function() {
    let app = coreState.getAppByWin(this.id);

    return app && app.appObj;
};


Window.getParentWindow = function() {};

/**
 * Fetches window's preload script and gets its content
 */
Window.getPreloadScript = function(identity, preloadUrl, callback) {
    cachedFetch(identity.uuid, preloadUrl, (fetchError, scriptPath) => {
        if (fetchError) {
            return callback(new Error(`Failed to fetch preload script from ${preloadUrl}`));
        }

        fs.readFile(scriptPath, 'utf8', (readError, content) => {
            if (readError) {
                callback(new Error('Failed to read the content of the preload script'));
            } else {
                callback(null, content);
            }
        });
    });
};


Window.getSnapshot = function(identity, callback = () => {}) {
    let browserWindow = getElectronBrowserWindow(identity);

    if (!browserWindow) {
        callback(new Error(`Unknown window named '${identity.name}'`));
        return;
    }

    browserWindow.capturePage(img => {
        callback(undefined, img.toPng().toString('base64'));
    });
};


Window.getState = function(identity) {
    let browserWindow = getElectronBrowserWindow(identity);

    if (browserWindow && browserWindow.isMinimized()) {
        return 'minimized';
    } else if (browserWindow && browserWindow.isMaximized()) {
        return 'maximized';
    } else {
        return 'normal';
    }
};


Window.hide = function(identity) {
    let browserWindow = getElectronBrowserWindow(identity);

    if (!browserWindow) {
        return;
    }

    browserWindow.hide();
};


Window.isShowing = function(identity) {
    let browserWindow = getElectronBrowserWindow(identity);

    return !!(browserWindow && browserWindow.isVisible());
};


Window.joinGroup = function(identity, grouping) {
    let identityOfWindow = Window.wrap(identity.uuid, identity.name);
    let groupingOfWindow = Window.wrap(grouping.uuid, grouping.name);
    let identityBrowserWindow = identityOfWindow && identityOfWindow.browserWindow;
    let groupingBrowserWindow = groupingOfWindow && groupingOfWindow.browserWindow;

    if (!identityBrowserWindow || !groupingBrowserWindow) {
        return;
    }

    WindowGroups.joinGroup(identityOfWindow, groupingOfWindow);
};


Window.leaveGroup = function(identity) {
    let browserWindow = getElectronBrowserWindow(identity);

    if (!browserWindow) {
        return;
    }

    let openfinWindow = Window.wrap(identity.uuid, identity.name);
    WindowGroups.leaveGroup(openfinWindow);
};


Window.maximize = function(identity) {
    let browserWindow = getElectronBrowserWindow(identity, 'maximize');
    let maximizable = getOptFromBrowserWin('maximizable', browserWindow, true);
    if (maximizable) {
        browserWindow.maximize();
    }
};


Window.mergeGroups = function(identity, grouping) {
    let identityOfWindow = Window.wrap(identity.uuid, identity.name);
    let groupingOfWindow = Window.wrap(grouping.uuid, grouping.name);
    let identityBrowserWindow = identityOfWindow && identityOfWindow.browserWindow;
    let groupingBrowserWindow = groupingOfWindow && groupingOfWindow.browserWindow;

    if (!identityBrowserWindow || !groupingBrowserWindow) {
        return;
    }

    WindowGroups.mergeGroups(identityOfWindow, groupingOfWindow);
};


Window.minimize = function(identity) {
    let browserWindow = getElectronBrowserWindow(identity, 'minimize');
    let minimizable = getOptFromBrowserWin('minimizable', browserWindow, true);
    if (minimizable) {
        browserWindow.minimize();
    }
};


Window.moveBy = function(identity, deltaLeft, deltaTop) {
    let browserWindow = getElectronBrowserWindow(identity);

    if (!browserWindow) {
        return;
    }

    let currentBounds = browserWindow.getBounds();
    let left = (typeof deltaLeft === 'number' ? deltaLeft : 0);
    let top = (typeof deltaTop === 'number' ? deltaTop : 0);

    browserWindow.setBounds({
        x: currentBounds.x + left,
        y: currentBounds.y + top,
        width: currentBounds.width,
        height: currentBounds.height
    });
};


Window.moveTo = function(identity, x, y) {
    let browserWindow = getElectronBrowserWindow(identity);

    if (!browserWindow) {
        return;
    }

    let currentBounds = browserWindow.getBounds();

    browserWindow.setBounds({
        x,
        y,
        width: currentBounds.width,
        height: currentBounds.height
    });
};

Window.navigate = function(identity, url) {
    let browserWindow = getElectronBrowserWindow(identity, 'navigate');
    browserWindow.webContents.loadURL(url);
};

Window.navigateBack = function(identity) {
    let browserWindow = getElectronBrowserWindow(identity, 'navigate back');
    browserWindow.webContents.goBack();
};

Window.navigateForward = function(identity) {
    let browserWindow = getElectronBrowserWindow(identity, 'navigate forward');
    browserWindow.webContents.goForward();
};

Window.reload = function(identity, ignoreCache = false) {
    let browserWindow = getElectronBrowserWindow(identity, 'reload');

    if (!ignoreCache) {
        browserWindow.webContents.reload();
    } else {
        browserWindow.webContents.reloadIgnoringCache();
    }
};

Window.stopNavigation = function(identity) {
    let browserWindow = getElectronBrowserWindow(identity, 'stop navigating');
    browserWindow.webContents.stop();
};

Window.removeEventListener = function(identity, type, listener) {
    let browserWindow = getElectronBrowserWindow(identity, 'remove event listener for');
    ofEvents.removeListener(`window/${type}/${browserWindow.id}`, listener);
};


Window.resizeBy = function(identity, deltaWidth, deltaHeight, anchor) {
    let browserWindow = getElectronBrowserWindow(identity);

    if (!browserWindow) {
        return;
    }

    let currentBounds = browserWindow.getBounds();
    let newWidth = (typeof deltaWidth === 'number' ? currentBounds.width + deltaWidth : currentBounds.width);
    let newHeight = (typeof deltaHeight === 'number' ? currentBounds.height + deltaHeight : currentBounds.height);
    let boundsAnchor = calcBoundsAnchor(anchor, newWidth, newHeight, currentBounds);
    browserWindow.setBounds(clipBounds({
        x: boundsAnchor.x,
        y: boundsAnchor.y,
        width: newWidth,
        height: newHeight
    }, browserWindow));
};


Window.resizeTo = function(identity, width, height, anchor) {
    let browserWindow = getElectronBrowserWindow(identity);

    if (!browserWindow) {
        return;
    }

    let currentBounds = browserWindow.getBounds();
    let boundsAnchor = calcBoundsAnchor(anchor, width, height, currentBounds);

    browserWindow.setBounds(clipBounds({
        x: boundsAnchor.x,
        y: boundsAnchor.y,
        width: (typeof width === 'number' ? width : currentBounds.width),
        height: (typeof height === 'number' ? height : currentBounds.height)
    }, browserWindow));
};


Window.restore = function(identity) {
    let browserWindow = getElectronBrowserWindow(identity, 'restore');

    if (browserWindow.isMinimized()) {
        browserWindow.restore();
    } else if (browserWindow.isMaximized()) {
        browserWindow.unmaximize();
    } else {
        browserWindow.showInactive();
    }
};


Window.setAsForeground = function(identity) {
    let browserWindow = getElectronBrowserWindow(identity);

    if (!browserWindow) {
        return;
    }

    browserWindow.activate();
};


Window.setBounds = function(identity, left, top, width, height) {
    let browserWindow = getElectronBrowserWindow(identity, 'set window bounds for');
    let bounds = browserWindow.getBounds();
    browserWindow.setBounds(clipBounds({
        x: (typeof left === 'number' ? left : bounds.x),
        y: (typeof top === 'number' ? top : bounds.y),
        width: (typeof width === 'number' ? width : bounds.width),
        height: (typeof height === 'number' ? height : bounds.height)
    }, browserWindow));
};


Window.show = function(identity, force = false) {
    let browserWindow = getElectronBrowserWindow(identity);

    if (!browserWindow) {
        return;
    }

    let payload = {};
    let defaultAction = () => {
        if (!browserWindow.isMinimized()) {
            browserWindow.showInactive();
        }
    };

    handleForceActions(identity, force, 'show-requested', payload, defaultAction);
};


Window.showAt = function(identity, left, top, force = false) {
    let browserWindow = getElectronBrowserWindow(identity);

    if (!browserWindow) {
        return;
    }

    let payload = {
        top,
        left
    };
    let defaultAction = () => {
        let currentBounds = browserWindow.getBounds();

        browserWindow.setBounds({
            x: left,
            y: top,
            width: currentBounds.width,
            height: currentBounds.height
        });

        if (!browserWindow.isMinimized()) {
            browserWindow.showInactive();
        }
    };

    handleForceActions(identity, force, 'show-requested', payload, defaultAction);
};

Window.showMenu = function(identity, x, y, editable, hasSelectedText) {
    let browserWindow = getElectronBrowserWindow(identity);

    if (!browserWindow) {
        return;
    }

    const menuTemplate = [];

    if (editable) {
        menuTemplate.push({
            label: 'Cut',
            click: (menuItem, browserWindow) => {
                browserWindow.webContents.cut();
            },
            accelerator: 'CommandOrControl+X',
            enabled: hasSelectedText
        });
        menuTemplate.push({
            label: 'Copy',
            click: (menuItem, browserWindow) => {
                browserWindow.webContents.copy();
            },
            accelerator: 'CommandOrControl+C',
            enabled: hasSelectedText
        });
        menuTemplate.push({
            label: 'Paste',
            click: (menuItem, browserWindow) => {
                browserWindow.webContents.paste();
            },
            accelerator: 'CommandOrControl+V'
        });
        menuTemplate.push({
            label: 'Select all',
            click: (menuItem, browserWindow) => {
                browserWindow.webContents.selectAll();
            },
            accelerator: 'CommandOrControl+A'
        });
        menuTemplate.push({
            type: 'separator'
        });
    }
    menuTemplate.push({
        label: 'Reload',
        click: (menuItem, browserWindow) => {
            browserWindow.webContents.reloadIgnoringCache();
        }
    }, {
        label: 'Reload app and restart children',
        click: () => {
            try {
                const Application = require('./application.js').Application;
                const app = Application.wrap(identity.uuid);

                Application.getChildWindows(identity).forEach(childWin => {
                    Window.close({
                        name: childWin.name,
                        uuid: childWin.uuid
                    }, true);
                });

                app.mainWindow.webContents.reloadIgnoringCache();
            } catch (e) {
                console.log(e);
            }
        }
    }, {
        type: 'separator'
    }, {
        label: 'Inspect element',
        click: (menuItem, browserWindow) => {
            browserWindow.webContents.inspectElement(x, y);
        },
        accelerator: 'CommandOrControl+Shift+I'
    });

    const currentMenu = Menu.buildFromTemplate(menuTemplate);
    currentMenu.popup();
};

Window.defineDraggableArea = function() {};


Window.updateOptions = function(identity, updateObj) {
    let browserWindow = getElectronBrowserWindow(identity, 'update settings for');

    try {
        for (var opt in updateObj) {
            if (optionSetters[opt]) {
                optionSetters[opt](updateObj[opt], browserWindow);
            }
        }
    } catch (e) {
        console.log(e.message);
    }
};

Window.exists = function(identity) {
    return coreState.windowExists(identity.uuid, identity.name);
};

Window.getBoundsFromDisk = function(identity, callback, errorCallback) {
    let cacheFile = getBoundsCacheSafeFileName(identity);
    try {
        fs.readFile(cacheFile, 'utf8', (err, data) => {
            if (err) {
                errorCallback(err);
            } else {
                try {
                    callback(JSON.parse(data));
                } catch (parseErr) {
                    errorCallback(new Error(`Error parsing saved bounds data ${parseErr.message}`));
                }
            }
        });
    } catch (err) {
        errorCallback(err);
    }
};

Window.authenticate = function(identity, username, password, callback) {
    let {
        authCallback
    } = authenticationDelegate.getPendingAuthRequest(identity);

    if (authCallback && typeof(authCallback) === 'function') {
        authCallback(username, password);
        authenticationDelegate.deletePendingAuthRequest(identity);
        callback();
    } else {
        callback(new Error('No authentication request pending for window'));
    }
};

Window.getZoomLevel = function(identity, callback) {
    let browserWindow = getElectronBrowserWindow(identity, 'get zoom level for');

    browserWindow.webContents.getZoomLevel(callback);
};

Window.setZoomLevel = function(identity, level) {
    let browserWindow = getElectronBrowserWindow(identity, 'set zoom level for');

    browserWindow.webContents.setZoomLevel(level);
};

Window.onUnload = (identity) => {
    ofEvents.emit(`window/unload/${identity.uuid}/${identity.name}`, identity);
    ofEvents.emit('window/init-subscription-listeners', identity);
};

function emitCloseEvents(identity) {
    ofEvents.emit(`window/closed`, {
        name: identity.name,
        uuid: identity.uuid
    });

    ofEvents.emit(`window/closed/${identity.uuid}-${identity.name}`, {
        topic: 'window',
        type: 'closed',
        uuid: identity.uuid,
        name: identity.name
    });

    // Need to emit this event because notifications use dashes (-)
    // in their window names
    ofEvents.emit(`window/closed/${identity.uuid}/${identity.name}`, {
        topic: 'window',
        type: 'closed',
        uuid: identity.uuid,
        name: identity.name
    });

    ofEvents.emit(`application/window-closed/${identity.uuid}`, {
        topic: 'application',
        type: 'window-closed',
        uuid: identity.uuid,
        name: identity.name
    });
}

function emitReloadedEvent(identity, url) {
    const {
        uuid,
        name
    } = identity;

    ofEvents.emit(`window/reloaded/${uuid}-${name}`, {
        uuid,
        name,
        url
    });

    ofEvents.emit(`application/window-reloaded/${uuid}`, {
        topic: 'application',
        type: 'window-reloaded',
        uuid,
        name,
        url
    });
}

function createWindowTearDown(identity, id) {
    return function() {
        let ofWindow = Window.wrap(identity.uuid, identity.name);
        let childWindows = coreState.getChildrenByWinId(id);

        // remove from core state earlier rather than later
        coreState.removeChildById(id);

        // remove window from any groups it belongs to
        WindowGroups.leaveGroup(ofWindow);

        if (childWindows && childWindows.length > 0) {
            let closedChildren = 0;

            childWindows.forEach(childId => {
                let child = coreState.getWinObjById(childId);

                // TODO right now this is forceable to handle the event that there was a close
                //      requested on a child window and the main window closes. This needs
                //      looking into
                if (child) {
                    let childIdentity = {
                        name: child.name,
                        uuid: child.uuid
                    };

                    Window.close(childIdentity, true, () => {
                        closedChildren++;
                        if (closedChildren === childWindows.length) {
                            emitCloseEvents(identity);
                            coreState.removeChildById(id);
                        }
                    });
                } else {
                    closedChildren++;
                    if (closedChildren === childWindows.length) {
                        emitCloseEvents(identity);
                        coreState.removeChildById(id);
                    }
                }
            });
        } else {
            emitCloseEvents(identity);
        }
    };
}

function saveBoundsToDisk(identity, bounds, callback) {
    let cacheFile = getBoundsCacheSafeFileName(identity);
    let data = {
        'active': 'true',
        'height': bounds.height,
        'width': bounds.width,
        'left': bounds.x,
        'top': bounds.y,
        'name': identity.name,
        'windowState': bounds.windowState
    };

    try {
        fs.mkdir(path.join(userCache, windowPosCacheFolder), () => {
            fs.writeFile(cacheFile, JSON.stringify(data), (writeFileErr) => {
                callback(writeFileErr);
            });
        });
    } catch (err) {
        callback(err);
    }

}
//make sure the uuid/names with special characters do not break the bounds cache.
function getBoundsCacheSafeFileName(identity) {
    let safeName = new Buffer(identity.uuid + '-' + identity.name).toString('hex');
    return path.join(userCache, windowPosCacheFolder, `${safeName}.json`);
}

function applyAdditionalOptionsToWindowOnVisible(browserWindow, callback) {
    if (browserWindow.isVisible()) {
        callback();
    } else {
        browserWindow.once('visibility-changed', (event, isVisible) => {
            if (isVisible) {
                callback();
            }
        });
    }
}


function handleForceActions(identity, force, eventType, eventPayload, defaultAction) {
    let uuidname = `${identity.uuid}-${identity.name}`;
    let appEventString = `application/window-${eventType}/${identity.uuid}`;
    let winEventString = `window/${eventType}/${uuidname}`;
    let listenerCount = ofEvents.listenerCount(winEventString);

    if (eventType === 'show-requested') {
        listenerCount += ofEvents.listenerCount(appEventString);
    }

    if (!listenerCount || force) {
        defaultAction();
    } else {
        eventPayload.name = identity.name;
        eventPayload.uuid = identity.uuid;
        eventPayload.type = eventType;
        eventPayload.topic = 'window';

        ofEvents.emit(winEventString, eventPayload);

        if (eventType === 'show-requested') {
            eventPayload.type = 'window-show-requested';
            eventPayload.topic = 'application';

            ofEvents.emit(appEventString, eventPayload);
        }
    }
}


function applyAdditionalOptionsToWindow(browserWindow) {
    let options = browserWindow && browserWindow._options;

    if (!options) {
        return;
    }

    browserWindow.setTaskbarGroup(options.taskbarIconGroup);

    // frameless window updates
    if (!options.frame) {
        // rounded corners
        browserWindow.setRoundedCorners(options.cornerRounding.width, options.cornerRounding.height);
    }

    applyAdditionalOptionsToWindowOnVisible(browserWindow, () => {
        // set alpha mask if present, otherwise set opacity
        if (options.alphaMask.red > -1 && options.alphaMask.green > -1 && options.alphaMask.blue > -1) {
            browserWindow.setAlphaMask(options.alphaMask.red, options.alphaMask.green, options.alphaMask.blue);
        } else {
            browserWindow.setOpacity(options.opacity);
        }

        // set minimized or maximized
        if (options.state === 'minimized') {
            browserWindow.minimize();
        } else if (options.state === 'maximized') {
            browserWindow.maximize();
        }

        // frameless window updates
        if (!options.frame) {
            // resize region
            browserWindow.setResizeRegion(options.resizeRegion.size);
            browserWindow.setResizeRegionBottomRight(options.resizeRegion.bottomRightCorner);
        }
    });
}


function getOptFromBrowserWin(opt, browserWin, defaultVal) {
    var opts = browserWin && browserWin._options,
        optVal = opts && opts[opt];

    if (optVal === undefined) {
        return defaultVal;
    }

    return optVal;
}


function setOptOnBrowserWin(opt, val, browserWin) {
    var opts = browserWin && browserWin._options;
    if (opts) {
        opts[opt] = val;
    }
}


function closeRequestedDecorator(payload) {
    let propagate = true;

    payload.force = false;

    return propagate;
}


function boundsChangeDecorator(payload, args) {
    let boundsChangePayload = args[0];
    let payloadIsObject = typeof boundsChangePayload === 'object';
    let requiredKeys = ['top', 'left', 'reason', 'width', 'height'];
    let commonKeys = _.intersection(_.keys(boundsChangePayload), requiredKeys);
    let allRequiredKeysPresent = commonKeys.length === requiredKeys.length;
    let shouldExtendPayload = payloadIsObject && allRequiredKeysPresent;

    if (shouldExtendPayload) {
        Object.keys(boundsChangePayload).forEach(function(key) {
            payload[key] = boundsChangePayload[key];
        });

        let _win = Window.wrap(payload.uuid, payload.name);
        let _browserWin = _win && _win.browserWindow;
        setOptOnBrowserWin('x', payload.left, _browserWin);
        setOptOnBrowserWin('y', payload.top, _browserWin);
        setOptOnBrowserWin('width', payload.width, _browserWin);
        setOptOnBrowserWin('height', payload.height, _browserWin);

        return true;
    } else {
        return false;
    }
}


function disabledFrameBoundsChangeDecorator(payload, args) {
    var propogate = false;

    if (args.length >= 3) {
        var bounds = args[1];
        var type = args[2];

        payload.changeType = type;
        payload.left = bounds.x;
        payload.top = bounds.y;
        payload.width = bounds.width;
        payload.height = bounds.height;
        payload.deferred = false;
        propogate = true;
    }

    return propogate;
}

function opacityChangedDecorator(payload, args) {
    let _win = Window.wrap(payload.uuid, payload.name);
    let _browserWin = _win && _win.browserWindow;
    setOptOnBrowserWin('opacity', args[1], _browserWin);
    return false;
}

function visibilityChangedDecorator(payload, args) {
    var propogate = false;

    if (args.length >= 2) {
        var visible = args[1];

        if (visible) {
            payload.type = 'shown';
            let uuid = payload.uuid;
            if (uuid && !coreState.sentFirstHideSplashScreen(uuid)) {
                // TODO: Move this require to the top of file during future 'dependency injection refactor'
                // must delay 'application.js' require until ready due to circular dependency between application and window(things will break otherwise)
                let emitHideSplashScreen = require('./application.js').Application.emitHideSplashScreen;
                emitHideSplashScreen({
                    uuid
                });
                coreState.setSentFirstHideSplashScreen(uuid, true);
            }
        } else {
            let openfinWindow = Window.wrap(payload.uuid, payload.name);

            payload.type = 'hidden';
            payload.reason = openfinWindow.hideReason;

            // reset to 'hide' in case visibility changes
            // due to a non-API related reason
            openfinWindow.hideReason = 'hide';
        }

        propogate = true;
    }

    return propogate;
}

function responseReceivedDecorator(payload, args) {
    var [
        /*event*/
        ,
        status,
        newUrl,
        originalUrl,
        httpResponseCode,
        requestMethod,
        referrer,
        headers,
        resourceType
    ] = args;

    Object.assign(payload, {
        status,
        newUrl,
        originalUrl,
        httpResponseCode,
        requestMethod,
        referrer,
        headers,
        resourceType
    });

    return true;
}

function loadFailedDecorator(payload, args) {
    var [
        /*event*/
        ,
        errorCode,
        errorDescription,
        validatedURL,
        isMainFrame
    ] = args;

    Object.assign(payload, {
        errorCode,
        errorDescription,
        validatedURL,
        isMainFrame
    });

    return true;
}

function noOpDecorator( /*payload*/ ) {

    return true;
}


function calcBoundsAnchor(anchor, newWidth, newHeight, currBounds) {
    let calcAnchor = {
        x: currBounds.x,
        y: currBounds.y
    };
    if (!anchor) {
        return calcAnchor;
    }
    let anchors = anchor.split('-');
    let yAnchor = anchors[0];
    let xAnchor = anchors[1];

    if (yAnchor === 'bottom' && currBounds.height !== newHeight) {
        calcAnchor.y = currBounds.y + (currBounds.height - newHeight);
    }
    if (xAnchor === 'right' && currBounds.width !== newWidth) {
        calcAnchor.x = currBounds.x + (currBounds.width - newWidth);
    }

    return calcAnchor;
}

function setTaskbar(browserWindow) {
    const options = browserWindow._options;

    setBlankTaskbarIcon(browserWindow);

    // If the window isn't loaded by a URL, or is "about:blank", then the
    // page-favicon-updated event never fires (explained below). In this case
    // we try the window options and if that fails we get the icon info
    // from the main window.
    if (!regex.isURL(options.url)) {
        let _url = getWinOptsIconUrl(options);

        // v6 needs to match v5's behavior: if the window url is a file uri,
        // then icon can be either a file path, file uri, or url
        if (!regex.isURL(_url) && !regex.isURI(_url)) {
            _url = 'file:///' + _url;
        }

        // try the window icon options first
        setTaskbarIcon(browserWindow, _url, () => {
            if (!browserWindow.isDestroyed()) {
                // if not, try using the main window's icon
                setTaskbarIcon(browserWindow, getMainWinIconUrl(browserWindow.id));
            }
        });

        return;
    }

    // When a page loads, Electron fires the page-favicon-updated event
    // which signals the core to fetch/set the taskbar icon. The core
    // first tries to use the icon info provided by the window options.
    // If that fails, then it tries to use the list of favicons provided by
    // the page-favicon-updated event. Finally, if that fails, it'll grab
    // the icon info from the main window and use that. By default, the
    // taskbar icon is blank.
    browserWindow.webContents.on('page-favicon-updated', (event, urls) => {
        // try the window icon options first
        setTaskbarIcon(browserWindow, getWinOptsIconUrl(options), () => {
            if (!browserWindow.isDestroyed()) {
                // if not, try any favicons that were found
                const _url = urls && urls[0];
                setTaskbarIcon(browserWindow, _url, () => {
                    if (!browserWindow.isDestroyed()) {
                        // if not, try using the main window's icon
                        setTaskbarIcon(browserWindow, getMainWinIconUrl(browserWindow.id));
                    }
                });
            }
        });
    });
}

function setTaskbarIcon(browserWindow, iconUrl, errorCallback = () => {}) {
    let options = browserWindow._options;
    let uuid = options.uuid;

    cachedFetch(uuid, iconUrl, (error, iconFilepath) => {
        if (!error) {
            setIcon(browserWindow, iconFilepath, errorCallback);
        } else {
            errorCallback();
        }
    });
}

function setIcon(browserWindow, iconFilepath, errorCallback = () => {}) {
    if (!browserWindow.isDestroyed()) {
        let icon = nativeImage.createFromPath(iconFilepath);
        if (icon.isEmpty()) {
            errorCallback();
        } else {
            browserWindow.setIcon(icon);
        }
    }
}

function setBlankTaskbarIcon(browserWindow) {
    // the file is located at ..\runtime-core\blank.ico
    setIcon(browserWindow, path.resolve(`${__dirname}/../../../blank.ico`));
}

function getMainWinIconUrl(id) {
    let options = coreState.getMainWindowOptions(id) || {};
    return getWinOptsIconUrl(options);
}

function getWinOptsIconUrl(options) {
    return options.icon || options.taskbarIcon || options.applicationIcon;
}

//This is a legacy 5.0 feature used from embedded.
function handleCustomAlerts(id, opts) {
    let browserWindow = BrowserWindow.fromId(id);
    let subTopic = 'alert';
    let type = 'window-alert-requested';
    let topic = 'application';
    //We will need to keep the subscribe/unsubscribe functions avilable to do proper clean up.
    function subscription(e, args) {
        let message = args[0][0];
        let payload = {
            uuid: opts.uuid,
            name: opts.name,
            message: message,
            url: browserWindow.webContents.getURL(),
            topic: topic,
            type: type
        };
        if (typeof(e.preventDefault) === 'function') {
            e.preventDefault();
        }
        ofEvents.emit(`${topic}/${type}/${opts.uuid}`, payload);
    }

    function unsubscribe() {
        if (browserWindow) {
            browserWindow.removeListener(subTopic, subscription);
        }
    }

    browserWindow.on(subTopic, subscription);
    subscriptionManager.registerSubscription(unsubscribe, {
        uuid: opts.uuid,
        name: opts.name
    }, type, id);
}

//If unknown window AND `errDesc` provided, throw error; otherwise return (possibly undefined) browser window ref.
function getElectronBrowserWindow(identity, errDesc) {
    let openfinWindow = Window.wrap(identity.uuid, identity.name);
    let browserWindow = openfinWindow && openfinWindow.browserWindow;

    if (errDesc && !browserWindow) {
        throw new Error(`Could not ${errDesc} unknown window named '${identity.name}'`);
    }

    return browserWindow;
}

module.exports.Window = Window;
