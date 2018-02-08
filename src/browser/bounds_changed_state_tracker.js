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
    src/browser/bounds_changed_state_tracker.js
 */

let windowTransaction = require('electron').windowTransaction;

let _ = require('underscore');
let animations = require('./animations.js');
let coreState = require('./core_state.js');
import * as Deferred from './deferred';
let WindowGroups = require('./window_groups.js');
import WindowGroupTransactionTracker from './window_group_transaction_tracker';
import { toSafeInt } from '../common/safe_int';

const isWin32 = process.platform === 'win32';

function BoundsChangedStateTracker(uuid, name, browserWindow) {
    let me = this;

    // a flag that represents if any change in the size has happened
    // without relying on the checking of the previous bounds which
    // may or may not be reliable depending on the previous event (
    // specifically bounds-changing)
    let sizeChanged = false;
    let positionChanged = false;

    let _cachedBounds = {},
        _userBoundsChangeActive = false;

    let _deferred = false;
    let _deferredEvents = [];

    let setUserBoundsChangeActive = (enabled) => {
        _userBoundsChangeActive = enabled;
    };

    let isUserBoundsChangeActive = () => {
        return _userBoundsChangeActive;
    };

    let updateCachedBounds = (bounds) => {
        _cachedBounds = bounds;
    };

    let getCachedBounds = () => {
        return _cachedBounds;
    };

    let getCurrentBounds = () => {
        let bounds = browserWindow.getBounds();

        let windowState = 'normal';
        if (browserWindow.isMaximized()) {
            windowState = 'maximized';
        }
        if (browserWindow.isMinimized()) {
            windowState = 'minimized';
        }
        bounds.windowState = windowState;

        return bounds;
    };

    let compareBoundsResult = (boundsOne, boundsTwo) => {
        let xDiff = boundsOne.x !== boundsTwo.x;
        let yDiff = boundsOne.y !== boundsTwo.y;
        let widthDiff = boundsOne.width !== boundsTwo.width;
        let heightDiff = boundsOne.height !== boundsTwo.height;
        let stateDiff = boundsOne.windowState !== boundsTwo.windowState;
        let changed = xDiff || yDiff || widthDiff || heightDiff /* || stateDiff*/ ;

        // set the changed flag only if it has not been set
        sizeChanged = sizeChanged || (widthDiff || heightDiff);
        if (sizeChanged) {
            xDiff = xDiff && ((boundsOne.x - boundsTwo.x) !== (boundsTwo.width - boundsOne.width));
            yDiff = yDiff && ((boundsOne.y - boundsTwo.y) !== (boundsTwo.height - boundsOne.height));
        }
        positionChanged = positionChanged || (xDiff || yDiff);


        return {
            x: xDiff,
            y: yDiff,
            width: widthDiff,
            height: heightDiff,
            state: stateDiff,
            changed
        };
    };

    let getBoundsDelta = (current, cached) => {
        return {
            x: current.x - cached.x,
            x2: (current.x + current.width) - (cached.x + cached.width),
            y: current.y - cached.y,
            y2: (current.y + current.height) - (cached.y + cached.height),
            width: current.width - cached.width,
            height: current.height - cached.height
        };
    };

    let boundsChangeReason = (name, groupUuid) => {
        if (groupUuid) {
            let groupLeader = WindowGroupTransactionTracker.getGroupLeader(groupUuid) || {};

            if (groupLeader.uuid && groupLeader.name) {
                let ofWindow = coreState.getWindowByUuidName(groupLeader.uuid, groupLeader.name);

                if (animations.getAnimationHandler().hasWindow(ofWindow.browserWindow.id)) {
                    return groupLeader.name === name ? 'animation' : 'group-animation';
                } else {
                    return groupLeader.name === name ? 'self' : 'group';
                }
            }
        }

        return animations.getAnimationHandler().hasWindow(browserWindow.id) ? 'animation' : 'self';
    };

    let handleBoundsChange = (isAdditionalChangeExpected, force) => {

        let dispatchedChange = false;

        let currentBounds = getCurrentBounds();
        let cachedBounds = getCachedBounds();
        let boundsCompare = compareBoundsResult(currentBounds, cachedBounds);
        let stateMin = boundsCompare.state && currentBounds.state === 'minimized';

        let eventType = isAdditionalChangeExpected ? 'bounds-changing' :
            'bounds-changed';

        let sizeChangedCriteria = [
            boundsCompare.width,
            boundsCompare.height
        ];

        let positionChangedCriteria = [
            boundsCompare.x,
            boundsCompare.y
        ];

        let isBoundsChanged = eventType === 'bounds-changed';

        // if this is to be the "last" event in a transaction, be sure to
        // any diff in the size or position towards the change type
        if (isBoundsChanged) {
            sizeChangedCriteria.push(sizeChanged);
            positionChangedCriteria.push(positionChanged);
        }

        if (boundsCompare.changed && !stateMin || force) {

            // returns true if any of the criteria are true
            let sizeChange = _.some(sizeChangedCriteria, (criteria) => {
                return criteria;
            });

            let posChange = _.some(positionChangedCriteria, (criteria) => {
                return criteria;
            });

            //let posChange = boundsCompare.x || boundsCompare.y;

            //0 means a change in position.
            //1 means a change in size.
            //2 means a change in position and size.
            // Default to change in position when there is no change
            let changeType = (sizeChange ? (posChange ? 2 : 1) : 0);

            let ofWindow = coreState.getWindowByUuidName(uuid, name) || {};
            let groupUuid = ofWindow.groupUuid;

            // determine what caused the bounds change
            let reason = boundsChangeReason(name, groupUuid);

            // handle window group movements
            if (groupUuid) {
                let groupLeader = WindowGroupTransactionTracker.getGroupLeader(groupUuid) || {};

                if (force) {
                    if (groupLeader.name === name) {
                        // no need to notify group members for api moves since every window
                        // will already receive an end notification
                        if (groupLeader.type !== 'api') {
                            WindowGroupTransactionTracker.notifyEndTransaction(groupUuid);
                        }
                        WindowGroupTransactionTracker.clearGroup(groupUuid);
                    }
                } else {
                    if (!groupLeader.name) {
                        let type = isUserBoundsChangeActive() ? 'user' : animations.getAnimationHandler().hasWindow(browserWindow.id) ? 'animation' : 'api';
                        WindowGroupTransactionTracker.setGroupLeader(groupUuid, name, uuid, type);
                    }
                }

                groupLeader = WindowGroupTransactionTracker.getGroupLeader(groupUuid) || {};
                if (groupLeader.name === name) {
                    let delta = getBoundsDelta(currentBounds, cachedBounds);
                    let wt; // window-transaction
                    let hwndToId = {};

                    const { flag: { noZorder, noSize, noActivate } } = windowTransaction;
                    let flags;
                    if (changeType === 1) {
                        // this may need to change to 1 or 2 if we fix functionality for changeType 2
                        flags = noZorder + noActivate;
                    } else {
                        flags = noZorder + noSize + noActivate;
                    }

                    WindowGroups.getGroup(groupUuid).filter((win) => {
                        win.browserWindow.bringToFront();
                        return win.name !== name;
                    }).forEach((win) => {
                        const winBounds = win.browserWindow.getBounds();
                        let { x, y, width, height } = winBounds;

                        // not doing anything for changeType === 1 so behaviors can be customized by clients
                        // If it is a change in position (working correctly) or a change in position and size (not yet implemented)
                        if (changeType === 0 || changeType === 2) {
                            x = toSafeInt(x + delta.x, x);
                            y = toSafeInt(y + delta.y, y);
                        }

                        if (isWin32) {
                            let hwnd = parseInt(win.browserWindow.nativeId, 16);

                            if (!wt) {
                                wt = new windowTransaction.Transaction(0);

                                wt.on('deferred-set-window-pos', (event, payload) => {
                                    payload.forEach((winPos) => {
                                        let bwId = hwndToId[parseInt(winPos.hwnd)];
                                        Deferred.handleMove(bwId, winPos);
                                    });
                                });
                            }
                            hwndToId[hwnd] = win.browserWindow.id;
                            if (win.browserWindow.isMaximized()) {
                                win.browserWindow.unmaximize();
                            }
                            const [w, h] = [width, height];
                            wt.setWindowPos(hwnd, { x, y, w, h, flags });
                        } else {
                            if (win.browserWindow.isMaximized()) {
                                win.browserWindow.unmaximize();
                            }
                            // no need to call clipBounds here because called earlier
                            win.browserWindow.setBounds({ x, y, width, height });
                        }
                    });

                    if (wt) {
                        wt.commit();
                    }
                }
            }

            let payload = {
                changeType,
                reason,
                name,
                uuid,
                type: eventType,
                deferred: _deferred,
                top: currentBounds.y,
                left: currentBounds.x,
                height: currentBounds.height,
                width: currentBounds.width
            };

            if (_deferred) {
                _deferredEvents.push(payload);
            } else {
                browserWindow.emit('synth-bounds-change', payload);
            }

            dispatchedChange = true;
        }

        updateCachedBounds(currentBounds);

        // this represents the changed event, reset the overall changed flag
        if (!isAdditionalChangeExpected) {
            sizeChanged = false;
            positionChanged = false;
        }

        return dispatchedChange;
    };

    let collapseEventReasonTypes = (eventsList) => {
        let eventGroups = [];

        eventsList.forEach((event, index) => {
            if (index === 0 || event.reason !== eventsList[index - 1].reason) {
                let list = [];
                list.push(event);
                eventGroups.push(list);
            } else {
                _.last(eventGroups).push(event);
            }
        });

        return eventGroups.map((group) => {
            let sizeChange = false;
            let posChange = false;

            group.forEach((event) => {
                if (event.changeType === 0) {
                    posChange = true;
                } else if (event.changeType === 1) {
                    sizeChange = true;
                } else {
                    sizeChange = true;
                    posChange = true;
                }
            });

            let lastEvent = _.last(group);
            lastEvent.changeType = (sizeChange ? (posChange ? 2 : 1) : 0);

            return lastEvent;
        });
    };

    let dispatchDeferredEvents = () => {
        let boundsChangedEvents = _deferredEvents.filter((event) => {
            return event.type === 'bounds-changed';
        });

        let reasonGroupedEvents = collapseEventReasonTypes(boundsChangedEvents);

        reasonGroupedEvents.forEach((event) => {
            event.type = 'bounds-changing';
            browserWindow.emit('synth-bounds-change', event);
            event.type = 'bounds-changed';
            browserWindow.emit('synth-bounds-change', event);
        });

        _deferredEvents.length = 0;
    };

    let _listeners = {
        'begin-user-bounds-change': () => {
            setUserBoundsChangeActive(true);
        },
        'end-user-bounds-change': () => {
            setUserBoundsChangeActive(false);
            handleBoundsChange(false, true);
        },
        'bounds-changed': () => {
            let ofWindow = coreState.getWindowByUuidName(uuid, name) || {};
            let groupUuid = ofWindow.groupUuid;

            let dispatchedChange = handleBoundsChange(true);

            if (dispatchedChange) {
                if (groupUuid) {
                    let groupLeader = WindowGroupTransactionTracker.getGroupLeader(groupUuid) || {};

                    if (groupLeader.type === 'api') {
                        handleBoundsChange(false, true);
                    }
                } else {
                    if (!animations.getAnimationHandler().hasWindow(browserWindow.id) && !isUserBoundsChangeActive()) {
                        handleBoundsChange(false, true);
                    }
                }
            }
        },
        'synth-animate-end': (meta) => {
            if (meta.bounds) {
                // COMMENT THIS OUT FOR TESTING FLICKERING
                handleBoundsChange(false, true);
            }
        },
        'visibility-changed': (event, isVisible) => {
            if (!isVisible || browserWindow.isMinimized() || browserWindow.isMaximized()) {
                _deferred = true;
            } else {
                _deferred = false;
                dispatchDeferredEvents();
            }
        },
        'minimize': () => {
            _deferred = true;
            updateCachedBounds(getCurrentBounds());
        },
        'maximize': () => {
            _deferred = true;
            updateCachedBounds(getCurrentBounds());
        },
        'restore': () => {
            _deferred = false;
            updateCachedBounds(getCurrentBounds());
            dispatchDeferredEvents();
        },
        'unmaximize': () => {
            _deferred = false;
            updateCachedBounds(getCurrentBounds());
            dispatchDeferredEvents();
        },
        'deferred-set-bounds': (event, payload) => {
            Deferred.handleMove(browserWindow.id, payload);
        }
    };

    let endWindowGroupTransactionListener = (groupUuid) => {
        let ofWindow = coreState.getWindowByUuidName(uuid, name) || {};
        let _groupUuid = ofWindow.groupUuid;

        if (_groupUuid === groupUuid) {
            let groupLeader = WindowGroupTransactionTracker.getGroupLeader(groupUuid) || {};

            if (groupLeader.name !== name) {
                handleBoundsChange(false, true);
            }
        }
    };

    let updateEvents = (register) => {
        let listenerFn = register ? 'on' : 'removeListener';

        Object.keys(_listeners).forEach((key) => {
            browserWindow[listenerFn](key, _listeners[key]);
        });

        WindowGroupTransactionTracker[listenerFn]('end-window-group-transaction', endWindowGroupTransactionListener);
    };

    let hookListeners = () => {
        updateEvents(true);
    };

    let unHookListeners = () => {
        updateEvents(false);
    };

    // Remove all event listeners this instance subscribed on
    me.teardown = () => {
        unHookListeners();
    };

    // Cache the current bounds on construction
    updateCachedBounds(getCurrentBounds());

    // listen to relevant browser-window events
    hookListeners();

    //exposing the getCachedBounds
    me.getCachedBounds = getCachedBounds;
    return me;
}



module.exports = BoundsChangedStateTracker;
