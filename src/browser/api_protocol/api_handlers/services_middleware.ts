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

import RequestHandler from '../transport_strategy/base_handler';
import { MessagePackage } from '../transport_strategy/api_transport_base';
import { sendToIdentity } from './api_protocol_base';
import { Identity } from '../../../shapes';
import { AckFunc, NackFunc } from '../transport_strategy/ack';
import { Services } from '../../api/services';

interface RemoteAck {
    ack: AckFunc;
    nack: NackFunc;
}

const serviceApiActions: any = {
   'dispatch-service': true
};

const remoteAckMap: Map<string, RemoteAck> = new Map();
const SERVICE_APP_ACTION = 'process-service-action';
const SERVICE_ACK_ACTION = 'service-ack';

// Do we need name too?
function getAckKey(id: number, identity: Identity): string {
    return `${ id }-${ identity.uuid }-${ identity.name }`;
}

//this preprocessor will check if the API call is a service action and forward it to the service to handle.
function handleServiceApiAction(msg: MessagePackage, next: () => void): void {
    const { data, ack, nack, identity } = msg;
    const { action, payload } = data;
    const serviceName = payload && payload.serviceName;

    //the target of this API call is a window.
    if (serviceApiActions[action]) {
        const service = Services.getService(serviceName);
        const ackKey = getAckKey(data.messageId, identity);

        //the service exists and is registered
        if (service) {

            //store the ack/nack combo for when the external connection acks/nacks.
            remoteAckMap.set(ackKey, { ack, nack });

            //foward the API call to the service.
            sendToIdentity(service.identity, {
                action: SERVICE_APP_ACTION,
                payload: {
                    action,
                    messageId: data.messageId,
                    payload,
                    destinationToken: identity
                }
            });
        } else {
            nack('Service not found.');
        }
    } else {
        next();
    }
}

//this preprocessor will check if the API call is an 'ack' action from a service and tie it to the original request.
function handleServiceAckAction(msg: MessagePackage, next: () => void): void {
    const { data, nack } = msg;
    const { action, payload, destinationToken, correlationId } = data;

    if (action === SERVICE_ACK_ACTION) {
        const identity = destinationToken;
        const ackKey = getAckKey(correlationId, identity);
        const remoteAck = remoteAckMap.get(ackKey);

        if (remoteAck) {
            if (data.success) {
                remoteAck.ack({
                    data: payload,
                    success: true
                });
            } else {
                remoteAck.nack(new Error(data.reason));
            }
            remoteAckMap.delete(ackKey);
        } else {
            // how does this fail...? nack here?
            next();
        }

    } else {
        next();
    }
}

function registerMiddleware (requestHandler: RequestHandler<MessagePackage>): void {
    requestHandler.addPreProcessor(handleServiceApiAction);
    requestHandler.addPreProcessor(handleServiceAckAction);
}

export { registerMiddleware };
