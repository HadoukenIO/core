import { AckMessage, AckFunc, AckPayload, NackPayload } from './ack';
import { ApiTransportBase, MessagePackage, MessageConfiguration } from './api_transport_base';
import { default as RequestHandler } from './base_handler';
import { Endpoint, ActionMap } from '../shapes';
import { Identity } from '../../../shapes';
declare var require: any;

const coreState = require('../../core_state');
const electronIpc = require('../../transports/electron_ipc');
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
            const { identity, data, ack, nack, e, strategyName } = mp;

            if (strategyName !== this.constructor.name) {
                next();
            } else {
                const endpoint: Endpoint = this.actionMap[data.action];
                if (endpoint) {
                    Promise.resolve()
                        .then(() => endpoint.apiFunc(identity, data, ack, nack))
                        .then(result => {
                            // older action calls will invoke ack internally, newer ones will return a value
                            if (result !== undefined) {
                                ack(new AckPayload(result));
                            }
                        }).catch(err => {
                            nack(err);
                        });
                } else {
                    const runtimeVersion = system.getVersion();
                    const message = `API call ${data.action} not implemented in runtime version: ${runtimeVersion}.`;
                    ack(new NackPayload(message));
                }
            }
        });
    }

    private canTrySend(routingInfo: any): boolean {
        const { browserWindow, frameRoutingId } = routingInfo;
        const browserWindowLocated = browserWindow;
        const browserWindowExists = !browserWindow.isDestroyed();
        const validRoutingId = typeof frameRoutingId === 'number';
        return browserWindowLocated && browserWindowExists && validRoutingId;
    }

    // Dispatch a message
    private innerSend(payload: string,
                      frameRoutingId: number,
                      mainFrameRoutingId: number,
                      browserWindow: any): void {
        if (frameRoutingId === mainFrameRoutingId) {
            // this is the main window frame
            if (coreState.argo.framestrategy === 'frames') {
                browserWindow.webContents.sendToFrame(frameRoutingId, electronIpc.channels.CORE_MESSAGE, payload);
            } else {
                browserWindow.send(electronIpc.channels.CORE_MESSAGE, payload);
            }
        } else {
            // frameRoutingId != browserWindow.webContents.mainFrameRoutingId implies a frame
            browserWindow.webContents.sendToFrame(frameRoutingId, electronIpc.channels.CORE_MESSAGE, payload);
        }
    }

    public registerMessageHandlers(): void {
        electronIpc.ipc.on(electronIpc.channels.WINDOW_MESSAGE, this.onMessage.bind(this));
    }

    public send(identity: Identity, payloadObj: any): void {
        const { uuid, name } = identity;
        const routingInfo = coreState.getRoutingInfoByUuidFrame(uuid, name);

        if (!routingInfo) {
            system.debugLog(1, `Routing info for uuid:${uuid} name:${name} not found`);
            return;
        }

        const { browserWindow, mainFrameRoutingId, frameRoutingId } = routingInfo;
        const payload = JSON.stringify(payloadObj);

        if (!this.canTrySend(routingInfo)) {
            system.debugLog(1, `uuid:${uuid} name:${name} frameRoutingId:${frameRoutingId} not reachable, payload:${payload}`);
        } else {
            this.innerSend(payload, frameRoutingId, mainFrameRoutingId, browserWindow);
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
            const browserWindow = e.sender.getOwnerBrowserWindow();
            const currWindow = browserWindow ? coreState.getWinById(browserWindow.id) : null;
            const openfinWindow = currWindow && currWindow.openfinWindow;
            const opts = openfinWindow && openfinWindow._options;

            if (!opts) {
                throw new Error(`Unable to locate window information for endpoint with window id ${browserWindow.id}`);
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
            const isWindow  = ! e.sender.isIframe(e.frameRoutingId);
            const { api: { iframe: { enableDeprecatedSharedName } } } = opts;
            let subFrameName;

            if (isWindow || enableDeprecatedSharedName) {
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
            const disableIabSecureLogging = coreState.getAppObjByUuid(opts.uuid)._options.disableIabSecureLogging;
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

                e.sender.sendToFrame(e.frameRoutingId, electronIpc.channels.CORE_MESSAGE, JSON.stringify(ackObj));
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
