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
let EventEmitter = require('events').EventEmitter;
let util = require('util');
let _ = require('underscore');
let electronScreen = require('electron').screen;

const isWin32 = process.platform === 'win32';

function MonitorInfo() {
    EventEmitter.call(this);

    this._callback = (reason) => {
        return () => {
            var monitorInfo = this.getInfo(reason);
            monitorInfo.topic = 'system';
            monitorInfo.type = 'monitor-info-changed';

            this.emit('monitor-info-changed', monitorInfo);
        };
    };

    electronScreen.on('display-added', this._callback('display'));
    electronScreen.on('display-removed', this._callback('display'));
    electronScreen.on('work-area-changed', (event, changedMetrics) => {
        changedMetrics.forEach((metric) => {
            if (metric === 'bounds') {
                this._callback('display')();
            } else if (metric === 'workArea') {
                this._callback('taskbar')();
            } else {
                this._callback('unknown')();
            }
        });
    });
}

util.inherits(MonitorInfo, EventEmitter);

MonitorInfo.prototype.getMousePosition = function() {
    var point = electronScreen.getCursorScreenPoint();
    return {
        top: point.y,
        left: point.x
    };
};

MonitorInfo.prototype.getInfo = function(reason) {
    /*** taskbar ***/
    var taskbar = electronScreen.getTaskbarLocation(),
        taskbarInfo = getTaskbarInfo(taskbar),
        taskbarEdge = getTaskbarEdge(taskbar, taskbarInfo);

    /*** monitors ***/
    var monitorDetails = electronScreen.getMonitorDPIScaling(),
        allMonitorsInfo = getAllMonitorsInfo(monitorDetails);

    var primaryMonitorId = electronScreen.getPrimaryDisplay().id,
        primaryMonitor,
        nonPrimaryMonitors;

    if (isWin32) {
        primaryMonitor = _.findWhere(allMonitorsInfo, {
            name: monitorDetails[primaryMonitorId].name
        });
        nonPrimaryMonitors = allMonitorsInfo.filter(function(monitor) {
            return monitor.name !== monitorDetails[primaryMonitorId].name;
        });
    } else {
        primaryMonitor = _.findWhere(allMonitorsInfo, {
            deviceId: primaryMonitorId
        });
        nonPrimaryMonitors = allMonitorsInfo.filter(function(monitor) {
            return monitor.deviceId !== primaryMonitorId;
        });
    }

    /*** virtual screen ***/
    var virtualScreenInfo = getVirtualScreenInfo(allMonitorsInfo);

    return {
        deviceScaleFactor: electronScreen.getDPIScale(),
        dpi: {
            x: electronScreen.getDPI().width,
            y: electronScreen.getDPI().height
        },
        nonPrimaryMonitors: nonPrimaryMonitors,
        primaryMonitor: primaryMonitor,
        reason: reason,
        taskbar: {
            dipRect: taskbarInfo.unscaled,
            edge: taskbarEdge,
            rect: taskbarInfo.unscaled,
            scaledRect: taskbarInfo.scaled
        },
        virtualScreen: {
            top: virtualScreenInfo.unscaled.top,
            bottom: virtualScreenInfo.unscaled.bottom,
            left: virtualScreenInfo.unscaled.left,
            right: virtualScreenInfo.unscaled.right,
            dipRect: virtualScreenInfo.unscaled,
            scaledRect: virtualScreenInfo.scaled
        }
    };
};

MonitorInfo.prototype.getNearestDisplayRoot = function(point) {
    let screen = electronScreen.getDisplayNearestPoint(point);
    return {
        x: screen.workArea.x,
        y: screen.workArea.y
    };
};

/*** Helpers ***/

function getTaskbarInfo(taskbar) {
    var scaled = {
            top: taskbar.y,
            bottom: taskbar.y + taskbar.height,
            left: taskbar.x,
            right: taskbar.x + taskbar.width
        },
        unscaledRect = electronScreen.screenToDIPRect(taskbar),
        unscaled = {
            top: unscaledRect.y,
            bottom: unscaledRect.y + unscaledRect.height,
            left: unscaledRect.x,
            right: unscaledRect.x + unscaledRect.width
        };

    return {
        scaled,
        unscaled
    };
}

