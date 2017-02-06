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
var _ = require('underscore'),
    EventEmitter = require('events').EventEmitter,
    util = require('util');

var uuidSeed = 0;

function WindowGroups() {
    EventEmitter.call(this);

    this._windowGroups = {};
}

util.inherits(WindowGroups, EventEmitter);

WindowGroups.prototype.getGroup = function(uuid) {
    return _.values(this._windowGroups[uuid]);
};

WindowGroups.prototype.getGroups = function() {
    return _.map(_.keys(this._windowGroups), (uuid) => {
        return this.getGroup(uuid);
    });
};

WindowGroups.prototype.joinGroup = function(source, target) {
    var sourceGroupUuid = source.groupUuid;
    var targetGroupUuid = target.groupUuid;

    // cannot join a group with yourself
    if (source === target) {
        return;
    }

    // cannot join the same group you're already in
    if (sourceGroupUuid && targetGroupUuid && sourceGroupUuid === targetGroupUuid) {
        return;
    }

    // remove source from any group it belongs to
    if (sourceGroupUuid) {
        this._removeWindowFromGroup(sourceGroupUuid, source);
    }

    // _addWindowToGroup returns the group's uuid that source was added to. in
    // the case where target doesn't belong to a group either, it generates
    // a brand new group and returns its uuid
    source.groupUuid = this._addWindowToGroup(targetGroupUuid, source);
    if (!targetGroupUuid) {
        target.groupUuid = targetGroupUuid = this._addWindowToGroup(source.groupUuid, target);
    }

    var payload = generatePayload('join', source, target, this.getGroup(sourceGroupUuid), this.getGroup(targetGroupUuid));
    if (sourceGroupUuid) {
        this.emit('group-changed', {
            groupUuid: sourceGroupUuid,
            payload
        });
    }
    if (targetGroupUuid) {
        this.emit('group-changed', {
            groupUuid: targetGroupUuid,
            payload
        });
    }

    // disband in the case where source leaves a group 
    // with only one remaining window
    if (sourceGroupUuid) {
        this._handleDisbandingGroup(sourceGroupUuid);
    }
};

WindowGroups.prototype.leaveGroup = function(win) {
    var groupUuid = win && win.groupUuid;

    // cannot leave a group if you don't belong to one
    if (!groupUuid) {
        return;
    }

    this._removeWindowFromGroup(groupUuid, win);
    if (groupUuid) {
        this.emit('group-changed', {
            groupUuid,
            payload: generatePayload('leave', win, win, this.getGroup(groupUuid), [])
        });
    }
    // updating the window's groupUuid after since it still needs to receive the event
    win.groupUuid = null;

    if (groupUuid) {
        this._handleDisbandingGroup(groupUuid);
    }
};

WindowGroups.prototype.mergeGroups = function(source, target) {
    var sourceGroupUuid = source.groupUuid;
    var targetGroupUuid = target.groupUuid;

    // cannot merge a group with yourself
    if (source === target) {
        return;
    }

    // cannot merge the same group you're already in
    if (sourceGroupUuid && targetGroupUuid && sourceGroupUuid === targetGroupUuid) {
        return;
    }

    var payload = generatePayload('merge', source, target, this.getGroup(sourceGroupUuid), this.getGroup(targetGroupUuid));
    if (sourceGroupUuid) {
        this.emit('group-changed', {
            groupUuid: sourceGroupUuid,
            payload
        });
    }
    if (targetGroupUuid) {
        this.emit('group-changed', {
            groupUuid: targetGroupUuid,
            payload
        });
    }

    // create a group if target doesn't already belong to one
    if (!targetGroupUuid) {
        target.groupUuid = targetGroupUuid = this._addWindowToGroup(targetGroupUuid, target);
    }

    // create a temporary group if source doesn't already belong to one
    if (!sourceGroupUuid) {
        sourceGroupUuid = this._addWindowToGroup(sourceGroupUuid, source);
    }

    // update each of the windows from source's group to point
    // to target's group
    _.each(this.getGroup(sourceGroupUuid), (win) => {
        win.groupUuid = targetGroupUuid;
    });

    // shallow copy the windows from source's group to target's group
    _.extend(this._windowGroups[targetGroupUuid], this._windowGroups[sourceGroupUuid]);
    delete this._windowGroups[sourceGroupUuid];
};

WindowGroups.prototype._addWindowToGroup = function(uuid, win) {
    var _uuid = uuid || generateUuid();
    this._windowGroups[_uuid] = this._windowGroups[_uuid] || {};
    this._windowGroups[_uuid][win.name] = win;
    return _uuid;
};

WindowGroups.prototype._removeWindowFromGroup = function(uuid, win) {
    delete this._windowGroups[uuid][win.name];
};

WindowGroups.prototype._handleDisbandingGroup = function(groupUuid) {
    if (this.getGroup(groupUuid).length < 2) {
        var lastWindow = this.getGroup(groupUuid)[0];
        this._removeWindowFromGroup(groupUuid, lastWindow);
        this.emit('group-changed', {
            groupUuid,
            payload: generatePayload('disband', lastWindow, lastWindow, [], [])
        });
        lastWindow.groupUuid = null;
        delete this._windowGroups[groupUuid];
    }
};

/*** Helpers ***/

function generateUuid() {
    return 'group' + (uuidSeed++);
}

function generatePayload(reason, sourceWindow, targetWindow, sourceGroup, targetGroup) {
    return {
        reason,
        sourceGroup: mapEventWindowGroups(sourceGroup),
        /* jshint ignore:start */
        sourceWindowAppUuid: sourceWindow.app_uuid,
        /* jshint ignore:end */
        sourceWindowName: sourceWindow.name,
        targetGroup: mapEventWindowGroups(targetGroup),
        /* jshint ignore:start */
        targetWindowAppUuid: targetWindow.app_uuid,
        /* jshint ignore:end */
        targetWindowName: targetWindow.name,
        topic: 'window',
        type: 'group-changed'
    };
}

function mapEventWindowGroups(group) {
    return _.map(group, (win) => {
        return {
            /* jshint ignore:start */
            appUuid: win.app_uuid,
            /* jshint ignore:end */
            windowName: win.name
        };
    });
}

module.exports = new WindowGroups();
