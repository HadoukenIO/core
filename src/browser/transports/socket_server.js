/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
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
        if (hasStarted) {
            log.writeToLog(1, 'socket server already running');
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
};

util.inherits(Server, EventEmitter);

module.exports = {
    server: new Server()
};
