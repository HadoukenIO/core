/*
Copyright 2018 OpenFin Inc.

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
import * as Rx from 'rx';

// local modules
let animations = require('../animations.js');
import { deletePendingAuthRequest, getPendingAuthRequest } from '../authentication_delegate';
let BoundsChangedStateTracker = require('../bounds_changed_state_tracker.js');
let clipBounds = require('../clip_bounds.js').default;
let convertOptions = require('../convert_options.js');
let coreState = require('../core_state.js');
let ExternalWindowEventAdapter = require('../external_window_event_adapter.js');
import { cachedFetch } from '../cached_resource_fetcher';
let log = require('../log');
import ofEvents from '../of_events';
import SubscriptionManager from '../subscription_manager';
let WindowGroups = require('../window_groups.js');
import { addConsoleMessageToRVMMessageQueue } from '../rvm/utils';
import { validateNavigation, navigationValidator } from '../navigation_validation';
import { toSafeInt } from '../../common/safe_int';
import route from '../../common/route';
import { FrameInfo } from './frame';
import { System } from './system';
import { isFileUrl, isHttpUrl, getIdentityFromObject } from '../../common/main';
// constants
import {
    DEFAULT_RESIZE_REGION_SIZE,
    DEFAULT_RESIZE_REGION_BOTTOM_RIGHT_CORNER,
    DEFAULT_RESIZE_SIDES
} from '../../shapes';

const subscriptionManager = new SubscriptionManager();
const isWin32 = process.platform === 'win32';
const windowPosCacheFolder = 'winposCache';
const WindowsMessages = {
    WM_KEYDOWN: 0x0100,
    WM_KEYUP: 0x0101,
    WM_SYSKEYDOWN: 0x0104,
    WM_SYSKEYUP: 0x0105,
};

let Window = {};
const disabledFrameRef = new Map();

let browserWindowEventMap = {
    'api-injection-failed': {
        topic: 'api-injection-failed'
    },
    'blur': {
        topic: 'blurred',
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
        topic: 'focused',
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
    },
    'will-close': {
        topic: 'closing'
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

function genWindowKey(identity) {
    return `${identity.uuid}-${identity.name}`;
}

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
    customData: function(newVal, browserWin) {
        setOptOnBrowserWin('customData', newVal, browserWin);
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
                if (!browserWin.isDestroyed()) {
                    let resizeRegion = getOptFromBrowserWin('resizeRegion', browserWin, {});
                    resizeRegion = Object.assign({}, {
                        size: DEFAULT_RESIZE_REGION_SIZE,
                        bottomRightCorner: DEFAULT_RESIZE_REGION_BOTTOM_RIGHT_CORNER
                    }, resizeRegion);
                    browserWin.setResizeRegion(resizeRegion.size);
                    browserWin.setResizeRegionBottomRight(resizeRegion.bottomRightCorner);
                }
            });
        } else {
            // reapply top-left icon
            setTaskbar(browserWin, true);
        }
        applyAdditionalOptionsToWindowOnVisible(browserWin, () => {
            if (!browserWin.isDestroyed()) {
                let resizeRegion = getOptFromBrowserWin('resizeRegion', browserWin, {});
                const sides = Object.assign({}, DEFAULT_RESIZE_SIDES, resizeRegion.sides);
                browserWin.setResizeSides(sides.top, sides.right, sides.bottom, sides.left);
            }
        });
    },
    alphaMask: function(newVal, browserWin) {
        if (!newVal || typeof newVal.red !== 'number' || typeof newVal.green !== 'number' || typeof newVal.blue !== 'number') {
            return;
        }

        applyAdditionalOptionsToWindowOnVisible(browserWin, () => {
            if (!browserWin.isDestroyed()) {
                browserWin.setAlphaMask(newVal.red, newVal.green, newVal.blue);
            }
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
        let closeEventString = route.window('close-requested', uuid, name);

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
            if (!browserWin.isDestroyed()) {
                browserWin.setOpacity(opacity);
            }
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
        if (newVal) {
            if (typeof newVal.size === 'number' && typeof newVal.bottomRightCorner === 'number') {


                applyAdditionalOptionsToWindowOnVisible(browserWin, () => {
                    if (!browserWin.isDestroyed()) {
                        let frame = getOptFromBrowserWin('frame', browserWin, true);
                        if (!frame) {
                            browserWin.setResizeRegion(newVal.size);
                            browserWin.setResizeRegionBottomRight(newVal.bottomRightCorner);
                        }
                    }
                });
            }
            if (typeof newVal.sides === 'object') {
                applyAdditionalOptionsToWindowOnVisible(browserWin, () => {
                    if (!browserWin.isDestroyed()) {
                        const sides = Object.assign({}, DEFAULT_RESIZE_SIDES, newVal.sides);
                        browserWin.setResizeSides(sides.top, sides.right,
                            sides.bottom, sides.left);
                    }
                });
            }
            setOptOnBrowserWin('resizeRegion', newVal, browserWin);
        }
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
    let browserWindow;
    let webContents;
    let _options;
    let _boundsChangedHandler;
    let groupUuid = null; // windows by default don't belong to any groups

    let hideReason = 'hide';
    let hideOnCloseListener = () => {
        let openfinWindow = Window.wrap(uuid, name);
        openfinWindow.hideReason = 'hide-on-close';
        browserWindow.hide();
    };

    const ofUnloadedHandler = (eventObj, url, isReload) => {

        if (isReload) {
            emitReloadedEvent({
                uuid,
                name
            }, url);
        }

        ofEvents.emit(route.window('unload', uuid, name, false), identity);
        ofEvents.emit(route.window('init-subscription-listeners'), identity);
        ofEvents.emit(route.window('openfin-diagnostic/unload', uuid, name, true), url);
    };

    let _externalWindowEventAdapter;

    // we need to be able to handle the wrapped case, ie. don't try to
    // grab the browser window instance because it may not exist, or
    // perhaps just try ...
    if (!opts._noregister) {

        browserWindow = BrowserWindow.fromId(id);

        // called in the WebContents class in the runtime
        browserWindow.webContents.registerIframe = (frameName, frameRoutingId) => {
            // called for all iframes, but not for main frame of windows
            electronApp.vlog(1, `registerIframe ${frameName} ${frameRoutingId}`);
            const parentFrameId = id;
            const frameInfo = {
                name: frameName,
                uuid,
                parentFrameId,
                parent: { uuid, name },
                frameRoutingId,
                entityType: 'iframe'
            };

            winObj.frames.set(frameName, frameInfo);
        };

        // called in the WebContents class in the runtime
        browserWindow.webContents.unregisterIframe = (closedFrameName, frameRoutingId) => {
            // called for all iframes AND for main frames
            electronApp.vlog(1, `unregisterIframe ${frameRoutingId} ${closedFrameName}`);
            const frameName = closedFrameName || name; // the parent name is considered a frame as well
            const frameInfo = winObj.frames.get(closedFrameName);
            const entityType = frameInfo ? 'iframe' : 'window';
            const payload = { uuid, name, frameName, entityType };

            winObj.frames.delete(closedFrameName);
            ofEvents.emit(route.frame('disconnected', uuid, closedFrameName), payload);
            ofEvents.emit(route.window('frame-disconnected', uuid, name), payload);
        };

        webContents = browserWindow.webContents;

        //Legacy 5.0 feature, if customWindowAlert flag is found all alerts will be suppresed,
        //instead we will raise application event : 'window-alert-requested'.
        if (coreState.getAppObjByUuid(identity.uuid)._options.customWindowAlert) {
            handleCustomAlerts(id, opts);
        }
        // each window now inherits the main window's base options. this can
        // be made to be the parent's options if that makes more sense...
        baseOpts = coreState.getMainWindowOptions(id) || {};
        _options = convertOptions.convertToElectron(Object.assign({}, baseOpts, opts));

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

        const OF_WINDOW_UNLOADED = 'of-window-navigation';

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

        let windowTeardown = createWindowTearDown(identity, id);

        // once the window is closed, be sure to close all the children
        // it may have and remove it from the
        browserWindow.on('close', (event) => {
            let ofWindow = Window.wrap(uuid, name);
            let closeEventString = route.window('close-requested', uuid, name);
            let listenerCount = ofEvents.listenerCount(closeEventString);

            // here we can only prevent electron windows, not external windows, from closing when the 'x' button is clicked.
            // external windows will need to be handled on the adapter side
            if (listenerCount && !ofWindow.forceClose && !browserWindow.isExternalWindow()) {
                if (!browserWindow.isDestroyed()) {
                    event.preventDefault();
                    return;
                }
            }

            ofEvents.emit(route.window('synth-close', uuid, name), {
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
                    browserWindow.removeAllListeners();
                });
            } else {
                windowTeardown();
                _boundsChangedHandler.teardown();
                browserWindow.removeAllListeners();
            }
        });

        const isMainWindow = (uuid === name);
        const emitToAppIfMainWin = (type, payload) => {
            // Window crashed: inform Window "namespace"
            ofEvents.emit(route.window(type, uuid, name), Object.assign({ topic: 'window', type, uuid, name }, payload));

            if (isMainWindow) {
                // Application crashed: inform Application "namespace"
                ofEvents.emit(route.application(type, uuid), Object.assign({ topic: 'application', type, uuid }, payload));
            }
        };

        webContents.once('close', () => {
            webContents.removeAllListeners();
        });

        webContents.on('crashed', (event, killed, terminationStatus) => {
            emitToAppIfMainWin('crashed', {
                reason: terminationStatus
            });

            // When the renderer crashes, remove blocking event listeners.
            // Removing 'close-requested' listeners will allow the crashed window to be closed manually easily.
            const closeRequested = route.window('close-requested', uuid, name);
            ofEvents.removeAllListeners(closeRequested);

            // Removing 'show-requested' listeners will allow the crashed window to be shown so it can be closed.
            const showRequested = route.window('show-requested', uuid, name);
            ofEvents.removeAllListeners(showRequested);

            if (isMainWindow) {
                coreState.setAppRunningState(uuid, false);
            }
        });

        browserWindow.on('responsive', () => {
            emitToAppIfMainWin('responding');
        });

        browserWindow.on('unresponsive', () => {
            emitToAppIfMainWin('not-responding');
        });

        let mapEvents = function(eventMap, eventEmitter) {
            // todo this should be on demand, for now just blast them all
            Object.keys(eventMap).forEach(evnt => {
                var mappedMeta = eventMap[evnt];
                var mappedTopic = mappedMeta.topic || '';

                var electronEventListener = function( /*event , arg1, ... */ ) {

                    // if the window has already been removed from core_state,
                    // don't propagate anymore events
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

                    let decoratorFn = mappedMeta.decorator || noOpDecorator;

                    // Payload is modified by the decorator and returns true on success
                    if (decoratorFn(payload, arguments)) {
                        // Let the decorator apply changes to the type
                        ofEvents.emit(route.window(payload.type, uuid, name), payload);
                    }
                };

                eventEmitter.on(evnt, electronEventListener);
            });
        };

        mapEvents(browserWindowEventMap, browserWindow);
        mapEvents(webContentsEventMap, webContents);

        // hideOnClose is deprecated; treat it as if it's just another
        // listener on the 'close-requested' event
        if (getOptFromBrowserWin('hideOnClose', browserWindow, false)) {
            let closeEventString = route.window('close-requested', uuid, name);
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

                ofEvents.emit(route.window(payload.type, uuid, name), payload);
            }
        };
        let groupChangedUnsubscribe = () => {
            WindowGroups.removeListener(groupChangedEventString, groupChangedListener);
        };

        WindowGroups.on(groupChangedEventString, groupChangedListener);
        subscriptionManager.registerSubscription(groupChangedUnsubscribe, identity, groupChangedEventString);

        // will-navigate URL for white/black listing
        const navValidator = navigationValidator(uuid, name, id);
        validateNavigation(webContents, identity, navValidator);

        let startLoadingSubscribe = (event, url) => {
            ofEvents.emit(route.application('window-start-load', uuid), {
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
                ofEvents.emit(route.application('ready', uuid), {
                    type: 'ready',
                    uuid
                });
            }
            ofEvents.emit(route.application('window-end-load', uuid), {
                name,
                uuid,
                isMain,
                documentName
            });

            ofEvents.emit(route.application('window-end-load'), {
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
        ofEvents.emit(route.window('init-subscription-listeners'), {
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

            ofEvents.emit(route.window('fire-constructor-callback', uuid, name), constructorCallbackMessage);
        };

        let resourceResponseReceivedHandler, resourceLoadFailedHandler;

        let resourceResponseReceivedEventString = route.window('resource-response-received', uuid, name);
        let resourceLoadFailedEventString = route.window('resource-load-failed', uuid, name);

        let httpResponseCode = null;

        resourceResponseReceivedHandler = (details) => {
            httpResponseCode = details.httpResponseCode;
            ofEvents.removeListener(resourceLoadFailedEventString, resourceLoadFailedHandler);
        };

        resourceLoadFailedHandler = (failed) => {
            if (failed.errorCode === -3) {
                // 304 can trigger net::ERR_ABORTED, ignore it
                electronApp.vlog(1, `ignoring net error -3 for ${failed.validatedURL}`);
            } else {
                emitErrMessage(failed.errorCode);
                ofEvents.removeListener(resourceResponseReceivedEventString, resourceResponseReceivedHandler);
            }
        };

        //Legacy logic where we wait for the API to 'connect' before we invoke the callback method.
        const apiInjectionObserver = Rx.Observable.create((observer) => {
            if (opts.url === 'about:blank') {
                webContents.once('did-finish-load', () => {
                    webContents.on(OF_WINDOW_UNLOADED, ofUnloadedHandler);
                    constructorCallbackMessage.data = {
                        httpResponseCode
                    };
                    observer.next(constructorCallbackMessage);
                });

            } else {
                ofEvents.once(resourceResponseReceivedEventString, resourceResponseReceivedHandler);
                ofEvents.once(resourceLoadFailedEventString, resourceLoadFailedHandler);
                ofEvents.once(route.window('connected', uuid, name), () => {
                    webContents.on(OF_WINDOW_UNLOADED, ofUnloadedHandler);
                    constructorCallbackMessage.data = {
                        httpResponseCode,
                        apiInjected: true
                    };
                    observer.next(constructorCallbackMessage);
                });
                ofEvents.once(route.window('api-injection-failed', uuid, name), () => {
                    electronApp.vlog(1, `api-injection-failed ${uuid}-${name}`);
                    // can happen if child window has a different domain.   @TODO allow injection for different domains
                    if (_options.autoShow) {
                        browserWindow.show();
                    }
                    constructorCallbackMessage.data = {
                        httpResponseCode,
                        apiInjected: false
                    };
                    observer.next(constructorCallbackMessage);
                });
            }

        });

        //Restoring window possitioning from disk cache.
        //We treat this as a check point event, either succes or failure will raise the event.
        const windowPositioningObserver = Rx.Observable.create(observer => {
            if (!_options.saveWindowState) {
                observer.next();
            } else if (_options.waitForPageLoad) {
                browserWindow.once('ready-to-show', () => {
                    restoreWindowPosition(identity, () => observer.next());
                });
            } else {
                restoreWindowPosition(identity, () => observer.next());
            }
        });

        //We want to zip both event sources so that we get a single event only after both windowPositioning and apiInjection occur.
        const subscription = Rx.Observable.zip(apiInjectionObserver, windowPositioningObserver).subscribe((event) => {
            const constructorCallbackMessage = event[0];
            if (_options.autoShow || _options.toShowOnRun) {
                Window.show(identity);
            }

            ofEvents.emit(route.window('fire-constructor-callback', uuid, name), constructorCallbackMessage);
            //need to use the old RXJS API: https://github.com/Reactive-Extensions/RxJS/blob/master/doc/api/core/operators/create.md
            subscription.dispose();
        });
    } // end noregister

    var winObj = {
        name,
        uuid,
        _options,
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
        frames: new Map(),

        // TODO this should be removed once it's safe in favor of the
        //      more descriptive browserWindow key
        _window: browserWindow
    };

    const prepareConsoleMessageForRVM = (event, level, message, lineNo, sourceId) => {
        const app = coreState.getAppByUuid(identity.uuid);
        if (!app) {
            electronApp.vlog(2, `Error: could not get app object for app with uuid: ${identity.uuid}`);
            return;
        }

        // If enableAppLogging not set or false, skip sending to RVM
        if (!app._options || !app._options.enableAppLogging) {
            return;
        }

        // Hack: since this function is getting called from the native side with
        // "webContents.on", there is weirdness where the "setTimeout(flushConsoleMessageQueue...)"
        // in addConsoleMessageToRVMMessageQueue would only get called the first time, and not subsequent times,
        // if you just called "addConsoleMessageToRVMMessageQueue" directly from here. So to get around that, we
        // wrap this entire function in a "setTimeout" to put it in a different context. Eventually we should figure
        // out if there is a way around this by using event.preventDefault or something similar
        setTimeout(() => {
            const appConfigUrl = coreState.getConfigUrlByUuid(identity.uuid);
            if (!appConfigUrl) {
                electronApp.vlog(2, `Error: could not get manifest url for app with uuid: ${identity.uuid}`);
                return;
            }

            function checkPrependLeadingZero(num) {
                let str = String(num);
                if (str.length === 1) {
                    str = '0' + str;
                }

                return str;
            }

            const date = new Date();
            const month = checkPrependLeadingZero(date.getMonth() + 1);
            const day = checkPrependLeadingZero(date.getDate());
            const year = String(date.getFullYear()).slice(2);
            const hour = checkPrependLeadingZero(date.getHours());
            const minute = checkPrependLeadingZero(date.getMinutes());
            const second = checkPrependLeadingZero(date.getSeconds());

            // Format timestamp to match debug.log
            const timeStamp = `${month}/${day}/${year} ${hour}:${minute}:${second}`;

            addConsoleMessageToRVMMessageQueue({ level, message, appConfigUrl, timeStamp });

        }, 1);
    };

    webContents.on('console-message', prepareConsoleMessageForRVM);

    // Set preload scripts' final loading states
    winObj.preloadScripts = (_options.preloadScripts || []);
    winObj.framePreloadScripts = {}; // frame ID => [{url, state}]

    if (!coreState.getWinObjById(id)) {
        coreState.deregisterPendingWindowName(uuid, name);
        coreState.setWindowObj(id, winObj);

        ofEvents.emit(route.application('window-created', uuid), {
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

    //should we check that the type is valid, probably...

    //should we check that the type is valid, probably...
    let eventString = route.window(type, targetIdentity.uuid, targetIdentity.name);
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

    ofEvents.once(route.window('closed', identity.uuid, identity.name), () => {
        callback();
    });

    handleForceActions(identity, force, 'close-requested', payload, defaultAction);
};

function disabledFrameUnsubDecorator(identity) {
    const windowKey = genWindowKey(identity);
    return function() {
        let refCount = disabledFrameRef.get(windowKey) || 0;
        if (refCount > 1) {
            disabledFrameRef.set(windowKey, --refCount);
        } else {
            Window.enableFrame(identity);
        }
    };
}

Window.disableFrame = function(requestorIdentity, windowIdentity) {
    const browserWindow = getElectronBrowserWindow(windowIdentity);
    const windowKey = genWindowKey(windowIdentity);

    if (!browserWindow) {
        return;
    }

    let dframeRefCount = disabledFrameRef.get(windowKey) || 0;
    disabledFrameRef.set(windowKey, ++dframeRefCount);
    subscriptionManager.registerSubscription(disabledFrameUnsubDecorator(windowIdentity), requestorIdentity, `disable-frame-${windowKey}`);
    browserWindow.setUserMovementEnabled(false);
};

Window.embed = function(identity, parentHwnd) {
    let browserWindow = getElectronBrowserWindow(identity);

    if (!browserWindow) {
        return;
    }

    if (isWin32) {
        browserWindow.setMessageObserver(WindowsMessages.WM_KEYDOWN, parentHwnd);
        browserWindow.setMessageObserver(WindowsMessages.WM_KEYUP, parentHwnd);
        browserWindow.setMessageObserver(WindowsMessages.WM_SYSKEYDOWN, parentHwnd);
        browserWindow.setMessageObserver(WindowsMessages.WM_SYSKEYUP, parentHwnd);
    }

    ofEvents.emit(route.window('embedded', identity.uuid, identity.name), {
        topic: 'window',
        type: 'window-embedded',
        name: identity.name,
        uuid: identity.uuid
    });
};

Window.enableFrame = function(identity) {
    const windowKey = genWindowKey(identity);
    let browserWindow = getElectronBrowserWindow(identity);

    if (!browserWindow) {
        return;
    }
    let dframeRefCount = disabledFrameRef.get(windowKey) || 0;
    disabledFrameRef.set(windowKey, --dframeRefCount);
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

Window.getAllFrames = function(identity) {
    const openfinWindow = coreState.getWindowByUuidName(identity.uuid, identity.name);

    if (!openfinWindow) {
        return [];
    }

    const framesArr = [coreState.getInfoByUuidFrame(identity)];
    const subFrames = [];

    for (let [, info] of openfinWindow.frames) {
        subFrames.push(new FrameInfo(info));
    }

    return framesArr.concat(subFrames);
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
    const browserWindow = getElectronBrowserWindow(identity, 'get info for');
    const { preloadScripts } = Window.wrap(identity.uuid, identity.name);
    const webContents = browserWindow.webContents;
    const windowInfo = {
        canNavigateBack: webContents.canGoBack(),
        canNavigateForward: webContents.canGoForward(),
        preloadScripts,
        title: webContents.getTitle(),
        url: webContents.getURL()
    };
    return windowInfo;
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
    // In the case that the identity passed does not exist, or is not a window,
    // return the entity info object. The fail case is used for frame identity on spin up.
    try {
        return getElectronBrowserWindow(identity, 'get options for')._options;
    } catch (e) {
        return System.getEntityInfo(identity);
    }
};

Window.getParentApplication = function() {
    let app = coreState.getAppByWin(this.id);

    return app && app.appObj;
};


Window.getParentWindow = function() {};

/**
 * Sets/updates window's preload script state and emits relevant events
 */
Window.setWindowPreloadState = function(identity, payload) {
    const { uuid, name } = identity;
    const { url, state, allDone } = payload;
    const updateTopic = allDone ? 'preload-scripts-state-changed' : 'preload-scripts-state-changing';
    const frameInfo = coreState.getInfoByUuidFrame(identity);
    let openfinWindow;
    if (frameInfo.entityType === 'iframe') {
        openfinWindow = Window.wrap(frameInfo.parent.uuid, frameInfo.parent.name);
    } else {
        openfinWindow = Window.wrap(uuid, name);
    }

    if (!openfinWindow) {
        return log.writeToLog('info', `setWindowPreloadState missing openfinWindow ${uuid} ${name}`);
    }
    let { preloadScripts } = openfinWindow;

    // Single preload script state change
    if (!allDone) {
        if (frameInfo.entityType === 'iframe') {
            let frameState = openfinWindow.framePreloadScripts[name];
            if (!frameState) {
                frameState = openfinWindow.framePreloadScripts[name] = [];
            }
            preloadScripts = frameState.find(e => e.url === url);
            if (!preloadScripts) {
                frameState.push(preloadScripts = { url });
            }
            preloadScripts = [preloadScripts];
        } else {
            preloadScripts = openfinWindow.preloadScripts.filter(e => e.url === url);
        }
        if (preloadScripts) {
            preloadScripts[0].state = state;
        } else {
            log.writeToLog('info', `setWindowPreloadState missing preloadState ${uuid} ${name} ${url} `);
        }
    }

    if (frameInfo.entityType === 'window') {
        ofEvents.emit(route.window(updateTopic, uuid, name), {
            name,
            uuid,
            preloadScripts
        });
    } // @TODO ofEvents.emit(route.frame for iframes
};

Window.getSnapshot = function(identity, callback = () => {}) {
    let browserWindow = getElectronBrowserWindow(identity);

    if (!browserWindow) {
        callback(new Error(`Unknown window named '${identity.name}'`));
        return;
    }

    browserWindow.capturePage(img => {
        callback(undefined, img.toPNG().toString('base64'));
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

Window.isNotification = function(name) {
    const noteGuidRegex = /^A21B62E0-16B1-4B10-8BE3-BBB6B489D862/;
    return noteGuidRegex.test(name);
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
    let left = toSafeInt(deltaLeft, 0);
    let top = toSafeInt(deltaTop, 0);

    if (browserWindow.isMaximized()) {
        browserWindow.unmaximize();
    }

    // no need to call clipBounds here because width and height are not changing
    browserWindow.setBounds({
        x: currentBounds.x + left,
        y: currentBounds.y + top,
        width: currentBounds.width,
        height: currentBounds.height
    });
};


Window.moveTo = function(identity, x, y) {
    const browserWindow = getElectronBrowserWindow(identity);

    if (!browserWindow) {
        return;
    }

    const currentBounds = browserWindow.getBounds();
    const safeX = toSafeInt(x);
    const safeY = toSafeInt(y);

    if (browserWindow.isMaximized()) {
        browserWindow.unmaximize();
    }

    // no need to call clipBounds here because width and height are not changing
    browserWindow.setBounds({
        x: safeX,
        y: safeY,
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
    ofEvents.removeListener(route.window(type, browserWindow.id), listener);
};


Window.resizeBy = function(identity, deltaWidth, deltaHeight, anchor) {
    let browserWindow = getElectronBrowserWindow(identity);

    if (!browserWindow) {
        return;
    }

    if (browserWindow.isMaximized()) {
        browserWindow.unmaximize();
    }

    let currentBounds = browserWindow.getBounds();
    let newWidth = toSafeInt(currentBounds.width + deltaWidth, currentBounds.width);
    let newHeight = toSafeInt(currentBounds.height + deltaHeight, currentBounds.height);
    let boundsAnchor = calcBoundsAnchor(anchor, newWidth, newHeight, currentBounds);
    browserWindow.setBounds(clipBounds({
        x: boundsAnchor.x,
        y: boundsAnchor.y,
        width: newWidth,
        height: newHeight
    }, browserWindow));
};


Window.resizeTo = function(identity, newWidth, newHeight, anchor) {
    const browserWindow = getElectronBrowserWindow(identity);

    if (!browserWindow) {
        return;
    }

    if (browserWindow.isMaximized()) {
        browserWindow.unmaximize();
    }

    const currentBounds = browserWindow.getBounds();
    newWidth = toSafeInt(newWidth, currentBounds.width);
    newHeight = toSafeInt(newHeight, currentBounds.height);
    const boundsAnchor = calcBoundsAnchor(anchor, newWidth, newHeight, currentBounds);

    browserWindow.setBounds(clipBounds({
        x: boundsAnchor.x,
        y: boundsAnchor.y,
        width: newWidth,
        height: newHeight
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

    if (browserWindow.isMaximized()) {
        browserWindow.unmaximize();
    }

    browserWindow.setBounds(clipBounds({
        x: toSafeInt(left, bounds.x),
        y: toSafeInt(top, bounds.y),
        width: toSafeInt(width, bounds.width),
        height: toSafeInt(height, bounds.height)
    }, browserWindow));
};


Window.show = function(identity, force = false) {
    let browserWindow = getElectronBrowserWindow(identity);

    if (!browserWindow) {
        return;
    }

    let payload = {};
    let defaultAction = () => {
        const dontShow = (
            // RUN-2905: To match v5 behavior, for maximized window, avoid showInactive() because it does an
            // erroneous restore(), an apparent Electron oversight (a restore _is_ needed in all other cases).
            // RUN-4122: For minimized window we should allow to show it when
            // it is hidden.
            browserWindow.isVisible() &&
            (browserWindow.isMinimized() || browserWindow.isMaximized())
        );

        if (!dontShow) {
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

    const safeLeft = toSafeInt(left);
    const safeTop = toSafeInt(top);
    let payload = {
        top: safeTop,
        left: safeLeft
    };
    let defaultAction = () => {
        let currentBounds = browserWindow.getBounds();

        if (browserWindow.isMaximized()) {
            browserWindow.unmaximize();
        }

        // no need to call clipBounds here because width and height are not changing
        browserWindow.setBounds({
            x: safeLeft,
            y: safeTop,
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
            click: () => {
                browserWindow.webContents.cut();
            },
            accelerator: 'CommandOrControl+X',
            enabled: hasSelectedText
        });
        menuTemplate.push({
            label: 'Copy',
            click: () => {
                browserWindow.webContents.copy();
            },
            accelerator: 'CommandOrControl+C',
            enabled: hasSelectedText
        });
        menuTemplate.push({
            label: 'Paste',
            click: () => {
                browserWindow.webContents.paste();
            },
            accelerator: 'CommandOrControl+V'
        });
        menuTemplate.push({
            label: 'Select all',
            click: () => {
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
        click: () => {
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
        click: () => {
            browserWindow.webContents.inspectElement(x, y);
        },
        accelerator: 'CommandOrControl+Shift+I'
    });

    const currentMenu = Menu.buildFromTemplate(menuTemplate);
    currentMenu.popup(browserWindow, {
        async: true
    });
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
    } = getPendingAuthRequest(identity);

    if (authCallback && typeof(authCallback) === 'function') {
        authCallback(username, password);
        deletePendingAuthRequest(identity);
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

    // browserWindow.webContents.setZoomLevel(level); // zooms all windows loaded from same domain
    browserWindow.webContents.send('zoom', { level }); // zoom just this window
};

Window.onUnload = (identity) => {
    ofEvents.emit(route.window('unload', identity.uuid, identity.name, false), identity);
    ofEvents.emit(route.window('init-subscription-listeners'), identity);
};

Window.registerWindowName = (identity) => {
    coreState.registerPendingWindowName(identity.uuid, identity.name);
};

function emitCloseEvents(identity) {
    const { uuid, name } = identity;

    ofEvents.emit(route.window('unload', uuid, name, false), identity);
    ofEvents.emit(route.window('openfin-diagnostic/unload', uuid, name, true), identity);

    electronApp.emit('browser-window-closed', null, getElectronBrowserWindow(identity));

    ofEvents.emit(route.window('closed', uuid, name, true), {
        topic: 'window',
        type: 'closed',
        uuid,
        name
    });

    ofEvents.emit(route.window('init-subscription-listeners'), identity);
}

function emitReloadedEvent(identity, url) {
    const {
        uuid,
        name
    } = identity;

    ofEvents.emit(route.window('reloaded', uuid, name), {
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
        const userCache = electronApp.getPath('userCache');
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
    const userCache = electronApp.getPath('userCache');
    return path.join(userCache, windowPosCacheFolder, `${safeName}.json`);
}

function applyAdditionalOptionsToWindowOnVisible(browserWindow, callback) {
    if (browserWindow.isVisible()) {
        callback();
    } else {
        browserWindow.once('visibility-changed', (event, isVisible) => {
            if (isVisible) {
                if (browserWindow.isVisible()) {
                    callback();
                    // Version 8: Will be visible on the next tick
                    // TODO: Refactor to also use 'ready-to-show'
                } else {
                    setTimeout(() => {
                        callback();
                    }, 1);
                }
            }
        });
    }
}


function handleForceActions(identity, force, eventType, eventPayload, defaultAction) {
    let appEventString = route.application(`window-${eventType}`, identity.uuid);
    let winEventString = route.window(eventType, identity.uuid, identity.name);
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
        if (!browserWindow.isDestroyed()) {
            // set alpha mask if present, otherwise set opacity if present
            if (options.alphaMask.red > -1 && options.alphaMask.green > -1 && options.alphaMask.blue > -1) {
                browserWindow.setAlphaMask(options.alphaMask.red, options.alphaMask.green, options.alphaMask.blue);
            } else if (options.opacity < 1) {
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
            browserWindow.setResizeSides(options.resizeRegion.sides.top, options.resizeRegion.sides.right,
                options.resizeRegion.sides.bottom, options.resizeRegion.sides.left);
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
    let propogate = false;

    if (args.length >= 2) {
        const [, visible, closing] = args;

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
            const { hideReason } = openfinWindow;
            payload.type = 'hidden';
            payload.reason = hideReason === 'hide' && closing ? 'closing' : hideReason;
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

function setTaskbar(browserWindow, forceFetch = false) {
    const options = browserWindow._options;

    setBlankTaskbarIcon(browserWindow);

    // If the window isn't loaded by a URL, or is "about:blank", then the
    // page-favicon-updated event never fires (explained below). In this case
    // we try the window options and if that fails we get the icon info
    // from the main window.
    if (!isHttpUrl(options.url)) {
        let _url = getWinOptsIconUrl(options);

        // v6 needs to match v5's behavior: if the window url is a file uri,
        // then icon can be either a file path, file uri, or url
        if (!isHttpUrl(_url) && !isFileUrl(_url)) {
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

    if (forceFetch) {
        // try the window icon options first
        setTaskbarIcon(browserWindow, getWinOptsIconUrl(options), () => {
            if (!browserWindow.isDestroyed()) {
                // if not, try using the main window's icon
                setTaskbarIcon(browserWindow, getMainWinIconUrl(browserWindow.id));
            }
        });
    }
}

function setTaskbarIcon(browserWindow, iconUrl, errorCallback = () => {}) {
    const identity = getIdentityFromObject(browserWindow._options);

    cachedFetch(identity, iconUrl, (error, iconFilepath) => {
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
        ofEvents.emit(route(topic, type, opts.uuid), payload);
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

function restoreWindowPosition(identity, cb) {
    Window.getBoundsFromDisk(identity, savedBounds => {

        const monitorInfo = System.getMonitorInfo();

        if (!boundsVisible(savedBounds, monitorInfo)) {
            const displayRoot = System.getNearestDisplayRoot({
                x: savedBounds.left,
                y: savedBounds.top
            });

            savedBounds.top = displayRoot.y;
            savedBounds.left = displayRoot.x;
        }

        Window.setBounds(identity, savedBounds.left, savedBounds.top, savedBounds.width, savedBounds.height);
        switch (savedBounds.windowState) {
            case 'maximized':
                Window.maximize(identity);
                break;
            case 'minimized':
                Window.minimize(identity);
                break;
        }

        cb();
    }, (err) => {
        //We care about errors but lets keep window creation going.
        log.writeToLog('info', err);
        cb();
    });
}

function intersectsRect(bounds, rect) {
    return !(bounds.left > rect.right || (bounds.left + bounds.width) < rect.left || bounds.top > rect.bottom || (bounds.top + bounds.height) < rect.top);
}

function boundsVisible(bounds, monitorInfo) {
    let visible = false;
    const monitors = [monitorInfo.primaryMonitor].concat(monitorInfo.nonPrimaryMonitors);

    for (let i = 0; i < monitors.length; i++) {
        if (intersectsRect(bounds, monitors[i].monitorRect)) {
            visible = true;
        }
    }
    return visible;
}

module.exports.Window = Window;
