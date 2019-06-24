import { AckMessage, AckFunc, AckPayload, NackPayload } from './ack';
import { ApiTransportBase, MessagePackage, MessageConfiguration } from './api_transport_base';
import { default as RequestHandler } from './base_handler';
import { Endpoint, ActionMap } from '../shapes';
import { Identity, AppObj } from '../../../shapes';
declare var require: any;

import * as coreState from '../../core_state';
import {ipc, channels} from '../../transports/electron_ipc';
import { getWebContentsInitialOptionSet, RoutingInfo } from '../../core_state';
const system = require('../../api/system').System;

class RendererBatchConfiguration {
    public readonly action: string;
    public readonly enabled: boolean;
    public readonly length: number;
    public readonly maxSize: number;
    public readonly payload: any;
    public readonly ttl: number;

    constructor(windowOptions: any, payload: any) {
        // This destructuring is safe because the shape of
        // window options are enforced and well defined
        // To Do: Convert five0BaseOptions to TypeScript
        const { experimental: { api: { batching: { renderer: { enabled, ttl, maxSize } } } } } = windowOptions;

        this.enabled = enabled;
        this.ttl = ttl;
        this.maxSize = maxSize;
        this.action = payload && payload.action;
        this.payload = payload;
        this.length = (payload && payload.payload && payload.payload.messages && payload.payload.messages.length) || 1;
    }
}

class BreadcrumbConfiguration {
    public readonly enabled: boolean;

    constructor(windowOptions: any) {
        // This destructuring is safe because the shape of
        // window options are enforced and well defined
        // To Do: Convert five0BaseOptions to TypeScript
        const { experimental: { api: { breadcrumbs } } } = windowOptions;
        this.enabled = breadcrumbs;
    }
}

// Optional properties so the base-type can remain declared in api_transport_base.ts
class ElIPCConfiguration implements MessageConfiguration {
    public readonly breadcrumbConfiguration: BreadcrumbConfiguration;
    public readonly rendererBatchConfiguration: RendererBatchConfiguration;

    constructor(breadcrumbConfiguration: BreadcrumbConfiguration,
                rendererBatchConfiguration: RendererBatchConfiguration) {
        this.breadcrumbConfiguration = breadcrumbConfiguration;
        this.rendererBatchConfiguration = rendererBatchConfiguration;
    }
}

export class ElipcStrategy extends ApiTransportBase<MessagePackage> {

    constructor(actionMap: ActionMap, requestHandler: RequestHandler<MessagePackage>) {
        super(actionMap, requestHandler);

        this.requestHandler.addHandler((mp: MessagePackage, next: () => void) => {
            const { identity, data, ack, nack, strategyName } = mp;

            if (strategyName !== this.constructor.name) {
                next();
            } else {
                const endpoint: Endpoint = this.actionMap[data.action];
                if (endpoint) {
                    let endpointReturnValue: any;

                    try {
                        endpointReturnValue = endpoint.apiFunc(identity, data, ack, nack);
                    } catch (error) {
                        return nack(error);
                    }

                    if (endpointReturnValue instanceof Promise) {
                        // Promise-based endpoint
                        endpointReturnValue.then(result => {
                            ack(new AckPayload(result));
                        }).catch(err => {
                            nack(err);
                        });
                    } else if (endpointReturnValue !== undefined) {
                        // Synchronous endpoint with returned data
                        ack(new AckPayload(endpointReturnValue));
                    } else {
                        // Callback-based endpoint (takes care of calling ack/nack by itself)
                    }
                } else {
                    const runtimeVersion = system.getVersion();
                    const message = `API call ${data.action} not implemented in runtime version: ${runtimeVersion}.`;
                    ack(new NackPayload(message));
                }
            }
        });
    }

    private canTrySend(routingInfo: any): boolean {
        const { webContents, frameRoutingId } = routingInfo;
        const webContentsLocated = webContents;
        const webContentsExists = !webContents.isDestroyed();
        const validRoutingId = typeof frameRoutingId === 'number';
        return webContentsLocated && webContentsExists && validRoutingId;
    }

