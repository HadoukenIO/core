/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/
let ofEvents = require('./of_events.js').default;
let electronApp = require('electron').app;

let MonitorInfo;
electronApp.on('ready', () => {
    MonitorInfo = require('./monitor_info.js');
});
import route from '../common/route';

class ExternalWindowEventAdapter {
    constructor(browserWindow) {
        let options = browserWindow && browserWindow._options;
        let uuid = options.uuid;
        let name = options.name;

        let disabledFrameState = {
            leftButtonDown: false,
            cursorStart: null,
            cursorPrev: null,
            boundsStart: null
        };

        let cachedState = null;

        ofEvents.on(route.externalWindow('focus', uuid, name), () => {
            browserWindow.emit('focus');
        });

        ofEvents.on(route.externalWindow('blur', uuid, name), () => {
            browserWindow.emit('blur');
        });

        ofEvents.on(route.externalWindow('state-change', uuid, name), () => {
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

        ofEvents.on(route.externalWindow('bounds-changed', uuid, name), () => {
            browserWindow.emit('bounds-changed');
        });

        ofEvents.on(route.externalWindow('visibility-changed', uuid, name), (visibility) => {
            browserWindow.emit('visibility-changed', {}, visibility);
        });

        ofEvents.on(route.externalWindow('begin-user-bounds-change', uuid, name), (coordinates) => {
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

        ofEvents.on(route.externalWindow('end-user-bounds-change', uuid, name), () => {
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

        ofEvents.on(route.externalWindow('sizing', uuid, name), (bounds) => {
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

        ofEvents.on(route.externalWindow('moving', uuid, name), () => {
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

        ofEvents.on(route.externalWindow('close', uuid, name), () => {
            browserWindow.emit('close');
            browserWindow.close();
            browserWindow.emit('closed');
        });
    }
}

module.exports = ExternalWindowEventAdapter;
