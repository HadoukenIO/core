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
let Buffer = require('buffer').Buffer;
let fs = require('fs');
let path = require('path');

let electronApp = require('electron').app;

let System = require('./api/system.js').System;

let clipBounds = require('./clip_bounds.js').default;
let coreState = require('./core_state.js');

const cachePath = electronApp.getPath('userCache');

var BoundsChangedStateCache = function(uuid, name, browserWindow) {
    let safeName = new Buffer(uuid + '-' + name).toString('hex') + '.json';
    this.uuid = uuid;
    this.browserWindow = browserWindow;
    this.cacheRetreived = false;
    this.saveWindowState = true;
    this.cacheDeleted = false;
    this.cacheFile = path.join(cachePath, safeName);
};

BoundsChangedStateCache.prototype.updateDiskCache = function updateDiskCache() {

    if (this.uuid && this.name) {
        console.log('SAVE? ', this.getSaveWindowState(), ' >>>> THIS IS THE APPS UUID AND NAME-- --', this.uuid + '-- - ', this.name);
    }
    if (this.cacheRetreived !== false) {
        this.saveBoundToDiskCache();
    } else {
        this.setBoundsFromDiskCache();
    }
};

BoundsChangedStateCache.prototype.saveBoundToDiskCache = function saveBoundToDiskCache(bounds) {

    // The name and UUID will be the same if this is an app and not a child window
    try {
        // We don't want to save the bounds from service:notifications as it is an invisible window.
        if (this.getSaveWindowState() === false) {
            this.deleteCache();
            return;
        }

        if (coreState.appByUuid(this.uuid).appObj._options.saveWindowState === false && this.name === this.uuid) {

            this.deleteCache();
            return;
        }
    } catch (err) {
        System.log('info', err);
    }
    let parentApp;

    try {
        parentApp = coreState.appByUuid(this.uuid);
        this.setSaveWindowState(parentApp._options.saveWindowState);

    } catch (err) {
        console.log(err);
    }

    let data = {
        'active': 'true',
        'fh': bounds.height,
        'fw': bounds.width,
        'fx': bounds.x,
        'fy': bounds.y,
        'name': this.name,
        'windowState': bounds.windowState,
        'x': 0,
        'y': 0
    };

    let dataString = JSON.stringify(data);
    fs.writeFile(this.cacheFile, dataString, (err) => {
        if (err) {
            electronApp.vlog(1, String(err));
        }
    });
};

BoundsChangedStateCache.prototype.readBoundsFromDiskSync = function readBoundsFromDiskSync() {
    if (this.uuid === 'service:notifications') {
        return {
            error: 'service-notifications'
        };
    }

    try {
        return JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
    } catch (err) {
        electronApp.vlog(1, String(err));
        return {
            error: 'no-file',
            message: String(err)
        };
    }
};

BoundsChangedStateCache.prototype.setBoundsFromDiskCache = function setBoundsFromDiskCache() {
    var _this = this;
    try {
        var bounds = this.readBoundsFromDiskSync();

        if (_this.browserWindow) {
            _this.browserWindow.setBounds(clipBounds({
                x: bounds.fx,
                y: bounds.fy,
                width: bounds.fw,
                height: bounds.fh
            }, _this.browserWindow));
        }
        _this.cacheRetreived = true;
    } catch (err) {
        console.log(err);
        _this.cacheRetreived = true;
    }
};

BoundsChangedStateCache.prototype.setSaveWindowState = function(value) {
    if (typeof value !== 'boolean') {
        return;
    }
    this.saveWindowState = value;
    if (value === false) {
        this.deleteCache();
    }
};

BoundsChangedStateCache.prototype.getSaveWindowState = function() {
    return this.saveWindowState;
};

BoundsChangedStateCache.prototype.deleteCache = function() {
    var _this = this;
    if (_this && _this.cacheDeleted !== true) {
        fs.unlink(this.cacheFile, function(err) {
            if (err) {
                console.log('file not deleted. ', err);
            }
            try {
                _this.cacheDeleted = true;
            } catch (err) {
                console.log('Error unlinking: ', err);
            }
        });
    }

    BoundsChangedStateCache.prototype.getIsCacheDeleted = function() {
        return this.cacheDeleted;
    };
};

module.exports = BoundsChangedStateCache;
