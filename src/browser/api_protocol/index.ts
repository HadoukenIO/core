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

const ApplicationApiHandler = require('./api_handlers/application').ApplicationApiHandler;
const AuthorizationApiHandler = require('./api_handlers/authorization').AuthorizationApiHandler;
const ClipboardApiHandler = require('./api_handlers/clipboard').ClipboardApiHandler;
const EventListenerApiHandler = require('./api_handlers/event_listener').EventListenerApiHandler;
const InterApplicationBusApiHandler = require('./api_handlers/interappbus').InterApplicationBusApiHandler;
const NotificationApiHandler = require('./api_handlers/notifications').NotificationApiHandler;
const SystemApiHandler = require('./api_handlers/system').SystemApiHandler;
const WindowApiHandler = require('./api_handlers/window').WindowApiHandler;

const apiProtocolBase = require('./api_handlers/api_protocol_base.js');

export function initApiHandlers() {
    /* tslint:disable: no-unused-variable */
    const applicationApiHandler = new ApplicationApiHandler();
    const authorizationApiHandler = new AuthorizationApiHandler();
    const clipboardApiHandler = new ClipboardApiHandler();
    const eventListenerApiHandler = new EventListenerApiHandler();
    const interApplicationBusApiHandler = new InterApplicationBusApiHandler();
    const notificationApiHandler = new NotificationApiHandler();
    const systemApiHandler = new SystemApiHandler();
    const windowApiHandler = new WindowApiHandler();

    apiProtocolBase.init();
}
