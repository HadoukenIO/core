/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/
let ofEvents = require('./of_events.js');
let electronApp = require('electron').app;

let MonitorInfo;
electronApp.on('ready', () => {
    MonitorInfo = require('./monitor_info.js');
});

class ExternalWindowEventAdapter {
    constructor(browserWindow) {
        let options = browserWindow && browserWindow._options;
        let uuid = options.uuid;
        let name = options.name;
        let uuidname = `${uuid}-${name}`;

        let disabledFrameState = {
            leftButtonDown: false,
            cursorStart: null,
            cursorPrev: null,
            boundsStart: null
        };

        let cachedState = null;

        ofEvents.on(`external-window/focus/${uuidname}`, () => {
            browserWindow.emit('focus');
        });

        ofEvents.on(`external-window/blur/${uuidname}`, () => {
            browserWindow.emit('blur');
        });

        ofEvents.on(`external-window/state-change/${uuidname}`, () => {
            let prevState = cachedState || 'normal';

            let currState = 'normal';
            if (browserWindow.isMinimized()) {
                currState = 'minimized';
            } else if (browserWindow.isMaximized()) {
                currState = 'maximized';
            }

            if (prevState !== currState) {
                if (currState === 'minimized') {
                    browserWindow.emit('minimize');
                } else if (currState === 'maximized') {
                    browserWindow.emit('maximize');
                } else {
                    browserWindow.emit('restore');
                }

                cachedState = currState;
            }
        });

        ofEvents.on(`external-window/bounds-changed/${uuidname}`, () => {
            browserWindow.emit('bounds-changed');
        });

        ofEvents.on(`external-window/visibility-changed/${uuidname}`, (visibility) => {
            browserWindow.emit('visibility-changed', {}, visibility);
        });

        ofEvents.on(`external-window/begin-user-bounds-change/${uuidname}`, (coordinates) => {
            if (!disabledFrameState.leftButtonDown && !browserWindow.isUserMovementEnabled()) {
                // left mouse button is now in the down position
                disabledFrameState.leftButtonDown = true;
                // get current cursor position
                disabledFrameState.cursorStart = {
                    x: coordinates.x, // todo: may need to convert screen to dpi
                    y: coordinates.y
                };
                // save the disabled frame's previous cursor position
                disabledFrameState.cursorPrev = disabledFrameState.cursorStart;
                // save the disabled frame's initial bounds
                disabledFrameState.boundsStart = browserWindow.getBounds();
            }
            browserWindow.emit('begin-user-bounds-change');
        });

        ofEvents.on(`external-window/end-user-bounds-change/${uuidname}`, () => {
            if (disabledFrameState.leftButtonDown) {
                if (disabledFrameState.changeType !== -1) {
                    browserWindow.emit('disabled-frame-bounds-changed', {}, browserWindow.getBounds(), disabledFrameState.changeType);
                }

                // reset
                disabledFrameState.leftButtonDown = false;
                disabledFrameState.changeType = -1;
            }
            browserWindow.emit('end-user-bounds-change');
        });

        ofEvents.on(`external-window/sizing/${uuidname}`, (bounds) => {
            if (disabledFrameState.leftButtonDown) {
                // check if the position has also changed by checking whether the origins match up
                if (disabledFrameState.changeType !== 2) {
                    let xDelta = bounds.x !== disabledFrameState.boundsStart.x;
                    let yDelta = bounds.y !== disabledFrameState.boundsStart.y;
                    disabledFrameState.changeType = xDelta || yDelta ? 2 : 1;
                }

                browserWindow.emit('disabled-frame-bounds-changing', {}, bounds, disabledFrameState.changeType);
            }
        });

        ofEvents.on(`external-window/moving/${uuidname}`, () => {
            if (disabledFrameState.leftButtonDown) {
                let bounds = browserWindow.getBounds();
                let mousePosition = MonitorInfo.getMousePosition();
                let cursorCurr = {
                    x: mousePosition.left,
                    y: mousePosition.top
                };

                disabledFrameState.changeType = 0;

                // get the cursor delta
                let xCursorDelta = cursorCurr.x - disabledFrameState.cursorPrev.x;
                let yCursorDelta = cursorCurr.y - disabledFrameState.cursorPrev.y;

                if (xCursorDelta !== 0 || yCursorDelta !== 0) {
                    bounds.x = (cursorCurr.x - disabledFrameState.cursorStart.x) + disabledFrameState.boundsStart.x;
                    bounds.y = (cursorCurr.y - disabledFrameState.cursorStart.y) + disabledFrameState.boundsStart.y;

                    browserWindow.emit('disabled-frame-bounds-changing', {}, bounds, disabledFrameState.changeType);

                    disabledFrameState.cursorPrev = cursorCurr;
                }
            } else {
                browserWindow.emit('bounds-changed');
            }
        });

        ofEvents.on(`external-window/close/${uuidname}`, () => {
            browserWindow.emit('close');
            browserWindow.emit('closed');
        });
    }
}

module.exports = ExternalWindowEventAdapter;