    // Dispatch a message
    private innerSend(payload: string,
                      routingInfo: RoutingInfo): void {
        const { webContents, frameRoutingId, mainFrameRoutingId, _options} = routingInfo;
        if (frameRoutingId === mainFrameRoutingId) {
            // this is the main window frame
            if (!_options.api.iframe.enableDeprecatedSharedName) {
                webContents.sendToFrame(frameRoutingId, channels.CORE_MESSAGE, payload);
            } else {
                webContents.send(channels.CORE_MESSAGE, payload);
            }
        } else {
            // frameRoutingId != webContents.mainFrameRoutingId implies a frame
            webContents.sendToFrame(frameRoutingId, channels.CORE_MESSAGE, payload);
        }
    }

    public registerMessageHandlers(): void {
        ipc.on(channels.WINDOW_MESSAGE, this.onMessage.bind(this));
    }

    public send(identity: Identity, payloadObj: any): void {
        const { uuid, name } = identity;
        const routingInfo = coreState.getRoutingInfoByUuidFrame(uuid, name);

        if (!routingInfo) {
            system.debugLog(1, `Routing info for uuid:${uuid} name:${name} not found`);
            return;
        }

        const { frameRoutingId } = routingInfo;
        const payload = JSON.stringify(payloadObj);

        if (!this.canTrySend(routingInfo)) {
            system.debugLog(1, `uuid:${uuid} name:${name} frameRoutingId:${frameRoutingId} not reachable, payload:${payload}`);
        } else {
            this.innerSend(payload, routingInfo);
        }
    }

    //TODO: this needs to be refactor at some point.
    public onClientAuthenticated(cb: Function): void {
        throw new Error('Not implemented');
    }

    //TODO: this needs to be refactor at some point.
    public onClientDisconnect(cb: Function): void {
        throw new Error('Not implemented');
    }

    protected onMessage(e: any, rawData: any, ackFactoryDelegate: any): void {

        try {
            const webContentsId = e.sender.id;

            const opts: any = getWebContentsInitialOptionSet(webContentsId).options;

            if (!opts) {
                throw new Error(`Unable to locate window information for endpoint with window id ${webContentsId}`);
            }

            const data = JSON.parse(JSON.stringify(rawData));

            const configuration: ElIPCConfiguration = new ElIPCConfiguration(new BreadcrumbConfiguration(opts),
                                                                             new RendererBatchConfiguration(opts, data));

            const ackFactory = ackFactoryDelegate || this.ackDecorator.bind(this);

            const ack = !data.isSync ?
                            ackFactory(e, data.messageId, data, configuration)
                                :
                            this.ackDecoratorSync(e, data.messageId);
            const nack = this.nackDecorator(ack);

            const entityType = e.sender.getEntityType(e.frameRoutingId);
            const isIframe  = e.sender.isIframe(e.frameRoutingId);
            const { api: { iframe: { enableDeprecatedSharedName } } } = opts;
            let subFrameName;

            if (!isIframe || enableDeprecatedSharedName) {
                subFrameName = opts.name;
            } else {
                subFrameName = e.sender.getFrameName(e.frameRoutingId);
            }

            const identity = {
                batch: data.action === 'api-batch',
                entityType,
                name: subFrameName,
                parentFrame: opts.name,
                uuid: opts.uuid
            };

            /* tslint:disable: max-line-length */
            //message payload might contain sensitive data, mask it.
            const disableIabSecureLogging = (<AppObj>coreState.getAppObjByUuid(opts.uuid))._options.disableIabSecureLogging;
            let replacer = (!disableIabSecureLogging && (data.action === 'publish-message' || data.action === 'send-message')) ? this.payloadReplacer : null;
            if (data.action === 'window-authenticate') { // not log password
                replacer = this.passwordReplacer;
            }
            system.debugLog(1, `received in-runtime${data.isSync ? '-sync ' : ''}: ${e.frameRoutingId} [${identity.uuid}]-[${identity.name}] ${JSON.stringify(data, replacer)}`);
            /* tslint:enable: max-line-length */

            if (!identity.batch) {
                this.requestHandler.handle({
                    identity, data, ack, nack, e,
                    strategyName: this.constructor.name
                });
            } else {
                const deferredAckFactory = this.ackDeferredDecorator(e,
                                                                     data.messageId,
                                                                     data,
                                                                     configuration);
                data.payload.messages.forEach((m: any) => {
                    this.onMessage(e, m, deferredAckFactory);
                });
            }

        } catch (err) {
            system.debugLog(1, err);
        }
    }

