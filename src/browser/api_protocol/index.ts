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
declare var require: any;

const initApplicationApiHandler = require('./api_handlers/application').init;
import { ExternalApplicationApiHandler } from './api_handlers/external_application';
import {
    init as initAuthorizationApiHandler,
    registerMiddleware as registerExternalConnAuthMiddleware
} from './api_handlers/authorization';
import { init as initClipboardAPIHandler } from './api_handlers/clipboard';
import { FrameApiHandler } from './api_handlers/frame';
import { ServiceApiHandler } from './api_handlers/service';
const EventListenerApiHandler = require('./api_handlers/event_listener').EventListenerApiHandler;
const InterApplicationBusApiHandler = require('./api_handlers/interappbus').InterApplicationBusApiHandler;
const NotificationApiHandler = require('./api_handlers/notifications').NotificationApiHandler;
const SystemApiHandler = require('./api_handlers/system').SystemApiHandler;
const initWindowApiHandler = require('./api_handlers/window').init;
import { init as initApiProtocol, getDefaultRequestHandler } from './api_handlers/api_protocol_base';
import { meshEnabled } from '../connection_manager';
import { registerMiddleware as registerEntityExistenceMiddleware } from './api_handlers/middleware_entity_existence';
import { registerMiddleware as registerMeshMiddleware } from './api_handlers/mesh_middleware';
import { registerMiddleware as registerServiceMiddleware } from './api_handlers/service_middleware';
import {
    registerMiddleware as registerProcessExternalAppMiddleware,
    legacyWindowingEnabled
} from './api_handlers/deprecated_external_windowing_middleware';

// Middleware registration. The order is important.
registerEntityExistenceMiddleware(getDefaultRequestHandler());
//re-enable support for process-external-app-action
if (legacyWindowingEnabled()) {
    registerProcessExternalAppMiddleware(getDefaultRequestHandler());
}
registerServiceMiddleware(getDefaultRequestHandler());
if (meshEnabled) {
    registerMeshMiddleware(getDefaultRequestHandler());
}
registerExternalConnAuthMiddleware(getDefaultRequestHandler());

export function initApiHandlers() {
    /* tslint:disable: no-unused-variable */
    initApplicationApiHandler();
    const externalApplicationApiHandler = new ExternalApplicationApiHandler();
    initAuthorizationApiHandler();
    initClipboardAPIHandler();
    const frameApiHandler = new FrameApiHandler();
    const serviceApiHandler = new ServiceApiHandler();
    const eventListenerApiHandler = new EventListenerApiHandler();
    const interApplicationBusApiHandler = new InterApplicationBusApiHandler();
    const notificationApiHandler = new NotificationApiHandler();
    const systemApiHandler = new SystemApiHandler();
    initWindowApiHandler();

    initApiProtocol();

    const apiPolicyProcessor = require('./api_handlers/api_policy_processor');
}
