import { AckMessage, AckFunc, AckPayload } from './ack';
import { ApiTransportBase, MessagePackage } from './api_transport_base';
import { default as RequestHandler } from './base_handler';
import { Endpoint, ActionMap } from '../shapes';
import { Identity } from '../../../shapes';
import { writeToLog } from '../../log';
declare var require: any;

const coreState = require('../../core_state');
const electronIpc = require('../../transports/electron_ipc');
const system = require('../../api/system').System;

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

    protected onMessage(e: any, rawData: any): void {

        try {
            const data = JSON.parse(JSON.stringify(rawData));
            const ack = !data.isSync ? this.ackDecorator(e, data.messageId) : this.ackDecoratorSync(e, data.messageId);
            const nack = this.nackDecorator(ack);
            const browserWindow = e.sender.getOwnerBrowserWindow();
            const currWindow = browserWindow ? coreState.getWinById(browserWindow.id) : null;
            const openfinWindow = currWindow && currWindow.openfinWindow;
            const opts = openfinWindow && openfinWindow._options;

            if (!opts) {
                throw new Error(`Unable to locate window information for endpoint with window id ${browserWindow.id}`);
            }

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
                name: subFrameName,
                uuid: opts.uuid,
                parentFrame: opts.name,
                entityType
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

    protected ackDecorator(e: any, messageId: number): AckFunc {
        const ackObj = new AckMessage();
        ackObj.correlationId = messageId;

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
                e.sender.sendToFrame(e.frameRoutingId, electronIpc.channels.CORE_MESSAGE, JSON.stringify(ackObj));
            }
        };

    }
}
