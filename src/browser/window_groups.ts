import { EventEmitter } from 'events';

import * as _ from 'underscore';
import { OpenFinWindow } from '../shapes';

let uuidSeed = 0;

class WindowGroups extends EventEmitter {
    constructor () {
        super();
    }
    private _windowGroups: {[groupName: string]: {[windowName: string]: OpenFinWindow; }} = {};
    public getGroup = (uuid: string)  => {
        return _.values(this._windowGroups[uuid]);
    };

    public getGroups = ()  => {
        return _.map(_.keys(this._windowGroups), (uuid) => {
            return this.getGroup(uuid);
        });
    };

    public joinGroup = (source: any, target: any)  => {
        const sourceGroupUuid = source.groupUuid;
        let targetGroupUuid = target.groupUuid;

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

        const payload = generatePayload('join', source, target, this.getGroup(sourceGroupUuid), this.getGroup(targetGroupUuid));
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

    public leaveGroup = (win: OpenFinWindow)  => {
        const groupUuid = win && win.groupUuid;

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

    public mergeGroups = (source: OpenFinWindow, target: OpenFinWindow)  => {
        let sourceGroupUuid = source.groupUuid;
        let targetGroupUuid = target.groupUuid;

        // cannot merge a group with yourself
        if (source === target) {
            return;
        }

        // cannot merge the same group you're already in
        if (sourceGroupUuid && targetGroupUuid && sourceGroupUuid === targetGroupUuid) {
            return;
        }

        const payload = generatePayload('merge', source, target, this.getGroup(sourceGroupUuid), this.getGroup(targetGroupUuid));
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

    public _addWindowToGroup = (uuid: string, win: OpenFinWindow)  => {
        const _uuid = uuid || generateUuid();
        this._windowGroups[_uuid] = this._windowGroups[_uuid] || {};
        this._windowGroups[_uuid][win.name] = win;
        return _uuid;
    };

    public _removeWindowFromGroup = (uuid: string, win: OpenFinWindow)  => {
        delete this._windowGroups[uuid][win.name];
    };

    public _handleDisbandingGroup = (groupUuid: string)  => {
        if (this.getGroup(groupUuid).length < 2) {
            const lastWindow = this.getGroup(groupUuid)[0];
            this._removeWindowFromGroup(groupUuid, lastWindow);
            this.emit('group-changed', {
                groupUuid,
                payload: generatePayload('disband', lastWindow, lastWindow, [], [])
            });
            lastWindow.groupUuid = null;
            delete this._windowGroups[groupUuid];
        }
    };
}


// Helpers

function generateUuid() {
    return 'group' + (uuidSeed++);
}

function generatePayload(reason: string, sourceWindow: any, targetWindow: any, sourceGroup: OpenFinWindow[], targetGroup: OpenFinWindow[]) {
    return {
        reason,
        sourceGroup: mapEventWindowGroups(sourceGroup),
        sourceWindowAppUuid: sourceWindow.app_uuid,
        sourceWindowName: sourceWindow.name,
        targetGroup: mapEventWindowGroups(targetGroup),
        targetWindowAppUuid: targetWindow.app_uuid,
        targetWindowName: targetWindow.name,
        topic: 'window',
        type: 'group-changed'
    };
}

function mapEventWindowGroups(group: OpenFinWindow[]) {
    return _.map(group, (win) => {
        return {
                appUuid: win.app_uuid,
                windowName: win.name
        };
    });
}
const windowGroups = new WindowGroups();
export default windowGroups;
