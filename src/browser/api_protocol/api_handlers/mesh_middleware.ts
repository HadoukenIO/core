import { default as RequestHandler } from '../transport_strategy/base_handler';
import { MessagePackage } from '../transport_strategy/api_transport_base';
import * as log from '../../log';
import { default as connectionManager } from '../../connection_manager';
import ofEvents from '../../of_events';
import { isLocalUuid, appInCoreState } from '../../core_state';
import { IdentityAddress, PeerRuntime } from '../../runtime_p2p/peer_connection_manager';

const SUBSCRIBE_ACTION = 'subscribe';
const PUBLISH_ACTION = 'publish-message';
const SEND_MESSAGE_ACTION = 'send-message';

//TODO: This is a workaround for a circular dependency issue in the api handler modules.
const apiMessagesToIgnore: any = {
    'publish-message': true,
    'send-message': true,
    'subscribe': true,
    'unsubscribe': true,
    'subscriber-added': true,
    'subscriber-removed': true,
    'subscribe-to-desktop-event': true,
    'unsubscribe-to-desktop-event': true,
    'create-application': true
};

// NEW AGGREGATE APIS: add the point version to the map so that previous runtime versions are not polled
const apiMessagesToAggregate: any = {
    'create-channel': 35,
    'connect-to-channel': 35,
    'get-all-applications': 1,
    'get-all-channels': 35,
    'get-all-external-applications': 1,
    'get-all-windows': 1,
    'get-focused-window': 1,
    'process-snapshot': 1
};

//TODO: This is a workaround for a circular dependency issue in the api handler modules.
const subscriberTriggeredEvents: any = {
    'subscribe': true,
    'unsubscribe': true
};


const filterRuntimes = (action: string, runtimes: PeerRuntime[]): PeerRuntime[] => {
    const minimumVersion = apiMessagesToAggregate[action];
    if (minimumVersion) {
        return runtimes.filter(runtime => {
            const ofVersion = runtime.portInfo.version.split('.')[2];
            return +ofVersion >= +minimumVersion;
        });
    } else {
        return runtimes;
    }
};

//on a InterAppBus subscribe/unsubscribe send a subscriber-added/subscriber-removed event.
function subscriberEventMiddleware(msg: MessagePackage, next: () => void) {
    const { data, identity: { uuid: uuid}, identity } = msg;

    //runtimeUuid as part of the identity means the request originated from a different runtime. We do not want to handle it.
    if (subscriberTriggeredEvents[data.action] && !identity.runtimeUuid) {
        const { payload: { sourceUuid: sourceUuid, topic: topic, destinationWindowName, sourceWindowName }} = data;

        const forwardedAction = data.action === SUBSCRIBE_ACTION ?  ofEvents.subscriber.ADDED : ofEvents.subscriber.REMOVED;
        const subAddedPayload = {
            senderName: sourceWindowName || sourceUuid,
            senderUuid: sourceUuid,
            name: destinationWindowName,
            uuid,
            topic
        };

        connectionManager.resolveIdentity({ uuid: sourceUuid})
        .then((id: any) => {
            return id.runtime.fin.System.executeOnRemote(identity, {
                action: forwardedAction,
                payload: subAddedPayload
            }).catch((e: Error) => {
                //forward subscriber event failed, this should not prevent normal flow.
                log.writeToLog('info', e);
            });
        });
    }
    next();
}

//on an InterAppBuss publish, forward the message to any runtime on the mesh.
function publishMiddleware(msg: MessagePackage, next: () => void) {
    const { data, identity } = msg;

    if (data.action === PUBLISH_ACTION && !identity.runtimeUuid) {

        connectionManager.connections.forEach((peer: any) => {
            peer.fin.System.executeOnRemote(identity, data);
        });
    }
    next();
}

//on a InterAppBus send-message, forward the message to the runtime that owns the uuid.
function sendMessageMiddleware(msg: MessagePackage, next: () => void) {
    const { data, identity, ack, nack } = msg;

    //runtimeUuid as part of the identity means the request originated from a different runtime. We do not want to handle it.
    if (data.action === SEND_MESSAGE_ACTION && !identity.runtimeUuid) {
        const { payload: { destinationUuid } } = data;

        //We own this UUID, handle locally
        if (isLocalUuid(destinationUuid)) {
            next();
        } else {
            connectionManager.resolveIdentity({ uuid: destinationUuid})
            .then((id: any) => {
                id.runtime.fin.System.executeOnRemote(identity, data)
                .then(ack)
                .catch(nack);
            }).catch((e: Error) => {
                //Uuid was not found in the mesh, let local logic go its course
                next();
            });
        }
    } else {
        next();
    }
}

