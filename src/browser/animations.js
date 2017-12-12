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
 *  src/browser/animations.js
 *
 *  Functions that support the window animations
 */

let app = require('electron').app;
let BrowserWindow = require('electron').BrowserWindow;
let NativeTimer = require('electron').nativeTimer;
let windowTransaction = require('electron').windowTransaction;

let clipBounds = require('./clip_bounds.js').default;
let Deferred = require('./deferred.js');
let Tweens = require('./animation/tween.js');
import {
    toSafeInt
} from '../common/safe_int';

const isWin32 = process.platform === 'win32';

let _screen;
// Must be singleton currently
let _animationHandler;
// TODO this needs to be moved to a central location
app.on('ready', function() {
    _screen = require('electron').screen;
    _animationHandler = new AnimationHandler(1000.0 / 40.0);
});


function getAnimationHandler() {
    return _animationHandler;
}


function getScreen() {
    return _screen;
}


function AnimationHandler(desiredInterval) {
    var me = this,
        interval = Math.round(desiredInterval),
        _transitionsPerWindow = {},
        _lastFrame,
        nativeTimer;

    var startTimerIfNeeded = () => {
        if (!nativeTimer.isRunning()) {
            _lastFrame = Date.now();
            nativeTimer.reset();
        }
    };
    var stopTimer = () => {
        nativeTimer.stop();
    };

    var pump = (deltaTime, currentTime) => {
        /*, lastTime, deltaExpectedTillNextPump*/
        var wt; // window-transaction
        let hwndToId = {};
        var activeWindows = Object.keys(_transitionsPerWindow);

        const { flag: { noZorder, noActivate } } = windowTransaction;
        const flags = noZorder + noActivate;

        activeWindows.forEach((key) => {
            try {
                var bw = BrowserWindow.fromId(parseInt(key));
                var currentWindowEntry = (_transitionsPerWindow[key] || {});
                var transitions = currentWindowEntry.transitions || [];
                if (transitions.length) {
                    var currentTransition = transitions[0];

                    // Begin the animation
                    if (!currentTransition.startTime) {
                        bw.emit('synth-tween-start');
                        currentTransition.startTime = currentTime;
                        var meta = currentTransition.transitions;
                        var currentBounds = bw.getBounds();

                        if (meta.position) {
                            let relative = meta.position.relative || false;
                            let x = meta.position.left;
                            let y = meta.position.top;
                            meta.position.delta = {
                                x: (typeof meta.position.left === 'number' ? (!relative ? x - currentBounds.x : x) : 0),
                                y: (typeof meta.position.top === 'number' ? (!relative ? y - currentBounds.y : y) : 0)
                            };
                        }

                        if (meta.size) {
                            let relative = meta.size.relative || false;
                            let width = meta.size.width;
                            let height = meta.size.height;
                            meta.size.delta = {
                                width: (typeof meta.size.width === 'number' ? (!relative ? width - currentBounds.width : width) : 0),
                                height: (typeof meta.size.height === 'number' ? (!relative ? height - currentBounds.height : height) : 0)
                            };
                        }

                        if (meta.opacity) {
                            let relative = meta.opacity.relative || false;
                            let opacity = meta.opacity.opacity;
                            meta.opacity.delta = {
                                value: (typeof meta.opacity.opacity === 'number' ? (!relative ? opacity - bw.getOpacity() : opacity) : 0)
                            };
                        }

                        currentTransition.initialOpacity = bw.getOpacity();
                        currentTransition.initialBounds = bw.getBounds();
                    }

                    var transitionDelta = currentTime - currentTransition.startTime;

                    // t: current time
                    // b: start value
                    // c: change in value
                    // d: duration
                    var tween = Tweens[currentTransition.transitionType] || function() {
                        return 0;
                    };

                    var totalDuration;
                    var currentDuration;
                    var updateBounds = false;
                    var updateOpacity = false;
                    var opacityChange = 0.0;
                    var positionTransition = currentTransition.transitions.position;
                    var sizeTransition = currentTransition.transitions.size;
                    var opacityTransition = currentTransition.transitions.opacity;
                    var boundsChange = {
                        x: 0,
                        y: 0,
                        width: 0,
                        height: 0
                    };

                    if (positionTransition) {
                        totalDuration = positionTransition.duration || 0;
                        currentDuration = Math.min(totalDuration, transitionDelta);

                        if (positionTransition.delta) {
                            updateBounds = true;
                            boundsChange.x = tween(currentDuration, 0, positionTransition.delta.x, totalDuration);
                            boundsChange.y = tween(currentDuration, 0, positionTransition.delta.y, totalDuration);
                        }

                        if (currentDuration >= totalDuration) {
                            updateBounds = true;
                            delete currentTransition.transitions.position;
                            positionTransition = undefined;
                            /* jshint ignore:start */
                            currentTransition.initialBounds.x = currentTransition.initialBounds.x + (boundsChange.x | 0);
                            currentTransition.initialBounds.y = currentTransition.initialBounds.y + (boundsChange.y | 0);
                            boundsChange.x = 0;
                            boundsChange.y = 0;
                            /* jshint ignore:end */
                        }
                    }

                    if (sizeTransition) {
                        totalDuration = sizeTransition.duration || 0;
                        currentDuration = Math.min(totalDuration, transitionDelta);

                        if (sizeTransition.delta) {
                            updateBounds = true;
                            boundsChange.width = tween(currentDuration, 0, sizeTransition.delta.width, totalDuration);
                            boundsChange.height = tween(currentDuration, 0, sizeTransition.delta.height, totalDuration);
                        }

                        if (currentDuration >= totalDuration) {
                            updateBounds = true;
                            delete currentTransition.transitions.size;
                            sizeTransition = undefined;
                            /* jshint ignore:start */
                            currentTransition.initialBounds.width = currentTransition.initialBounds.width + (boundsChange.width | 0);
                            currentTransition.initialBounds.height = currentTransition.initialBounds.height + (boundsChange.height | 0);
                            boundsChange.width = 0;
                            boundsChange.height = 0;
                            /* jshint ignore:end */
                        }
                    }

                    if (opacityTransition) {
                        totalDuration = opacityTransition.duration || 0;
                        currentDuration = Math.min(totalDuration, transitionDelta);

                        if (opacityTransition.delta) {
                            updateOpacity = true;
                            opacityChange = tween(currentDuration, 0, opacityTransition.delta.value, totalDuration);
                        }

                        if (currentDuration >= totalDuration) {
                            updateOpacity = true;
                            delete currentTransition.transitions.opacity;
                            opacityTransition = undefined;
                            currentTransition.initialOpacity = currentTransition.initialOpacity + opacityChange;
                            opacityChange = 0;
                        }
                    }


                    if (updateOpacity) {
                        currentWindowEntry.hadOpacityChange = true;
                        bw.setOpacity(Math.min(Math.max(0, currentTransition.initialOpacity + opacityChange), 1.0));
                    }

                    if (updateBounds) {
                        currentWindowEntry.hadBoundsChange = true;

                        let { x, y, width, height } = currentTransition.initialBounds;
                        x = toSafeInt(x + boundsChange.x, x);
                        y = toSafeInt(y + boundsChange.y, y);
                        width = toSafeInt(width + boundsChange.width, width);
                        height = toSafeInt(height + boundsChange.height, height);

                        const newBounds = clipBounds({ x, y, width, height }, bw);

                        if (isWin32) {
                            let hwnd = parseInt(bw.nativeId, 16);

                            if (!wt) {
                                wt = new windowTransaction.Transaction(0);

                                wt.on('deferred-set-window-pos', (event, payload) => {
                                    payload.forEach((winPos) => {
                                        let bwId = hwndToId[parseInt(winPos.hwnd)];
                                        Deferred.handleMove(bwId, winPos);
                                    });
                                });
                            }
                            hwndToId[hwnd] = bw.id;
                            if (bw.isMaximized()) {
                                bw.unmaximize();
                            }

                            const { x, y, width: w, height: h } = newBounds;
                            wt.setWindowPos(hwnd, { x, y, w, h, flags });
                        } else {
                            if (bw.isMaximized()) {
                                bw.unmaximize();
                            }
                            bw.setBounds(newBounds);
                        }
                    }

                    // Remove transition when done
                    if (!sizeTransition && !positionTransition && !opacityTransition) {
                        // Window ID will get removed from map on next pump if no transitions remain.
                        transitions.splice(0, 1);
                        currentTransition.resolve();
                        bw.emit('synth-tween-end');
                    }
                } else {
                    // Trigger animation end for bounds change state tracking
                    bw.emit('synth-animate-end', {
                        opacity: currentWindowEntry.hadOpacityChange,
                        bounds: currentWindowEntry.hadBoundsChange
                    });

                    // 5.0 triggers the success callback before triggering bounds-changed after ending an animation.
                    // Remove window from tracking
                    delete _transitionsPerWindow[key];
                }
            } catch (e) {}
        });

        if (wt) {
            wt.commit();
        }

        if (!activeWindows.length) {
            stopTimer();
        }
    };


    // Starts the timer. First pump will automatically stop
    nativeTimer = new NativeTimer(() => {
        var currentFrame = Date.now();

        try {
            pump(currentFrame - _lastFrame, currentFrame, _lastFrame /*, deltaExpectedTillNextPump */ );
        } catch (e) {

        }

        _lastFrame = Date.now();
    }, interval);

    me.hasWindow = (id) => {
        return !!_transitionsPerWindow[id];
    };

    me.add = (browserWindow, meta, transitionType, successCallback, errorCallback) => {
        meta = meta || {};
        _transitionsPerWindow[browserWindow.id] = _transitionsPerWindow[browserWindow.id] || {
            hadOpacityChange: false,
            hadBoundsChange: false,
            transitions: []
        };

        var entry = _transitionsPerWindow[browserWindow.id].transitions;
        var now = Date.now();
        var maxDuration = Math.max((meta.size || {}).duration || 0,
            Math.max((meta.opacity || {}).duration || 0,
                (meta.position || {}).duration || 0));

        if (meta.interrupt) {
            entry.forEach(function(transition) {
                // 5.0 triggers success callback even on interruption
                transition.resolve(undefined, 'interrupted');
            });

            entry.length = 0;
        }
        entry.push({
            startTime: undefined,
            maxDuration: maxDuration,
            transitions: meta,
            endTime: now + maxDuration,
            transitionType: transitionType,
            resolve: function(err) {
                if (!err && typeof successCallback === 'function') {
                    successCallback();
                } else if (err && typeof errorCallback === 'function') {
                    errorCallback(err);
                }
            }
        });

        startTimerIfNeeded();
    };

    return me;
} // end AnimationHandler




module.exports = {
    getScreen,
    AnimationHandler,
    getAnimationHandler
};
