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

import * as apiProtocolBase from './api_protocol_base';

import { ExternalApplication } from '../../api/external_application';
import { Identity } from '../../../shapes';
import { ActionSpecMap } from '../shapes';

export class ExternalApplicationApiHandler {
    private readonly actionMap: ActionSpecMap = {
        'get-external-application-info': this.getInfo
    };

    constructor() {
        apiProtocolBase.registerActionMap(this.actionMap);
    }

    private getInfo(source: Identity, message: any) {
        return ExternalApplication.getInfo(message.payload);
    }
}