//on a non InterAppBus API call, forward the message to the runtime that owns the uuid.
function ferryActionMiddleware(msg: MessagePackage, next: () => void) {
    const { identity, data, ack, nack } = msg;
    const payload = data && data.payload;
    const uuid = payload && payload.uuid;
    const action = data && data.action;

    const isValidUuid = uuid !== void(0);
    const isValidIdentity = typeof (identity) === 'object';
    const isForwardAction = !apiMessagesToIgnore[action];
    const isRemoteEntity = !isLocalUuid(uuid);
    //runtimeUuid as part of the identity means the request originated from a different runtime. We do not want to handle it.
    const isLocalAction = !identity.runtimeUuid;
    const isLocalRun = action === 'run-application' && appInCoreState(uuid);
    if (isValidUuid && isForwardAction  && isValidIdentity && isRemoteEntity && isLocalAction && !isLocalRun) {
        try {
            connectionManager.resolveIdentity({uuid})
            .then((id: IdentityAddress) => {
                id.runtime.fin.System.executeOnRemote(identity, data)
                .then(res => {
                    switch (action) {
                        case 'get-info':
                            if (res && res.data && !res.data.runtime) {
                               Object.assign(res.data, {runtime: {version: id.runtime.portInfo.version}});
                            }
                            return res;
                        default:
                            return res;
                    }
                })
                .then(ack)
                .catch(nack);
            }).catch((e: Error) => {
                //Uuid was not found in the mesh, let local logic go its course
                next();
            });

        } catch (e) {
            //something failed asking for the remote
            log.writeToLog('info', e);
            next();
        }
    } else {
        // handle local
        next();
    }
}

// On certain system API calls, provide aggregate results from all runtimes on the mesh
function aggregateFromExternalRuntime(msg: MessagePackage, next: (locals?: object) => void) {
    const { identity, data } = msg;
    const action = data && data.action;
    const isAggregateAction = apiMessagesToAggregate[action];
    // runtimeUuid as part of the identity means the request originated from a different runtime. We do not want to handle it.
    const isLocalAction = !identity.runtimeUuid;
    const filteredRuntimes = filterRuntimes(action, connectionManager.connections);

    try {
        if (isAggregateAction && isLocalAction && filteredRuntimes.length) {
            const aggregateData = JSON.parse(JSON.stringify(data));

            if (action === 'create-channel') {
                aggregateData.action = 'get-all-channels';
            }

            const externalResults: any[] = [];
            const aggregateSafePromises = filteredRuntimes.map(runtime => {
                return runtime.fin.System.executeOnRemote(identity, aggregateData)
                    .then((externalResult) => externalResults.push(externalResult))
                    .catch((error) => {
                        log.writeToLog('info',
                            'Failed to get multi-runtime aggregate data ' +
                            `for action "${action}". Error: ${error}. ` +
                            `Requested runtime: ${JSON.stringify(runtime.portInfo)}`
                        );
                    });
            });

            Promise.all(aggregateSafePromises).then(() => {
                const externalRuntimeData = externalResults.reduce((result, runtime) => {
                    if (runtime && runtime.data) {
                        if (Array.isArray(runtime.data)) {
                            return [...result, ...runtime.data];
                        } else {
                            return [...result, runtime.data];
                        }
                    }
                    return result;
                }, []);

                const locals = { aggregate: externalRuntimeData };
                next(locals);
            });

        } else {
            next();
        }

    } catch (e) {
        log.writeToLog('info', e);
        next();
    }
}

function registerMiddleware (requestHandler: RequestHandler<MessagePackage>): void {
    requestHandler.addPreProcessor(subscriberEventMiddleware);
    requestHandler.addPreProcessor(publishMiddleware);
    requestHandler.addPreProcessor(sendMessageMiddleware);
    requestHandler.addPreProcessor(ferryActionMiddleware);
    requestHandler.addPreProcessor(aggregateFromExternalRuntime);
}

export { registerMiddleware };
