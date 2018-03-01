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
/* global routingId, isMainFrame */

const electron = require('electron');

const susbcribeForTeardown = (routingId, handlers = []) => {
    process.once(`frame-exit-${routingId}`, () => {
        handlers.forEach((teardownHandler) => {
            if (typeof teardownHandler === 'function') {
                try {
                    teardownHandler();
                } catch (error) {
                    console.error(`Error cleaning up renderFrame ${routingId}`);
                    console.error(error.stack);
                }
            }
        });
    });
};

// OpenFin: these values are used in lib/common/api/crash-reporter.js
process.versions = process.versions || {};
process.versions.combinedId = electron.remote.app.getCombinedId();
process.versions.openfin = electron.remote.app.getRuntimeVersion();
process.versions.mainFrameRoutingId = electron.ipcRenderer.getFrameRoutingID();
process.versions.cachePath = electron.remote.app.getPath('userData');

const mainWindowId = electron.remote.getCurrentWindow(process.versions.mainFrameRoutingId).id;
const apiDecoratorAsString = electron.remote.require('./src/renderer/main').api(mainWindowId);

let perFrameData = {};
// let chromiumWindowAlertEnabled = electron.remote.app.getCommandLineArguments().includes('--enable-chromium-window-alert');

// Handle spin-up and tear-down
const registerAPI = (w, routingId, isMainFrame) => {
    const teardownHandlers = [];
    // teardownHandlers.push(hookWebFrame(electron.webFrame.createForRenderFrame(routingId), routingId))

    try {
        if (window.location.protocol === 'chrome-devtools:') {
            return;
        }

        // w.debugMessages = w.debugMessages || [];
        // w.debugMessages.push(`id is ${routingId}`);

        // Mock as a Node/Electron environment
        // ===================================
        // let global = w;
        w.getFrameData = (routingId) => {
            perFrameData[routingId] = perFrameData[routingId] || {};
            return perFrameData[routingId];
        };

        w.require = require;
        // w.debugMessages.push('w.require = require;');
        // w.module = module;
        // w.debugMessages.push('w.module = module;');
        w.global = global;
        // w.debugMessages.push('w.global = global;');
        w.process = process;
        // w.debugMessages.push('w.process = process;');
        w.routingId = routingId || electron.ipcRenderer.getFrameRoutingID();
        // w.debugMessages.push('w.routingId = routingId || electron.ipcRenderer.getFrameRoutingID();');
        w.isMainFrame = isMainFrame;

        // v8Util.setHiddenValue(w, 'routingId', routingId)
        // v8Util.setHiddenValue(w.global, 'ipc', electron.ipcRenderer)

        // teardownHandlers.push(override(w, routingId, chromiumWindowAlertEnabled))
        // ===================================

        w.eval(apiDecoratorAsString);

        w.console.warn('node-less renderer');

        let inboundMessageTopic = '';

        if (w.fin) {
            inboundMessageTopic = `${w.fin.__internal_.ipcconfig.channels.CORE_MESSAGE}-${w.fin.__internal_.routingId}`;
        }

        // w.debugMessages.push(`nodeIntegration ${nodeIntegration}`);
        // w.debugMessages.push(`inboundMessageTopic ${inboundMessageTopic}`);

        delete w.require;
        delete w.process;
        delete w.module;
        delete w.Buffer;
        delete w.routingId;
        delete w.isMainFrame;
        delete w.global;
        delete w.getFrameData;

        w = undefined;

        try {
            electron.ipcRenderer.emit('post-api-injection', routingId);
            electron.ipcRenderer.emit(`post-api-injection-${routingId}`);
        } catch (error) {
            console.error(`Error notifying post-api-injection for ${routingId}`);
            console.error(error.stack);
        } finally {
            electron.ipcRenderer.removeAllListeners(`post-api-injection-${routingId}`);
        }

        if (inboundMessageTopic.length) {
            teardownHandlers.push(() => {
                try {
                    electron.ipcRenderer.emit('teardown-render-frame', routingId);
                    electron.ipcRenderer.emit(`teardown-render-frame-${routingId}`);
                    electron.ipcRenderer.removeAllListeners(inboundMessageTopic);

                    // Fallback last-resort teardown for adapter owned topics.
                    electron.ipcRenderer.removeAllListeners(`teardown-render-frame-${routingId}`);
                    electron.ipcRenderer.removeAllListeners(`zoom-${routingId}`);
                } catch (error) {
                    console.error(`Error cleaning up renderFrame ${routingId}`);
                    console.error(error.stack);
                }
            });
        }
    } catch (error) {
        // w.debugMessages.push('errrrr');
        console.error(error);
        console.error(error.stack);
        electron.ipcRenderer.send(routingId, 'api-injection-failed', routingId);
    }

    susbcribeForTeardown(routingId, teardownHandlers);
};

registerAPI(window, routingId, isMainFrame);
