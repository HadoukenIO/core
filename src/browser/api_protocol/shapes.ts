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

// todo: we should only have one ack func and one nack func!!

import { AckFunc, NackFunc } from './transport_strategy/ack';
import { Identity, Acker, Nacker } from '../../shapes';

export type ApiFunc = (identity: Identity, data: any, ack?: Acker | AckFunc, nack?: Nacker | NackFunc) => void;

export type ApiPath = string; // path in dot notation

export type Endpoint = {
    apiFunc: ApiFunc;
    apiPath?: ApiPath;
    apiPolicyDelegate?: ApiPolicyDelegate;
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
