import { EventEmitter } from 'events';
import { BrowserWindow as BrowserWindowElectron } from 'electron';
import { createHash } from 'crypto';

import * as _ from 'underscore';
import { OpenFinWindow, Identity, BrowserWindow, ChildFrameInfo, PreloadScriptState } from '../shapes';
import * as coreState from './core_state';
import * as log from './log';
import * as windowGroupsProxy from './window_groups_runtime_proxy';

let uuidSeed = 0;

export class WindowGroups extends EventEmitter {
    constructor() {
        super();

        windowGroupsProxy.eventsPipe.on('process-change', async (changeState) => {
            if (changeState.action === 'remove') {
                await this.leaveGroup(changeState.window);
            }
            if (changeState.action === 'add') {
                //TODO: identity here is misleading, specially since the window is going to be different.
                // Refactor both events to include the proxyWindow on each case instead of the browser window.
                const runtimeProxyWindow  = await windowGroupsProxy.getRuntimeProxyWindow(changeState.identity);
                this._addWindowToGroup(changeState.window.groupUuid, runtimeProxyWindow.window);
                await windowGroupsProxy.registerRemoteProxyWindow(changeState.window, runtimeProxyWindow, false);
            }
        });
    }

    private _windowGroups: { [groupUuid: string]: { [windowName: string]: OpenFinWindow; } } = {};
    public getGroup = (groupUuid: string): OpenFinWindow[] => {
        return _.values(this._windowGroups[groupUuid]);
    };

