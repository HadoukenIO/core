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
const http = require('http');
const EventEmitter = require('events').EventEmitter;
const util = require('util');
const log = require('../log');
import route from '../../common/route';


let Server = function() {
    let me = this;
    EventEmitter.call(this);

    let hasStarted = false;
    let activeConnections = {};
    let idPool = require('../int_pool').default;
    let httpServer = http.createServer(function(req, res) {
        res.writeHead(403, {
            'Content-Type': 'text/plain'
        });
        res.end('');
    });
    let httpServerError = false;

    httpServer.on('error', function(err) {
        httpServerError = true;
        me.emit(route.server('error'), err);
    });

    me.getPort = function() {
        return (httpServer.address() || {
            port: null
        }).port;
    };

    me.publish = function(message) {
        let usedIds = Object.keys(activeConnections);
        usedIds.forEach(function(id) {
            if (activeConnections[id]) {
                activeConnections[id].send(message);
            }
        });
    };

    me.send = function(id, message) {
        if (activeConnections[id]) {
            activeConnections[id].send(message);
        }
    };

    me.closeAllConnections = function() {
        let usedIds = Object.keys(activeConnections);
        usedIds.forEach(function(id) {
            if (activeConnections[id]) {
                activeConnections[id].close();
            }
        });
    };

    me.closeConnection = function(id) {
        if (activeConnections[id]) {
            // Removed from map on close event
            activeConnections[id].close();
        }
    };

    me.start = function(port) {
        if (hasStarted && !httpServerError) {
            log.writeToLog(1, 'socket server already running', true);
            return;
        }

        httpServer.listen(port, '127.0.0.1', function() {
            if (httpServerError) {
                httpServerError = false;
                return;
            }

            let WebSocketServer = require('ws').Server,
                wss = new WebSocketServer({
                    server: httpServer
                });

            wss.on('headers', function(headers) {
                me.emit(route.server('headers'), headers);
            });

            wss.on('error', function(err) {
                httpServerError = true;
                me.emit(route.server('error'), err);
            });

            wss.on('connection', function connection(ws) {
                let id = idPool.next();
                activeConnections[id] = ws;
                // Unused events
                // ping
                // pong

                ws.on('error', function(error) {
                    me.emit(route.connection('error'), id, error);
                });

                ws.on('close', function( /*code,message*/ ) {
                    delete activeConnections[id];
                    idPool.release(id);
                    ws = null;
                    me.emit(route.connection('close'), id);
                });

                ws.on('open', function( /*open*/ ) {
                    console.log('Opened ', id);
                    me.emit(route.connection('open'), id);
                });

                ws.on('message', function incoming(data, flags) {
                    me.emit(route.connection('message'), id, JSON.parse(data), flags);
                });
            });

            me.emit(route.server('open'), me.getPort());
        });

        hasStarted = true;
    };

    me.connectionAuthenticated = function(id, uuid) {
        me.emit(route.connection('authenticated'), {
            id,
            uuid
        });
    };

    me.isConnectionOpen = function(id) {
        const socket = activeConnections[id];
        return typeof socket === 'object' && socket.readyState === socket.OPEN;
    };
};

util.inherits(Server, EventEmitter);

module.exports = {
    server: new Server()
};
