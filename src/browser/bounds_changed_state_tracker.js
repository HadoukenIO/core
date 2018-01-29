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
    var me = this;

    // a flag that represents if any change in the size has happened
    // without relying on the checking of the previous bounds which
    // may or may not be reliable depending on the previous event (
    // specifically bounds-changing)
    var sizeChanged = false;
    var positionChanged = false;

    var _cachedBounds = {},
        _userBoundsChangeActive = false;

    let _deferred = false;
    let _deferredEvents = [];

    var setUserBoundsChangeActive = (enabled) => {
        _userBoundsChangeActive = enabled;
    };

    var isUserBoundsChangeActive = () => {
        return _userBoundsChangeActive;
    };

    var updateCachedBounds = (bounds) => {
        _cachedBounds = bounds;
    };

    var getCachedBounds = () => {
        return _cachedBounds;
    };

    var getCurrentBounds = () => {
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

    var compareBoundsResult = (boundsOne, boundsTwo) => {
        var xDiff = boundsOne.x !== boundsTwo.x;
        var yDiff = boundsOne.y !== boundsTwo.y;
        var widthDiff = boundsOne.width !== boundsTwo.width;
        var heightDiff = boundsOne.height !== boundsTwo.height;
        var stateDiff = boundsOne.windowState !== boundsTwo.windowState;
        var changed = xDiff || yDiff || widthDiff || heightDiff /* || stateDiff*/ ;

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

    var getBoundsDelta = (current, cached) => {
        return {
            x: current.x - cached.x,
            x2: (current.x + current.width) - (cached.x + cached.width),
            y: current.y - cached.y,
            y2: (current.y + current.height) - (cached.y + cached.height),
            width: current.width - cached.width,
            height: current.height - cached.height
        };
    };

    var boundsChangeReason = (name, groupUuid) => {
        if (groupUuid) {
            var groupLeader = WindowGroupTransactionTracker.getGroupLeader(groupUuid) || {};

            if (groupLeader.uuid && groupLeader.name) {
                var ofWindow = coreState.getWindowByUuidName(groupLeader.uuid, groupLeader.name);

                if (animations.getAnimationHandler().hasWindow(ofWindow.browserWindow.id)) {
                    return groupLeader.name === name ? 'animation' : 'group-animation';
                } else {
                    return groupLeader.name === name ? 'self' : 'group';
                }
            }
        }

        return animations.getAnimationHandler().hasWindow(browserWindow.id) ? 'animation' : 'self';
    };

    var handleBoundsChange = (isAdditionalChangeExpected, force) => {

        var dispatchedChange = false;

        var currentBounds = getCurrentBounds();
        var cachedBounds = getCachedBounds();
        var boundsCompare = compareBoundsResult(currentBounds, cachedBounds);
        var stateMin = boundsCompare.state && currentBounds.state === 'minimized';

        var eventType = isAdditionalChangeExpected ? 'bounds-changing' :
            'bounds-changed';

        var sizeChangedCriteria = [
            boundsCompare.width,
            boundsCompare.height
        ];

        var positionChangedCriteria = [
            boundsCompare.x,
            boundsCompare.y
        ];

        var isBoundsChanged = eventType === 'bounds-changed';

        // if this is to be the "last" event in a transaction, be sure to
        // any diff in the size or position towards the change type
        if (isBoundsChanged) {
            sizeChangedCriteria.push(sizeChanged);
            positionChangedCriteria.push(positionChanged);
        }

        if (boundsCompare.changed && !stateMin || force) {

            // returns true if any of the criteria are true
            var sizeChange = _.some(sizeChangedCriteria, (criteria) => {
                return criteria;
            });

            var posChange = _.some(positionChangedCriteria, (criteria) => {
                return criteria;
            });

            //var posChange = boundsCompare.x || boundsCompare.y;

            //0 means a change in position.
            //1 means a change in size.
            //2 means a change in position and size.
            // Default to change in position when there is no change
            var changeType = (sizeChange ? (posChange ? 2 : 1) : 0);

            var ofWindow = coreState.getWindowByUuidName(uuid, name) || {};
            var groupUuid = ofWindow.groupUuid;

            // determine what caused the bounds change
            var reason = boundsChangeReason(name, groupUuid);

            // handle window group movements
            if (groupUuid) {
                var groupLeader = WindowGroupTransactionTracker.getGroupLeader(groupUuid) || {};

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
                        var type = isUserBoundsChangeActive() ? 'user' : animations.getAnimationHandler().hasWindow(browserWindow.id) ? 'animation' : 'api';
                        WindowGroupTransactionTracker.setGroupLeader(groupUuid, name, uuid, type);
                    }
                }

                groupLeader = WindowGroupTransactionTracker.getGroupLeader(groupUuid) || {};
                if (groupLeader.name === name) {
                    var delta = getBoundsDelta(currentBounds, cachedBounds);
                    var wt; // window-transaction
                    let hwndToId = {};

                    const { flag: { noZorder, noSize, noActivate } } = windowTransaction;

                    let flags;
                    // LATER - this may need to change to 1 or 2
                    if (changeType === 1) {
                        flags = noZorder + noActivate;
                    } else {
                        flags = noZorder + noSize + noActivate;
                    }

                    const groupedWindows = WindowGroups.getGroup(groupUuid);

                    let groupedWindowsWithBounds = groupedWindows.map(win => {
                        let bounds = win.browserWindow.getBounds();
                        win.bounds = bounds;
                        if (win.name === name) {
                            win.bounds = cachedBounds;
                        }
                        return win;
                    });
                    // If window resize, get edges of window group
                    let outerBounds;
                    if (changeType === 1) {
                        let minX = groupedWindowsWithBounds.map(winWithBounds => winWithBounds.bounds.x)
                            .reduce((acc, leftBound) => leftBound < acc ? leftBound : acc);
                        let maxX = groupedWindowsWithBounds.map(winWithBounds => (winWithBounds.bounds.x + winWithBounds.bounds.width))
                            .reduce((acc, rightBound) => rightBound > acc ? rightBound : acc);
                        let minY = groupedWindowsWithBounds.map(winWithBounds => winWithBounds.bounds.y)
                            .reduce((acc, topBound) => topBound < acc ? topBound : acc);
                        let maxY = groupedWindowsWithBounds.map(winWithBounds => winWithBounds.bounds.y + winWithBounds.bounds.height)
                            .reduce((acc, bottomBound) => bottomBound > acc ? bottomBound : acc);

                        outerBounds = { minX, maxX, minY, maxY };
                        //Determine if original window resize changed the outer bounds of the window group
                        if (boundsCompare.width) {
                            if (delta.x && cachedBounds.x === minX) {
                                // top bounds changed; later, change all that match top bound
                                boundsCompare.leftOuterBoundChanged = true;
                            }
                            if (delta.x2 && (cachedBounds.x + cachedBounds.width) === maxX) {
                                boundsCompare.rightOuterBoundChanged = true;
                            }
                        }
                        if (boundsCompare.height) {
                            if (delta.y && cachedBounds.y === minY) {
                                boundsCompare.topOuterBoundChanged = true;
                            }
                            if (delta.y2 && (cachedBounds.y + cachedBounds.height) === maxY) {
                                boundsCompare.bottomOuterBoundChanged = true;
                            }
                        }
                    }

                    let sharedBoundPixelDiff = 3;
                    let sharedBound = (boundOne, boundTwo) => {
                        return Math.abs(boundOne - boundTwo) < sharedBoundPixelDiff;
                    };

                    groupedWindowsWithBounds.filter((win) => {
                        win.browserWindow.bringToFront();
                        return win.name !== name;
                    }).forEach((win) => {
                        let { x, y, width, height } = win.bounds;
                        // If it is a change in position (working correctly) or a change in position and size (not yet implemented)
                        if (changeType === 0 || changeType === 2) {
                            x = toSafeInt(x + delta.x, x);
                            y = toSafeInt(y + delta.y, y);
                            // If it is a change in the size of the window, only move windows that are beyond the side being changed
                        } else if (changeType === 1) {
                            if (boundsCompare.width) {
                                if (delta.x) {
                                    if (sharedBound(cachedBounds.x, outerBounds.minX) && sharedBound(x, outerBounds.minX)) {
                                        //left outer bound has changed - resize windows that match left outer bound
                                        x = toSafeInt(x + delta.x, x);
                                        width = width + delta.width;
                                    } else {
                                        //left inner bound changed
                                        if (sharedBound(x, cachedBounds.x)) {
                                            // resize windows with matching left bound
                                            // currently same behavior as an outer bound but keeping separate in case we want to alter
                                            x = toSafeInt(x + delta.x, x);
                                            width = width + delta.width;
                                        }
                                        if (sharedBound(x + width, cachedBounds.x)) {
                                            // resize windows with matching right bound
                                            width = width - delta.width;
                                        }
                                    }
                                }
                                if (delta.x2) {
                                    if (sharedBound(cachedBounds.x + cachedBounds.width, outerBounds.maxX) && sharedBound(x + width, outerBounds.maxX)) {
                                        //right outer bound has changed - resize windows that match right outer bound
                                        width = width + delta.width;
                                    } else {
                                        //right inner bound changed
                                        if (sharedBound(x + width, cachedBounds.x + cachedBounds.width)) {
                                            // resize windows with matching right bound
                                            width = width + delta.width;
                                        }
                                        if (sharedBound(x, cachedBounds.x + cachedBounds.width)) {
                                            // resize windows with matching left bound
                                            x = toSafeInt(x + delta.width, x);
                                            width = width - delta.width;
                                        }
                                    }
                                }
                            }
                            if (boundsCompare.height) {
                                if (delta.y) {
                                    if (sharedBound(cachedBounds.y, outerBounds.minY) && sharedBound(x, outerBounds.minY)) {
                                        //left outer bound has changed - resize windows that match left outer bound
                                        y = toSafeInt(y + delta.y, y);
                                        height = height + delta.height;
                                    } else {
                                        //left inner bound changed
                                        if (sharedBound(y, cachedBounds.y)) {
                                            // resize windows with matching left bound
                                            // (SAME AS ABOVE BUT KEEPING SEPARATE BC MAY NEED TO REFACTOR based on if inner / outer)
                                            y = toSafeInt(y + delta.y, y);
                                            height = height + delta.height;
                                        }
                                        if (sharedBound(y + height, cachedBounds.y)) {
                                            // resize windows with matching right bound
                                            height = height - delta.height;
                                        }
                                    }
                                }
                                if (delta.y2) {
                                    if (sharedBound(cachedBounds.y + cachedBounds.height, outerBounds.maxY) && sharedBound(x + height, outerBounds.maxY)) {
                                        //right outer bound has changed - resize windows that match right outer bound
                                        height = height + delta.height;
                                    } else {
                                        //right inner bound changed
                                        if (sharedBound(y + height, cachedBounds.y + cachedBounds.height)) {
                                            // resize windows with matching right bound
                                            height = height + delta.height;
                                        }
                                        if (sharedBound(y, cachedBounds.y + cachedBounds.height)) {
                                            // resize windows with matching left bound
                                            y = toSafeInt(y + delta.height, y);
                                            height = height - delta.height;
                                        }
                                    }
                                }
                            }
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
                            let [w, h] = [width, height];
                            // Clip bounds?
                            wt.setWindowPos(hwnd, { x, y, w, h, flags });
                        } else {
                            if (win.browserWindow.isMaximized()) {
                                win.browserWindow.unmaximize();
                            }
                            // no need to call clipBounds here because width and height are not changing
                            // CLIP BOUNDS???
                            win.browserWindow.setBounds({ x, y, width, height });
                        }
                    });

                    if (wt) {
                        wt.commit();
                    }
                }
            }

            var payload = {
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

    var _listeners = {
        'begin-user-bounds-change': () => {
            setUserBoundsChangeActive(true);
        },
        'end-user-bounds-change': () => {
            setUserBoundsChangeActive(false);
            handleBoundsChange(false, true);
        },
        'bounds-changed': () => {
            var ofWindow = coreState.getWindowByUuidName(uuid, name) || {};
            var groupUuid = ofWindow.groupUuid;

            var dispatchedChange = handleBoundsChange(true);

            if (dispatchedChange) {
                if (groupUuid) {
                    var groupLeader = WindowGroupTransactionTracker.getGroupLeader(groupUuid) || {};

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

    var endWindowGroupTransactionListener = (groupUuid) => {
        var ofWindow = coreState.getWindowByUuidName(uuid, name) || {};
        var _groupUuid = ofWindow.groupUuid;

        if (_groupUuid === groupUuid) {
            var groupLeader = WindowGroupTransactionTracker.getGroupLeader(groupUuid) || {};

            if (groupLeader.name !== name) {
                handleBoundsChange(false, true);
            }
        }
    };

    var updateEvents = (register) => {
        var listenerFn = register ? 'on' : 'removeListener';

        Object.keys(_listeners).forEach((key) => {
            browserWindow[listenerFn](key, _listeners[key]);
        });

        WindowGroupTransactionTracker[listenerFn]('end-window-group-transaction', endWindowGroupTransactionListener);
    };

    var hookListeners = () => {
        updateEvents(true);
    };

    var unHookListeners = () => {
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
