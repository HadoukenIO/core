/* global routingId, isMainFrame, isSameOriginIframe, isCrossOriginIframe, isChildMainFrame */

const electron = require('electron');
const resolvePromise = Promise.resolve.bind(Promise);

const defaultWebFrame = electron.webFrame;

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
const { apiString, initialOptions } = electron.remote.require('./src/renderer/main').apiWithOptions(mainWindowId);

// let chromiumWindowAlertEnabled = electron.remote.app.getCommandLineArguments().includes('--enable-chromium-window-alert');

const hookWebFrame = (webFrame, renderFrameId) => {
    electron.ipcRenderer.on(`ELECTRON_INTERNAL_RENDERER_WEB_FRAME_METHOD-${renderFrameId}`, (event, method, args) => {
        webFrame[method](...args);
    });

    electron.ipcRenderer.on(`ELECTRON_INTERNAL_RENDERER_SYNC_WEB_FRAME_METHOD-${renderFrameId}`, (event, requestId, method, args) => {
        const result = webFrame[method](...args);
        event.sender.send(renderFrameId, `ELECTRON_INTERNAL_BROWSER_SYNC_WEB_FRAME_RESPONSE_${requestId}`, result);
    });

    electron.ipcRenderer.on(`ELECTRON_INTERNAL_RENDERER_ASYNC_WEB_FRAME_METHOD-${renderFrameId}`, (event, requestId, method, args) => {
        const responseCallback = function(result) {
            resolvePromise(result)
                .then((resolvedResult) => {
                    event.sender.send(renderFrameId, `ELECTRON_INTERNAL_BROWSER_ASYNC_WEB_FRAME_RESPONSE_${requestId}`, null, resolvedResult);
                })
                .catch((resolvedError) => {
                    event.sender.send(renderFrameId, `ELECTRON_INTERNAL_BROWSER_ASYNC_WEB_FRAME_RESPONSE_${requestId}`, resolvedError);
                });
        };
        args.push(responseCallback);
        webFrame[method](...args);
    });

    // Teardown
    return () => {
        electron.ipcRenderer.removeAllListeners(`ELECTRON_INTERNAL_RENDERER_WEB_FRAME_METHOD-${renderFrameId}`);
        electron.ipcRenderer.removeAllListeners(`ELECTRON_INTERNAL_RENDERER_SYNC_WEB_FRAME_METHOD-${renderFrameId}`);
        electron.ipcRenderer.removeAllListeners(`ELECTRON_INTERNAL_RENDERER_ASYNC_WEB_FRAME_METHOD-${renderFrameId}`);
    };
};


// Handle spin-up and tear-down
const registerAPI = (w, routingId, isMainFrame, isSameOriginIframe, isCrossOriginIframe, isChildMainFrame) => {

    const teardownHandlers = [];
    teardownHandlers.push(hookWebFrame(defaultWebFrame.createForRenderFrame(routingId), routingId));

    try {
        if (window.location.protocol === 'chrome-devtools:') {
            return;
        }

        // Mock as a Node/Electron environment
        // ===================================
        w.getFrameData = process.getFrameData;
        w.require = require;
        w.global = global;
        w.process = process;
        w.routingId = routingId || electron.ipcRenderer.getFrameRoutingID();
        w.isMainFrame = isMainFrame;
        // ===================================

        const { options: { iframe: { sameOriginInjection, crossOriginInjection } } } = JSON.parse(initialOptions);
        let inboundMessageTopic = '';

        const apiInjectionAllowed = isMainFrame || isChildMainFrame ||
            (isSameOriginIframe && sameOriginInjection) ||
            (isCrossOriginIframe && crossOriginInjection);

        if (apiInjectionAllowed) {
            w.process.eval(apiString);

            if (w.fin) {
                inboundMessageTopic = `${w.fin.__internal_.ipcconfig.channels.CORE_MESSAGE}-${w.fin.__internal_.routingId}`;

            } else {
                console.warn('failed to load OpenFin api');
            }
        }

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

registerAPI(window, routingId, isMainFrame, isSameOriginIframe, isCrossOriginIframe, isChildMainFrame, initialOptions);
