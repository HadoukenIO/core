import * as http from 'http';
import { EventEmitter } from 'events';
import * as WebSocket from 'ws';
import { AddressInfo } from 'net';

import * as log from '../log';
import idPool from '../int_pool';
import route from '../../common/route';

import { System } from '../api/system.js';

class Server extends EventEmitter {
    private hasStarted: boolean;
    private activeConnections: { [id: string]: WebSocket };
    private httpServer: http.Server;
    private httpServerError: boolean;

    constructor() {
        super();

        this.hasStarted = false;
        this.activeConnections = {};
        this.httpServer = http.createServer((req, res) => {
            res.writeHead(403, {
                'Content-Type': 'text/plain'
            });
            res.end('');
        });
        this.httpServerError = false;

        this.httpServer.on('error', (err) => {
            this.httpServerError = true;
            this.emit(route.server('error'), err);
        });
    }

    public getPort(): number {
        const serverAddress = <AddressInfo>this.httpServer.address();

        return (serverAddress && serverAddress.port) || null;
    }

    public publish(message: string) {
        const usedIds = Object.keys(this.activeConnections);
        usedIds.forEach((id) => {
            if (this.activeConnections[id]) {
                this.activeConnections[id].send(message);
            }
        });
    }

    public send(id: number, message: string) {
        if (this.activeConnections[id]) {
            this.activeConnections[id].send(message);
        }
    }

    public closeAllConnections() {
        const usedIds = Object.keys(this.activeConnections);
        usedIds.forEach((id) => {
            if (this.activeConnections[id]) {
                this.activeConnections[id].close();
            }
        });
    }

    public closeConnection(id: number) {
        if (this.activeConnections[id]) {
            // Removed from map on close event
            this.activeConnections[id].close();
        }
    }

    public start(port: number) {
        if (this.hasStarted && !this.httpServerError) {
            log.writeToLog(1, 'socket server already running', true);
            return;
        }

        this.httpServer.listen(port, '127.0.0.1', () => {
            if (this.httpServerError) {
                this.httpServerError = false;
                return;
            }

            const wss = new WebSocket.Server({
                server: this.httpServer
            });

            wss.on('headers', (headers) => {
                this.emit(route.server('headers'), headers);
            });

            wss.on('error', (err) => {
                this.httpServerError = true;
                this.emit(route.server('error'), err);
            });

            wss.on('connection', (ws) => {
                const id = idPool.next();
                this.activeConnections[id] = <WebSocket>ws;
                // Unused events
                // ping
                // pong

                ws.on('error', (error) => {
                    this.emit(route.connection('error'), id, error);
                });

                ws.on('close', ( /*code,message*/ ) => {
                    delete this.activeConnections[id];
                    idPool.release(id);
                    ws = null;
                    this.emit(route.connection('close'), id);
                });

                ws.on('open', ( /*open*/ ) => {
                    this.emit(route.connection('open'), id);
                });

                ws.on('message', (data, flags) => {

                    const parsedData = JSON.parse(data);
                    const payloadSize = data.length;

                    if (parsedData.action === 'publish-message' || parsedData.action === 'send-message') {
                        /* tslint:disable: max-line-length */
                        System.debugLog(1, `received external-adapter <= ${id} action: ${parsedData.action}, payload: ***masked-payload***, messageId: ${parsedData.messageId}  | Size: ${payloadSize}`);
                        /* tslint:enable: max-line-length */
                    } else {
                        System.debugLog(1, `received external-adapter <= ${id} ${data} | Size: ${payloadSize}`);
                    }

                     this.emit(route.connection('message'), id, parsedData, flags);

                });
            });

            this.emit(route.server('open'), this.getPort());
        });

        this.hasStarted = true;
    }

    public connectionAuthenticated(id: number, uuid: string) {
        this.emit(route.connection('authenticated'), {
            id,
            uuid
        });
    }

    public isConnectionOpen(id: number) {
        const socket = this.activeConnections[id];
        return typeof socket === 'object' && socket.readyState === socket.OPEN;
    }
}

export default new Server();
