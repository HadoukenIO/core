import { Acker, Identity, EventPayload, Listener, Func } from '../../../shapes';
import { addEventListener as addNoteListener } from '../../api/notifications/subscriptions';
import { addRemoteSubscription, subscribeToAllRuntimes, RemoteSubscriptionProps } from '../../remote_subscriptions';
import { Application } from '../../api/application';
import { Channel } from '../../api/channel';
import { ExternalApplication } from '../../api/external_application';
import { Frame } from '../../api/frame';
import { getWindowByUuidName, isLocalUuid } from '../../core_state';
import { GlobalHotkey } from '../../api/global_hotkey';
import { Identity as NoteIdentity } from '../../api/notifications/shapes';
import { noop } from '../../../common/main';
import { System } from '../../api/system';
import { Window } from '../../api/window';
import * as _ from 'underscore';
import * as apiProtocolBase from './api_protocol_base';
import ofEvents from '../../of_events';
import * as ExternalWindow from '../../api/external_window';

type Subscribe = (
    identity: Identity | NoteIdentity,
    eventName: string,
    payload: EventPayload,
    listener: Listener
) => Promise<Func>;

interface SubscriptionMap {
    [eventType: string]: Subscribe;
}

const successAck = {
    success: true
};

const eventMap = {
    'subscribe-to-desktop-event': subToDesktopEvent,
    'unsubscribe-to-desktop-event': unSubToDesktopEvent
};

export function init() {
    apiProtocolBase.registerActionMap(eventMap);
}

/*
    Subscribe to a window event
*/
const subWindow = async (identity: Identity, eventName: string, payload: EventPayload, listener: Listener): Promise<Func> => {
    const { uuid, name } = payload;
    const windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);
    const targetUuid = windowIdentity.uuid;
    const islocalWindow = !!getWindowByUuidName(targetUuid, targetUuid);
    const localUnsub = Window.addEventListener(identity, windowIdentity, eventName, listener);
    const isExternalClient = ExternalApplication.isRuntimeClient(identity.uuid);
    let remoteUnSub = noop;

    if (!islocalWindow && !isExternalClient) {
        const subscription: RemoteSubscriptionProps = {
            className: 'window',
            eventName,
            listenType: 'on',
            name,
            uuid
        };

        remoteUnSub = await addRemoteSubscription(subscription);
    }

    return () => {
        localUnsub();
        remoteUnSub();
    };
};

/*
    Subscribe to a frame event
*/
const subFrame = async (identity: Identity, eventName: string, payload: EventPayload, listener: Listener): Promise<Func> => {
    const { uuid, name } = payload;
    const frameIdentity = apiProtocolBase.getTargetWindowIdentity(payload);
    const targetUuid = frameIdentity.uuid;
    const islocalWindow = !!getWindowByUuidName(targetUuid, targetUuid);
    const localUnsub = Frame.addEventListener(frameIdentity, eventName, listener);
    const isExternalClient = ExternalApplication.isRuntimeClient(identity.uuid);
    let remoteUnSub = noop;

    if (!islocalWindow && !isExternalClient) {
        const subscription: RemoteSubscriptionProps = {
            className: 'frame',
            eventName,
            listenType: 'on',
            name,
            uuid
        };

        remoteUnSub = await addRemoteSubscription(subscription);
    }

    return () => {
        localUnsub();
        remoteUnSub();
    };
};

/*
    Subscribe to an application event
*/
const subApplication = async (identity: Identity, eventName: string, payload: EventPayload, listener: Listener): Promise<Func> => {
    const { uuid } = payload;
    const appIdentity = apiProtocolBase.getTargetApplicationIdentity(payload);
    const targetUuid = appIdentity.uuid;
    const islocalApp = !!getWindowByUuidName(targetUuid, targetUuid);
    const localUnsub = Application.addEventListener(appIdentity, eventName, listener);
    const isExternalClient = ExternalApplication.isRuntimeClient(identity.uuid);
    let remoteUnSub = noop;

    if (!islocalApp && !isExternalClient) {
        const subscription: RemoteSubscriptionProps = {
            className: 'application',
            eventName,
            listenType: 'on',
            uuid
        };

        remoteUnSub = await addRemoteSubscription(subscription);
    }

    return () => {
        localUnsub();
        remoteUnSub();
    };
};