    protected ackDecoratorSync(e: any, messageId: number): AckFunc {
        const ackObj = new AckMessage();
        ackObj.correlationId = messageId;

        return (payload: any): void => {
            ackObj.payload = payload;

            try {
                // Log all messages when -v=1
                system.debugLog(1, `sent sync in-runtime <= ${JSON.stringify(ackObj)}`);
            } catch (err) {
                /* tslint:disable: no-empty */
            }

            if (!e.sender.isDestroyed()) {
                e.returnValue = JSON.stringify(ackObj);
            }
        };
    }

    protected createAckObject(configuration: ElIPCConfiguration, originalPayload: any, messageId: number): AckMessage {
        const usingBreadcrumbs = configuration.breadcrumbConfiguration.enabled;
        const ackObj = (!usingBreadcrumbs ?
                            new AckMessage()
                                :
                            new AckMessage(originalPayload.breadcrumb, originalPayload.action));
        ackObj.correlationId = messageId;
        return ackObj;
    }

    protected ackDecorator(e: any, messageId: number, originalPayload: any, baseConfiguration: MessageConfiguration): AckFunc {
        const configuration: ElIPCConfiguration = <ElIPCConfiguration>baseConfiguration;
        const usingBreadcrumbs = configuration.breadcrumbConfiguration.enabled;
        const ackObj = this.createAckObject(configuration, originalPayload, messageId);

        if (usingBreadcrumbs) {
            ackObj.addBreadcrumb('core/ackDecorator');
        }

        return (payload: any): void => {
            ackObj.payload = payload;

            try {
                // Log all messages when -v=1
                /* tslint:disable: max-line-length */
                system.debugLog(1, `sent in-runtime <= ${e.frameRoutingId} ${JSON.stringify(ackObj)}`);
            } catch (err) {
                /* tslint:disable: no-empty */
            }

            if (!e.sender.isDestroyed()) {
                if (usingBreadcrumbs) {
                    ackObj.addBreadcrumb('core/ACK');
                }

                e.sender.sendToFrame(e.frameRoutingId, channels.CORE_MESSAGE, JSON.stringify(ackObj));
            }
        };

    }

    // Handles API batches. Generates a mock of ackDecorator, stores API ACKs, and dispatches as one combined message only after
    // all API messages in the batch have been resolved (ACK'd)
    protected ackDeferredDecorator(e: any, messageId: number, originalPayload: any, baseConfiguration: MessageConfiguration): any {
        const configuration: ElIPCConfiguration = <ElIPCConfiguration>baseConfiguration;
        const usingBreadcrumbs = configuration.breadcrumbConfiguration.enabled;
        const deferredAcks: any = [];

        // ACK of the entire API batch
        const mainAck = this.ackDecorator(e, messageId, originalPayload, baseConfiguration);

        // Stubs the responsibility of a normal ackDecorator
        // Track state for all ACKs in the batch
        return (e: any, messageId: number, originalPayload: any): AckFunc => {
            const ackObj = this.createAckObject(configuration, originalPayload, messageId);

            if (usingBreadcrumbs) {
                ackObj.addBreadcrumb('core/ackDelegate');
            }

            // AckFunc to emulate Promise.all()
            return (payload: any): void => {
                ackObj.payload = payload;

                if (usingBreadcrumbs) {
                    ackObj.addBreadcrumb('core/deferredACK');
                }

                deferredAcks.push(ackObj);

                if (deferredAcks.length === configuration.rendererBatchConfiguration.length) {
                   mainAck({
                    success: true,
                    data: deferredAcks
                   });
               }
           };
       };
    }
}
