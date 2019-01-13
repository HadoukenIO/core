const http = require('http');
const EventEmitter = require('events').EventEmitter;
const log = require('../log');
const idPool = require('../int_pool').default;
import route from '../../common/route';

class Server extends EventEmitter {
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

    getPort() {
        return (this.httpServer.address() || {
            port: null
        }).port;
    }

    publish(message) {
        let usedIds = Object.keys(this.activeConnections);
        usedIds.forEach((id) => {
            if (this.activeConnections[id]) {
                this.activeConnections[id].send(message);
            }
        });
    }

    send(id, message) {
        if (this.activeConnections[id]) {
            this.activeConnections[id].send(message);
        }
    }

    closeAllConnections() {
        let usedIds = Object.keys(this.activeConnections);
        usedIds.forEach((id) => {
            if (this.activeConnections[id]) {
                this.activeConnections[id].close();
            }
        });
    }

    closeConnection(id) {
        if (this.activeConnections[id]) {
            // Removed from map on close event
            this.activeConnections[id].close();
        }
    }

    start(port) {
        if (this.hasStarted && !this.httpServerError) {
            log.writeToLog(1, 'socket server already running', true);
            return;
        }

        this.httpServer.listen(port, '127.0.0.1', () => {
            if (this.httpServerError) {
                this.httpServerError = false;
                return;
            }

            let WebSocketServer = require('ws').Server,
                wss = new WebSocketServer({
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
                let id = idPool.next();
                this.activeConnections[id] = ws;
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
                    console.log('Opened ', id);
                    this.emit(route.connection('open'), id);
                });

                ws.on('message', (data, flags) => {
                    this.emit(route.connection('message'), id, JSON.parse(data), flags);
                });
            });

            this.emit(route.server('open'), this.getPort());
        });

        this.hasStarted = true;
    }

    connectionAuthenticated(id, uuid) {
        this.emit(route.connection('authenticated'), {
            id,
            uuid
        });
    }

    isConnectionOpen(id) {
        const socket = this.activeConnections[id];
        return typeof socket === 'object' && socket.readyState === socket.OPEN;
    }
}

module.exports = {
    server: new Server()
};
