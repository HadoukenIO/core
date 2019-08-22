import { EventEmitter } from 'events';
import { createHash } from 'crypto';

import * as _ from 'underscore';
import { ExternalWindow, OpenFinWindow, Identity, GroupWindow } from '../shapes';
import * as coreState from './core_state';
import * as windowGroupsProxy from './window_groups_runtime_proxy';
import * as groupTracker from './disabled_frame_group_tracker';
import { argo } from './core_state';
import { getRegisteredExternalWindow } from './api/external_window';

let uuidSeed = 0;

export class WindowGroups extends EventEmitter {
    constructor() {
        super();

        windowGroupsProxy.groupProxyEvents.on('process-change', async (changeState) => {
            if (changeState.action === 'remove') {
                await this.leaveGroup(changeState.window);
            }
            if (changeState.action === 'add') {
                const runtimeProxyWindow  = await windowGroupsProxy.getRuntimeProxyWindow(changeState.targetIdentity);
                this._addWindowToGroup(changeState.window.groupUuid, runtimeProxyWindow.window);

                const sourceWindow: OpenFinWindow = <OpenFinWindow>coreState.getWindowByUuidName(changeState.sourceIdentity.uuid,
                    changeState.sourceIdentity.name);

                await runtimeProxyWindow.registerSingle(changeState.sourceIdentity);
                const sourceGroupUuid = sourceWindow.groupUuid;
                const payload = generatePayload('join', sourceWindow, runtimeProxyWindow.window,
                    changeState.sourceGroup, this.getGroup(sourceGroupUuid));
                if (sourceGroupUuid) {
                    this.emit('group-changed', {
                        groupUuid: sourceGroupUuid,
                        payload
                    });
                }
            }
        });
    }

    private _windowGroups: { [groupUuid: string]: { [windowName: string]: GroupWindow; } } = {};

    public getGroup = (groupUuid: string): GroupWindow[] => {
        return _.values(this._windowGroups[groupUuid]);
    };

    public getGroups = (): GroupWindow[][] => {
        return _.map(_.keys(this._windowGroups), (groupUuid) => {
            return this.getGroup(groupUuid);
        });
    };

    public hasProxyWindows = (groupUuid: string): boolean => {
        let hasProxyWindows = false;
        this.getGroup(groupUuid).forEach(win => {
            if (win.isProxy) {
                hasProxyWindows = true;
            }
        });

        return hasProxyWindows;
    };

    public getGroupHashName = (groupUuid: string): string => {

        const winGroup = this.getGroup(groupUuid);
        const hash = createHash('sha256');
        winGroup.map(x => x.browserWindow.nativeId)
            .sort()
            .forEach(i => hash.update(i));

        return hash.digest('hex');
    }

    //cannot rely on nativeId as windows might leave a group after they are closed.
    private getWindowGroupId = (identity: Identity): string => {
        const { uuid, name } = identity;
        return [uuid, name]
            .map((value: string) =>  Buffer.from(value).toString('base64'))
            .join('/');
    }

    public joinGroup = async (source: Identity, target: Identity): Promise<void> => {
        const [sourceWindow] = await findWindow(source);
        const [targetWindow, targetProxyWindow] = await findWindow(target);
        const sourceGroupUuid = sourceWindow.groupUuid;
        let targetGroupUuid = targetWindow.groupUuid;

        // cannot join a group with yourself
        if (sourceWindow.uuid === targetWindow.uuid && sourceWindow.name === targetWindow.name) {
            return;
        }

        // cannot join the same group you're already in
        if (sourceGroupUuid && targetGroupUuid && sourceGroupUuid === targetGroupUuid) {
            return;
        }

        // remove source from any group it belongs to
        if (sourceGroupUuid) {
            await this.leaveGroup(sourceWindow);
        }

        // _addWindowToGroup returns the group's uuid that source was added to. in
        // the case where target doesn't belong to a group either, it generates
        // a brand new group and returns its uuid
        sourceWindow.groupUuid = await this._addWindowToGroup(targetGroupUuid, sourceWindow);
        if (!targetGroupUuid) {
            targetWindow.groupUuid = targetGroupUuid = await this._addWindowToGroup(sourceWindow.groupUuid, targetWindow);
        }

        //we just added a proxy window, we need to take some additional actions.
        if (targetProxyWindow) {
            const windowGroup = await targetProxyWindow.register(source);
            windowGroup.forEach(pWin => this._addWindowToGroup(sourceWindow.groupUuid, pWin.window));
        }

        const payload = generatePayload('join', sourceWindow, targetWindow, this.getGroup(sourceGroupUuid), this.getGroup(targetGroupUuid));
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

    };

