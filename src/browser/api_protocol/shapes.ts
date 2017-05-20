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

export interface Actor {
    (identity: Identity, data: any, ack?: Acker | AckFunc, nack?: Nacker | NackFunc): void;
}

export type ApiPath = string; // path in dot notation

export type Endpoint = {
    actor: Actor;
    apiPath?: ApiPath;
    // future endpoint properties go here
};
export interface ActionMap {
    [key: string]: Endpoint;
}

// ActionSpecMap (hash of EndpointSpec) is only for input to `registerActionMap` (outputs an ActionMap)
export type EndpointSpec = Actor | Endpoint;
export interface ActionSpecMap {
    [key: string]: EndpointSpec;
}