/*
    Subscribe to a channel event
*/
const subChannel = async (identity: Identity, eventName: string, payload: EventPayload, listener: Listener): Promise<Func> => {
    const targetIdentity = apiProtocolBase.getTargetWindowIdentity(payload);
    const { uuid } = targetIdentity;
    const islocalUuid = isLocalUuid(uuid);
    const localUnsub = Channel.addEventListener(targetIdentity, eventName, listener);
    const isExternalClient = ExternalApplication.isRuntimeClient(identity.uuid);
    let remoteUnSub = noop;

    if (!islocalUuid && !isExternalClient && (eventName === 'connected' || eventName === 'disconnected')) {
        const subscription: RemoteSubscriptionProps = {
            className: 'channel',
            eventName,
            listenType: 'on'
        };

        remoteUnSub = await subscribeToAllRuntimes(subscription);
    }

    return () => {
        localUnsub();
        remoteUnSub();
    };
};

/*
    Subscribe to a system event
*/
const subSystem = async (identity: Identity, eventName: string, payload: EventPayload, listener: Listener): Promise<Func> => {
    const localUnsub = System.addEventListener(eventName, listener);
    const isExternalClient = ExternalApplication.isRuntimeClient(identity.uuid);
    const ignoredMultiRuntimeEvents = [
        'external-window-closed',
        'external-window-created',
        'external-window-hidden',
        'external-window-shown'
    ];
    let remoteUnSub = noop;

    if (!isExternalClient && !ignoredMultiRuntimeEvents.includes(eventName)) {
        const subscription: RemoteSubscriptionProps = {
            className: 'system',
            eventName,
            listenType: 'on'
        };

        remoteUnSub = await subscribeToAllRuntimes(subscription);
    }

    return () => {
        localUnsub();
        remoteUnSub();
    };
};

/*
    Subscribe to a notification event
*/
const subNotifications = async (identity: NoteIdentity, eventName: string, payload: EventPayload, listener: Listener): Promise<Func> => {
    return addNoteListener(identity, eventName, payload, listener);
};

/*
    Subscribe to an external app event
*/
const subExternalApp = async (identity: Identity, eventName: string, payload: EventPayload, listener: Listener): Promise<Func> => {
    const { uuid } = payload;
    const externalAppIdentity = { uuid };
    return ExternalApplication.addEventListener(externalAppIdentity, eventName, listener);
};

/*
    Subscribe to an external window event
*/
const subExternalWindow = async (identity: Identity, eventName: string, payload: EventPayload, listener: Listener): Promise<Func> => {
    const externalWindowIdentity = apiProtocolBase.getTargetExternalWindowIdentity(payload);
    return await ExternalWindow.addEventListener(externalWindowIdentity, eventName, listener);
};

/*
    Subscribe to a global hotkey event
*/
const subGlobalHotkey = async (identity: Identity, eventName: string, payload: EventPayload, listener: Listener): Promise<Func> => {
    return GlobalHotkey.addEventListener(identity, eventName, listener);
};

const subscriptionMap: SubscriptionMap = {
    'application': subApplication,
    'channel': subChannel,
    'external-application': subExternalApp,
    'external-window': subExternalWindow,
    'frame': subFrame,
    'global-hotkey': subGlobalHotkey,
    'notifications': subNotifications,
    'system': subSystem,
    'window': subWindow
};

/*
    Subscribe to an event
*/
async function subToDesktopEvent(identity: Identity, message: any, ack: Acker) {
    const { payload } = message;
    const { name, topic, type, uuid } = payload;
    const subscribe: Subscribe = subscriptionMap[topic];

    const listener = (emittedPayload: any) => {
        const event: any = {
            action: 'process-desktop-event',
            payload: { topic, type, uuid }
        };

        if (name) {
            event.payload.name = name; // name may exist in emittedPayload
        }

        if (!uuid && emittedPayload.uuid) {
            event.payload.uuid = emittedPayload.uuid;
        }

        if (typeof emittedPayload === 'object') {
            _.extend(event.payload, _.omit(emittedPayload, _.keys(event.payload)));
        }

        apiProtocolBase.sendToIdentity(identity, event);
    };

    if (apiProtocolBase.subscriptionExists(identity, topic, uuid, type, name)) {
        apiProtocolBase.uppSubscriptionRefCount(identity, topic, uuid, type, name);
    } else if (typeof subscribe === 'function') {
        const unsubscribe = await subscribe(identity, type, payload, listener);
        apiProtocolBase.registerSubscription(unsubscribe, identity, topic, uuid, type, name);
    }

    ack(successAck);
    ofEvents.checkMissedEvents(payload, listener);
}

/*
    Unsubscribe from an event
*/
function unSubToDesktopEvent(identity: Identity, message: any, ack: Acker) {
    const { payload } = message;
    const { name, topic, type, uuid } = payload;

    apiProtocolBase.removeSubscription(identity, topic, uuid, type, name);
    ack(successAck);
}