    public leaveGroup = async (win: GroupWindow): Promise<void> => {
        const groupUuid = win && win.groupUuid;

        // cannot leave a group if you don't belong to one
        if (!groupUuid) {
            return;
        }

        await this._removeWindowFromGroup(groupUuid, win);

        if (groupUuid) {
            this.emit('group-changed', {
                groupUuid,
                payload: generatePayload('leave', win, win, this.getGroup(groupUuid), [])
            });
        }
        // updating the window's groupUuid after since it still needs to receive the event
        win.groupUuid = null;

        if (groupUuid) {
            await this._handleDisbandingGroup(groupUuid);
        }
    };

    public mergeGroups = async (source: Identity, target: Identity): Promise<void> => {
        const [sourceWindow] = await findWindow(source);
        const [targetWindow, targetProxyWindow] = await findWindow(target);
        let sourceGroupUuid = sourceWindow.groupUuid;
        let targetGroupUuid = targetWindow.groupUuid;

        // cannot merge a group with yourself
        if (source === target) {
            return;
        }

        // cannot merge the same group you're already in
        if (sourceGroupUuid && targetGroupUuid && sourceGroupUuid === targetGroupUuid) {
            return;
        }

        // create a group if target doesn't already belong to one
        if (!targetGroupUuid) {
            targetWindow.groupUuid = targetGroupUuid = await this._addWindowToGroup(targetGroupUuid, targetWindow);
        }

        // create a temporary group if source doesn't already belong to one
        if (!sourceGroupUuid) {
            sourceGroupUuid = await this._addWindowToGroup(sourceGroupUuid, sourceWindow);
        }

        // update each of the windows from source's group to point
        // to target's group
        _.each(this.getGroup(sourceGroupUuid), (win) => {
            win.groupUuid = targetGroupUuid;
        });

        // shallow copy the windows from source's group to target's group
        _.extend(this._windowGroups[targetGroupUuid], this._windowGroups[sourceGroupUuid]);
        delete this._windowGroups[sourceGroupUuid];

        //we just added a proxy window, we need to take some additional actions.
        if (targetProxyWindow) {
            const windowGroup = await targetProxyWindow.register(source);
            windowGroup.forEach(pWin => this._addWindowToGroup(sourceWindow.groupUuid, pWin.window));
        }

        const payload = generatePayload('merge', sourceWindow, targetWindow,
        this.getGroup(sourceGroupUuid), this.getGroup(targetGroupUuid));
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
    };

    private _addWindowToGroup = async (groupUuid: string, win: GroupWindow): Promise<string> => {
        const windowGroupId = this.getWindowGroupId(win);
        const _groupUuid = groupUuid || generateUuid();
        this._windowGroups[_groupUuid] = this._windowGroups[_groupUuid] || {};
        const group = this.getGroup(_groupUuid);
        this._windowGroups[_groupUuid][windowGroupId] = win;
        win.groupUuid = _groupUuid;
        if (!argo['use-legacy-window-groups']) {
            groupTracker.addWindowToGroup(win);
        }
        if (!win.isProxy) {
            await Promise.all(group.map(async w => {
                if (w.isProxy) {
                    const runtimeProxyWindow = await windowGroupsProxy.getRuntimeProxyWindow(w);
                    await runtimeProxyWindow.registerSingle(win);
                }
            }));
        }
        return _groupUuid;
    };

