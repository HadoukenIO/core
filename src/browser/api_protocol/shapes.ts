
// todo: we should only have one ack func and one nack func!!

import { AckFunc, NackFunc } from './transport_strategy/ack';
import { Identity, Acker, Nacker } from '../../shapes';

export type ApiFunc = (identity: Identity, data: any, ack?: Acker | AckFunc, nack?: Nacker | NackFunc) => void;

export type ApiPath = string; // path in dot notation

export type Endpoint = {
    apiFunc: ApiFunc;
    apiPath?: ApiPath;
    apiPolicyDelegate?: ApiPolicyDelegate;
    defaultPermission?: boolean;  // true if undefined
    // future endpoint properties go here
};
export interface ActionMap {
    [key: string]: Endpoint;
}

// ActionSpecMap (hash of EndpointSpec) is only for input to `registerActionMap` (outputs an ActionMap)
export type EndpointSpec = ApiFunc | Endpoint;
export interface ActionSpecMap {
    [key: string]: EndpointSpec;
}

// delegate to check policy for an API
export type ApiPolicyDelegateArgs = {
    apiPath: ApiPath;
    permissionSettings: any; // from group policy or window options
    payload: any // API message payload
};

export interface ApiPolicyDelegate {
    checkPermissions(args: ApiPolicyDelegateArgs): boolean;
}