    public getGroups = (): OpenFinWindow[][] => {
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

    //TODO: Remove this
    // tslint:disable-next-line
    public joinGroup = async (source: Identity, target: Identity): Promise<void> => {
        const sourceWindow: OpenFinWindow = <OpenFinWindow>coreState.getWindowByUuidName(source.uuid, source.name);
        let targetWindow: OpenFinWindow = <OpenFinWindow>coreState.getWindowByUuidName(target.uuid, target.name);

        let runtimeProxyWindow;
        const sourceGroupUuid = sourceWindow.groupUuid;
        //identify if either the target or the source belong to a different runtime:
        if (!targetWindow) {
            //this try should be replaced by a general try here.
            try {
                runtimeProxyWindow = await windowGroupsProxy.getRuntimeProxyWindow(target);
                targetWindow = runtimeProxyWindow.window;

            } catch (err) {
                log.writeToLog('info', err);
            }
        }
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
        sourceWindow.groupUuid = this._addWindowToGroup(targetGroupUuid, sourceWindow);
        if (!targetGroupUuid) {
            targetWindow.groupUuid = targetGroupUuid = this._addWindowToGroup(sourceWindow.groupUuid, targetWindow);
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

        // disband in the case where source leaves a group
        // with only one remaining window
        if (sourceGroupUuid) {
            this._handleDisbandingGroup(sourceGroupUuid);
        }

        //TODO: remove code duplication
        //we just added a proxy window, we need to take some additional actions.
        if (runtimeProxyWindow && !runtimeProxyWindow.isRegistered) {
            const windowGroup = await windowGroupsProxy.getWindowGroupProxyWindows(runtimeProxyWindow);
            await windowGroupsProxy.registerRemoteProxyWindow(source, runtimeProxyWindow, true);
            await Promise.all(windowGroup.map(async (pWin) => {
                this._addWindowToGroup(sourceWindow.groupUuid, pWin.window);
                await windowGroupsProxy.registerRemoteProxyWindow(source, pWin, false);
            }));
        }

    };

    public leaveGroup = async (win: OpenFinWindow): Promise<void> => {
        const groupUuid = win && win.groupUuid;

        // cannot leave a group if you don't belong to one
        if (!groupUuid) {
            return;
        }

        if (win.isProxy) {
            const runtimeProxyWindow = await windowGroupsProxy.getRuntimeProxyWindow(win);
            windowGroupsProxy.unregisterRemoteProxyWindow(runtimeProxyWindow);
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

    //TODO: Remove this
    // tslint:disable-next-line
    public mergeGroups = async (source: Identity, target: Identity): Promise<void> => {
        const sourceWindow: OpenFinWindow = <OpenFinWindow>coreState.getWindowByUuidName(source.uuid, source.name);
        let targetWindow: OpenFinWindow = <OpenFinWindow>coreState.getWindowByUuidName(target.uuid, target.name);
        let sourceGroupUuid = sourceWindow.groupUuid;
        let runtimeProxyWindow;
        //identify if either the target or the source belong to a different runtime:
        if (!targetWindow) {
            //this try should be replaced by a general try here.
            try {
                runtimeProxyWindow = await windowGroupsProxy.getRuntimeProxyWindow(target);
                targetWindow = runtimeProxyWindow.window;

            } catch (err) {
                log.writeToLog('info', err);
            }
        }
        let targetGroupUuid = targetWindow.groupUuid;

        // cannot merge a group with yourself
        if (source === target) {
            return;
        }

        // cannot merge the same group you're already in
        if (sourceGroupUuid && targetGroupUuid && sourceGroupUuid === targetGroupUuid) {
            return;
        }

        //none of the merge group events fired, we need to fire them now ish ? or make the change later ?
        // if (!sourceGroupUuid && !targetGroupUuid) {

        // }
        // create a group if target doesn't already belong to one
        if (!targetGroupUuid) {
            targetWindow.groupUuid = targetGroupUuid = this._addWindowToGroup(targetGroupUuid, targetWindow);
        }

        // create a temporary group if source doesn't already belong to one
        if (!sourceGroupUuid) {
            sourceGroupUuid = this._addWindowToGroup(sourceGroupUuid, sourceWindow);
        }

        // update each of the windows from source's group to point
        // to target's group
        _.each(this.getGroup(sourceGroupUuid), (win) => {
            win.groupUuid = targetGroupUuid;
        });

        // shallow copy the windows from source's group to target's group
        _.extend(this._windowGroups[targetGroupUuid], this._windowGroups[sourceGroupUuid]);
        delete this._windowGroups[sourceGroupUuid];

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
        //we just added a proxy window, we need to take some additional actions.
        if (runtimeProxyWindow && !runtimeProxyWindow.isRegistered) {
            const windowGroup = await windowGroupsProxy.getWindowGroupProxyWindows(runtimeProxyWindow);
            await windowGroupsProxy.registerRemoteProxyWindow(source, runtimeProxyWindow, true);
            await Promise.all(windowGroup.map(async (pWin) => {
                this._addWindowToGroup(sourceWindow.groupUuid, pWin.window);
                await windowGroupsProxy.registerRemoteProxyWindow(source, pWin, false);
            }));
        }
    };

    private _addWindowToGroup = (groupUuid: string, win: OpenFinWindow): string => {
        const _groupUuid = groupUuid || generateUuid();
        this._windowGroups[_groupUuid] = this._windowGroups[_groupUuid] || {};
        this._windowGroups[_groupUuid][win.name] = win;
        win.groupUuid = groupUuid;
        return _groupUuid;
    };

    private _removeWindowFromGroup = (groupUuid: string, win: OpenFinWindow): void => {
        delete this._windowGroups[groupUuid][win.name];
    };

    private _handleDisbandingGroup = (groupUuid: string): void => {
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

function generateUuid(): string {
    return `group${uuidSeed++}`;
}

export interface WindowIdentifier {
    appUuid: string;
    windowName: string;
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

function generatePayload(reason: string,
    sourceWindow: OpenFinWindow,
    targetWindow: OpenFinWindow,
    sourceGroup: OpenFinWindow[],
    targetGroup: OpenFinWindow[]
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

function mapEventWindowGroups(group: OpenFinWindow[]): WindowIdentifier[] {
    return _.map(group, (win) => {
        return {
            appUuid: win.app_uuid,
            windowName: win.name
        };
    });
}

export default new WindowGroups();
