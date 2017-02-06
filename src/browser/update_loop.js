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
var UpdateLoop = function(pumpIntervalHint) {
    var me = this,
        _desiredInterval = Math.round(pumpIntervalHint),
        _pumpLoopId,
        _lastPumpTime = 0,
        _startTime = 0,
        _deltaTillNextPump = 0,
        _subTaskIdCount = 0,
        _subTasks = [
            /*{
            		id: <int>,
            		pump: <function>,
            		desiredInterval: <int>,
            		lastPump: <int>,
            		nextExpectedInterval <int>
            	}*/
        ];

    me.isRunning = () => {
        return typeof _pumpLoopId === 'number';
    };

    me.getExpectedPumpTime = () => {
        return _lastPumpTime + _deltaTillNextPump;
    };

    me.unschedule = (id) => {
        var succeeded = false;

        var foundId = _subTasks.findIndex(function(element) {
            return element.id === id;
        });

        // Erase from the array
        if (foundId >= 0) {
            succeeded = true;
            _subTasks.splice(foundId, 1);
        }

        return succeeded;
    };

    me.schedule = (callback, interval) => {
        var id = -1;
        var desiredInterval = Math.round(interval);
        if (typeof callback === 'function' && typeof desiredInterval === 'number' && desiredInterval >= 0) {
            id = ++_subTaskIdCount;

            _subTasks.push({
                id: id,
                pump: callback,
                desiredInterval: desiredInterval,
                lastPump: 0,
                deltaTillNextPump: Date.now() + desiredInterval
            });

            // Sort by more frequent callbacks
            _subTasks.sort(function(a, b) {
                var sortValue = 0;
                if (a.desiredInterval < b.desiredInterval) {
                    sortValue = -1;
                } else if (b.desiredInterval < a.desiredInterval) {
                    sortValue = 1;
                }

                return sortValue;
            });
        }

        return id;
    };

    /* jshint ignore:start */
    var pump = function(deltaTime, currentTime /*, lastTime, deltaExpectedTillNextPump*/ ) {
        //console.log("dTime: " + deltaTime, "current: " + currentTime, "last: " + lastTime, "deltaTillNext: " + deltaExpectedTillNextPump);
        for (var index = 0; index < _subTasks.length; ++index) {
            var currentEntry = _subTasks[index];
            var expectedPumpTime = currentEntry.lastPump + currentEntry.deltaTillNextPump;

            if (currentTime >= expectedPumpTime) {
                var deltaFromExpectedInterval = currentTime - expectedPumpTime;

                // Calculate interval for remaining as close as possible to desired pump rate
                if (deltaFromExpectedInterval <= currentEntry.desiredInterval) {
                    currentEntry.deltaTillNextPump = currentEntry.desiredInterval - deltaFromExpectedInterval;
                } else {
                    currentEntry.deltaTillNextPump = currentEntry.desiredInterval - (deltaFromExpectedInterval % currentEntry.desiredInterval);
                }

                try {
                    currentEntry.pump((currentEntry.lastPump !== 0 ? deltaFromExpectedInterval : 0), currentTime, currentEntry.lastPump, currentEntry.deltaTillNextPump);
                } catch (err) {}

                currentEntry.lastPump = currentTime;
            } else {
                // Break out of loop if next pumps are later
                break;
            }
        }
    };
    /* jshint ignore:end */

    //var registered = false;
    var scheduleNextPump = ( /*intervalHint*/ ) => {
        return;
        /*_lastPumpTime = Date.now();

        if (!registered) {
            require('app').setAnimationHandler(() => {
                //_pumpLoopId = setTimeout(() => {
                var now = Date.now();
                var deltaTime = now - _lastPumpTime;
                var deltaFromExpectedInterval = now - me.getExpectedPumpTime();

                // Calculate interval for remaining as close as possible to desired pump rate
                if (deltaFromExpectedInterval < _desiredInterval) {
                    _deltaTillNextPump = _desiredInterval - deltaFromExpectedInterval;
                } else {
                    _deltaTillNextPump = _desiredInterval - (deltaFromExpectedInterval % _desiredInterval);
                }

                pump(deltaTime, now, _lastPumpTime, _deltaTillNextPump);

                scheduleNextPump(_deltaTillNextPump);
            }, intervalHint);
            registered = true;
        }*/
    };

    me.start = () => {
        var started = false;

        if (!me.isRunning()) {
            started = true;
            _startTime = Date.now();
            _deltaTillNextPump = _desiredInterval;
            scheduleNextPump(_desiredInterval);
        }

        return started;
    };

    me.stop = () => {
        var stopped = false;

        if (me.isRunning()) {
            stopped = true;
            clearTimeout(_pumpLoopId);
            _pumpLoopId = undefined;
        }

        return stopped;
    };

    return me;
};

module.exports.constructor = UpdateLoop;
module.exports.singleton = new UpdateLoop(1000.0 / 30.0);