    private _removeWindowFromGroup = async (groupUuid: string, win: GroupWindow): Promise<void> => {
        const windowGroupId = this.getWindowGroupId(win);
        if (!argo['use-legacy-window-groups']) {
            groupTracker.removeWindowFromGroup(win);
        }
        delete this._windowGroups[groupUuid][windowGroupId];

        //update proxy windows to no longer be bound to this specific window.
        const group = this.getGroup(groupUuid);
        await Promise.all(group.map(async w => {
            if (w.isProxy) {
                const runtimeProxyWindow = await windowGroupsProxy.getRuntimeProxyWindow(w);
                await runtimeProxyWindow.deregister(win);
            }
        }));
        if (win.isProxy) {
            const runtimeProxyWindow = await windowGroupsProxy.getRuntimeProxyWindow(win);
            if (runtimeProxyWindow) {
                await runtimeProxyWindow.destroy();
            }
        }
    };

    private _handleDisbandingGroup = async (groupUuid: string): Promise<void> => {
        const windowGroup = this.getGroup(groupUuid);
        const windowGroupProxies = windowGroup.filter(w => w.isProxy);
        if (windowGroup.length < 2 || windowGroup.length === windowGroupProxies.length) {
            await Promise.all(windowGroup.map(async (win) => {
                await this._removeWindowFromGroup(groupUuid, win);
                if (!win.isProxy) {
                    this.emit('group-changed', {
                        groupUuid,
                        payload: generatePayload('disband', win, win, [], [])
                    });
                }
                win.groupUuid = null;
            }));
            delete this._windowGroups[groupUuid];
        }
    };
}

// Helpers

function generateUuid(): string {
    return `group${uuidSeed++}`;
}

export interface WindowIdentifier {
    appUuid: string;
    windowName: string;
}

export interface GroupChangedEvent {
    groupUuid: string;
    payload: GroupChangedPayload;
}

export interface GroupChangedPayload {
    reason: string;
    sourceGroup: WindowIdentifier[];
    sourceWindowAppUuid: string;
    sourceWindowName: string;
    targetGroup: WindowIdentifier[];
    targetWindowAppUuid: string;
    targetWindowName: string;
    topic: 'window';
    type: 'group-changed';
}

export interface GroupEvent extends GroupChangedPayload, Identity {
    memberOf: string;
}

function generatePayload(reason: string,
    sourceWindow: GroupWindow,
    targetWindow: GroupWindow,
    sourceGroup: GroupWindow[],
    targetGroup: GroupWindow[]
): GroupChangedPayload {
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

function mapEventWindowGroups(group: GroupWindow[]): WindowIdentifier[] {
    return _.map(group, (win) => {
        return {
            appUuid: win.app_uuid,
            windowName: win.name
        };
    });
}

/*
    Attempt to find a window in:
    1. Current runtime (core state)
    2. Another runtime (multi-runtim)
    3. Current runtime (map of registered external windows)
*/
async function findWindow(window: Identity): Promise<[GroupWindow, windowGroupsProxy.RuntimeProxyWindow | undefined]> {
    let foundWindow;
    let proxyWindow;

    // Current runtime, OpenFin window
    foundWindow = <OpenFinWindow>coreState.getWindowByUuidName(window.uuid, window.name);

    if (!foundWindow) {
        try {
            // Multi-runtime, proxy window, OpenFin window
            proxyWindow = <windowGroupsProxy.RuntimeProxyWindow>await windowGroupsProxy.getRuntimeProxyWindow(window);
            foundWindow = <OpenFinWindow>proxyWindow.window;
        } catch (error) {
            // Current runtime, external window
            foundWindow = <ExternalWindow>getRegisteredExternalWindow(window);
        }
    }

    return [foundWindow, proxyWindow];
}

export default new WindowGroups();
