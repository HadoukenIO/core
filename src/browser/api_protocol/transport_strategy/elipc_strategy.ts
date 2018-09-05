import { AckMessage, AckFunc, AckPayload } from './ack';
import { ApiTransportBase, MessagePackage } from './api_transport_base';
import { default as RequestHandler } from './base_handler';
import { Endpoint, ActionMap } from '../shapes';
import { Identity } from '../../../shapes';

declare var require: any;

const coreState = require('../../core_state');
const electronIpc = require('../../transports/electron_ipc');
const system = require('../../api/system').System;

// this represents the future default behavior, here its opt-in
const frameStrategy = coreState.argo.framestrategy;
const bypassLocalFrameConnect = frameStrategy === 'frames';

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
                    // If --framestrategy=frames is set, short circuit the checks. This will
                    // allow calls from all frames through with iframes getting auto named
                    if (bypassLocalFrameConnect ||
                        !data.singleFrameOnly === false ||
                        e.sender.isValidWithFrameConnect(e.frameRoutingId)) {
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
                        nack('API access has been superseded by another frame in this window.');
                    }
                }
            }
        });
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

        const { browserWindow, frameRoutingId } = routingInfo;
        const payload = JSON.stringify(payloadObj);
        const browserWindowLocated = browserWindow;
        const browserWindowExists = !browserWindow.isDestroyed();
        const validRoutingId = typeof frameRoutingId === 'number';
        const canTrySend = browserWindowLocated && browserWindowExists && validRoutingId;

        if (!canTrySend) {
            system.debugLog(1, `uuid:${uuid} name:${name} frameRoutingId:${frameRoutingId} not reachable, payload:${payload}`);
        } else if (frameRoutingId === routingInfo.mainFrameRoutingId) {
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

    //TODO: this needs to be refactor at some point.
    public onClientAuthenticated(cb: Function): void {
        throw new Error('Not implemented');
    }

    //TODO: this needs to be refactor at some point.
    public onClientDisconnect(cb: Function): void {
        throw new Error('Not implemented');
    }

    protected onMessage(e: any, rawData: any): void {

        try {
            const data = JSON.parse(JSON.stringify(rawData));
            const ack = !data.isSync ? this.ackDecorator(e, data.messageId, data) : this.ackDecoratorSync(e, data.messageId);
            const nack = this.nackDecorator(ack);
            const browserWindow = e.sender.getOwnerBrowserWindow();
            const currWindow = browserWindow ? coreState.getWinById(browserWindow.id) : null;
            const openfinWindow = currWindow && currWindow.openfinWindow;
            const opts = openfinWindow && openfinWindow._options || {};
            const subFrameName = bypassLocalFrameConnect ? e.sender.getFrameName(e.frameRoutingId) : null;
            const identity = {
                name: subFrameName || opts.name,
                uuid: opts.uuid,
                parentFrame: opts.name,
                entityType: e.sender.getEntityType(e.frameRoutingId)
            };

            /* tslint:disable: max-line-length */
            //message payload might contain sensitive data, mask it.
            const disableIabSecureLogging = coreState.getAppObjByUuid(opts.uuid)._options.disableIabSecureLogging;
            const replacer = (!disableIabSecureLogging && (data.action === 'publish-message' || data.action === 'send-message')) ? this.payloadReplacer : null;
            system.debugLog(1, `received in-runtime${data.isSync ? '-sync ' : ''}: ${e.frameRoutingId} [${identity.uuid}]-[${identity.name}] ${JSON.stringify(data, replacer)}`);
            /* tslint:enable: max-line-length */


            this.requestHandler.handle({
                identity, data, ack, nack, e,
                strategyName: this.constructor.name
            });

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

    private addBreadcrumb(message: any,  messageId: number, action: string, name: string): void {
        if (message && message.breadcrumbs && message.breadcrumbs.length) {
            message.breadcrumbs.push({
                action,
                messageId,
                name,
                time: Date.now()
            });
        }
    }

    protected ackDecorator(e: any, messageId: number, originalPayload: any): AckFunc {
        const ackObj = new AckMessage();
        ackObj.correlationId = messageId;

        // It is inferred that breadcrumbs have been enabled for a window
        // when the breadcrumb array is present in the original payload of the API request.
        const usingBreadcrumbs = originalPayload.breadcrumbs && originalPayload.breadcrumbs.length;

        if (usingBreadcrumbs) {
            ackObj.breadcrumbs = originalPayload.breadcrumbs;
            this.addBreadcrumb(ackObj, messageId, originalPayload.action, 'core/ackDecorator');
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
                    this.addBreadcrumb(ackObj, messageId, originalPayload.action, 'core/ACK');
                }

                e.sender.sendToFrame(e.frameRoutingId, electronIpc.channels.CORE_MESSAGE, JSON.stringify(ackObj));
            }
        };

    }
}