function getTaskbarEdge(taskbar, taskbarInfo) {
    if (taskbar.width > taskbar.height) {
        return taskbarInfo.unscaled.top === 0 ? 'top' : 'bottom';
    } else {
        return taskbarInfo.unscaled.left === 0 ? 'left' : 'right';
    }
}

function getAllMonitorsInfo(monitorDetails) {
    return electronScreen.getAllDisplays().filter((monitor) => {
        return isWin32 ? monitorDetails[monitor.id] : true;
    }).map((monitor) => {
        // Workarea and Monitor bounds are incorrect for Windows in chromium, which is why
        // we're getting the bounds info from a different source
        var monitorBoundsInfo = isWin32 ? monitorDetails[monitor.id] : monitor;
        var available = {
                top: monitorBoundsInfo.workArea.y,
                bottom: monitorBoundsInfo.workArea.y + monitorBoundsInfo.workArea.height,
                left: monitorBoundsInfo.workArea.x,
                right: monitorBoundsInfo.workArea.x + monitorBoundsInfo.workArea.width
            },
            availableScaledRect = electronScreen.dipToScreenRect(monitorBoundsInfo.workArea),
            total = {
                top: monitorBoundsInfo.bounds.y,
                bottom: monitorBoundsInfo.bounds.y + monitorBoundsInfo.bounds.height,
                left: monitorBoundsInfo.bounds.x,
                right: monitorBoundsInfo.bounds.x + monitorBoundsInfo.bounds.width
            },
            totalScaledRect = electronScreen.dipToScreenRect(monitorBoundsInfo.bounds);

        return {
            available: {
                dipRect: _.clone(available),
                scaledRect: {
                    top: availableScaledRect.y,
                    bottom: availableScaledRect.y + availableScaledRect.height,
                    left: availableScaledRect.x,
                    right: availableScaledRect.x + availableScaledRect.width
                }
            },
            availableRect: _.clone(available),
            deviceId: monitorBoundsInfo.id,
            deviceScaleFactor: monitorBoundsInfo.dpiScale,
            displayDeviceActive: monitorBoundsInfo.active,
            dpi: {
                x: monitorBoundsInfo.dpi && monitorBoundsInfo.dpi.width,
                y: monitorBoundsInfo.dpi && monitorBoundsInfo.dpi.height
            },
            monitor: {
                dipRect: total,
                scaledRect: {
                    top: totalScaledRect.y,
                    bottom: totalScaledRect.y + totalScaledRect.height,
                    left: totalScaledRect.x,
                    right: totalScaledRect.x + totalScaledRect.width
                }
            },
            monitorRect: total,
            name: monitorBoundsInfo.name
        };
    });
}

function getVirtualScreenInfo(allMonitorsInfo) {
    let uTop = _.min(allMonitorsInfo, monitor => monitor && monitor.monitorRect && monitor.monitorRect.top);
    let uBottom = _.max(allMonitorsInfo, monitor => monitor && monitor.monitorRect && monitor.monitorRect.bottom);
    let uLeft = _.min(allMonitorsInfo, monitor => monitor && monitor.monitorRect && monitor.monitorRect.left);
    let uRight = _.max(allMonitorsInfo, monitor => monitor && monitor.monitorRect && monitor.monitorRect.right);
    let unscaled = {
        top: uTop && uTop.monitorRect ? uTop.monitorRect.top : 0,
        bottom: uBottom && uBottom.monitorRect ? uBottom.monitorRect.bottom : 0,
        left: uLeft && uLeft.monitorRect ? uLeft.monitorRect.left : 0,
        right: uRight && uRight.monitorRect ? uRight.monitorRect.right : 0
    };
    let unscaledRect = {
        x: unscaled.left,
        y: unscaled.top,
        width: unscaled.right - unscaled.left,
        height: unscaled.bottom - unscaled.top
    };
    let scaledRect = electronScreen.dipToScreenRect(unscaledRect);
    let scaled = {
        top: scaledRect.y,
        bottom: scaledRect.y + scaledRect.height,
        left: scaledRect.x,
        right: scaledRect.x + scaledRect.width
    };

    return {
        scaled,
        unscaled
    };
}

module.exports = new MonitorInfo();
