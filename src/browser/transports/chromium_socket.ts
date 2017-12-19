/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/

import {net} from 'electron';
import {parse as parseUrl, format as formatUrl, Url} from 'url';
import * as log from '../log';
import ofEvents from '../of_events';
import route from '../../common/route';

import * as nodeNet from 'net';

interface RequestProtocol {
    port: number;
    secureProtocol?: string;   // secure version of the protocol
    chromiumProtocol?: string; // protocol Chromium network layer should use to create connection
    httpGet?: boolean;         // true: to retrieve data and write it to proxy socket
}

const ProtocolMap: { [index: string]: RequestProtocol } = {
    // tslint:disable-next-line:no-http-string
    'rtmp:' :  { port: 1935, secureProtocol: 'rtmps:',  chromiumProtocol: 'http:'},
    // tslint:disable-next-line:no-http-string
    'rtmps:' : { port: 443,  chromiumProtocol: 'https:'},
    // tslint:disable-next-line:no-http-string
    'http:' : { port: 80,  secureProtocol: 'https:'},
    // tslint:disable-next-line:no-http-string
    'https:' : { port: 443 }
};

enum ProxyEventType {
    Open = 1,       // proxy socket connected
    Listening,      // proxy socket starts listening to a port
    ProxyData,      // data from proxy socket
    ChromiumData,   // data from Chromium socket
    Closed
}

interface ProxyEvent {
    eventType: ProxyEventType;
    port?: number;
    payload?: Buffer;
    clientSocket?: nodeNet.Socket;
}

interface ProxyAuthEvent {
    url: string;
    isProxy: boolean;
}

const requestMap: { [url: string]: any } = {};  // map of URL to net.request
const expectedStatusCode = /^[23]/; // 2xx & 3xx status codes are okay

export interface CreateProxyResponse {
    success: boolean;
    data?: {port?: number, originalUrl: string}; // port# on localhost
}

export interface CreateProxyRequest {
    url: string;            // URL to proxy requests to
    httpGet?: boolean;      // true: to retrieve data and write it to proxy socket
    callback: (result: CreateProxyResponse) => void;
    errorCallback: (err: any) => void;
}

export interface AuthProxyRequest {
    url: string; // URL for the original CreateProxyRequest
    username: string;
    password: string;
}

export function createChromiumSocket(req: CreateProxyRequest): void {
    log.writeToLog(1, `createChromiumSocket: ${JSON.stringify(req)}`, true);
    if (req.httpGet === true) {
        createHttpProxySocket(req);
    } else {
        createFullProxySocket(req);
    }
}

function mapUrl(originalUrl: Url): Url {
    const mappedUrl: Url = parseUrl(formatUrl(originalUrl));
    if (ProtocolMap.hasOwnProperty(originalUrl.protocol)) {
        const reqProtocol: RequestProtocol = ProtocolMap[originalUrl.protocol];
        if (reqProtocol.chromiumProtocol) {
            mappedUrl.protocol = reqProtocol.chromiumProtocol;
            // in case of http://host:443/...   Yes, it does happen
            if (originalUrl.port === '443' && reqProtocol.secureProtocol) {
                log.writeToLog(1, `applying secure protocol: ${reqProtocol.secureProtocol}`, true);
                if (ProtocolMap.hasOwnProperty(reqProtocol.secureProtocol)) {
                    mappedUrl.protocol = ProtocolMap[reqProtocol.secureProtocol].chromiumProtocol;
                }
            }
        }
    }
    return mappedUrl;
}

/**
 * Create a socket for a client which makes a http GET request and data is
 * written to the socket
 *
 * @param {CreateProxyRequest} req
 */
function createHttpProxySocket(req: CreateProxyRequest): void {
    startProxyConnection((event: ProxyEvent) => {
        if (event.eventType === ProxyEventType.Open) {
            const proxySocket: nodeNet.Socket = event.clientSocket;
            fetchFromURL(req.url, proxySocket, (resp: any) => {
                log.writeToLog(1, `done with fetching URL ${req.url} ${JSON.stringify(resp)}`, true);
                proxySocket.end();
            }, e => {
                log.writeToLog(1, `Error from fetching URL ${req.url}: ${e}`, true);
                proxySocket.end();
            });
        }
        onHttpProxyConnectionEvent(event, req);
    });
}

function onHttpProxyConnectionEvent(event: ProxyEvent, proxyReq: CreateProxyRequest): void {
    if (event.eventType === ProxyEventType.ProxyData) {
        // support GET only, so should not receive data from the proxy socket
        log.writeToLog(1, `ignoring data from proxy socket: ${event.payload.length}`, true);
    } else if (event.eventType === ProxyEventType.ChromiumData) {
        const flushed: boolean = event.clientSocket.write(event.payload);
        log.writeToLog(1, `proxy socket input chromium data: ${event.payload.length} flushed ${flushed}`, true);
    } else if (event.eventType === ProxyEventType.Closed) {
        log.writeToLog(1, 'close chromium socket', true);
    } else if (event.eventType === ProxyEventType.Listening) {
        // setting mappedUrl.port does not work.  Have to append to host
        proxyReq.callback({success: true, data: {port: event.port, originalUrl: proxyReq.url}});
    }
}

function fetchFromURL(url: string, proxySocket: nodeNet.Socket, done: (resp: any) => void, onError: (err: Error) => void ): void {
    let contentSize: number = 0;
    const request = net.request(url);
    request.once('response', (response: any) => {
        const { statusCode } = response;
        log.writeToLog(1, `fetchURL statusCode: ${statusCode} for ${url}`, true);
        if (!expectedStatusCode.test(statusCode)) {
            const error = new Error(`Failed to download resource. Status code: ${statusCode}`);
            onError(error);
        }
        response.once('error', (err: Error) => {
            onError(err);
        });
        response.on('data', (chunk: Buffer) => {
            log.writeToLog(1, `data from ${url} ${chunk.length}`, true);
            contentSize += chunk.length;
            proxySocket.write(chunk);
        });
        response.on('end', () => {
            log.writeToLog(1, `done from ${url}`, true);
            done({contentSize});
        });
    });
    request.once('login', (authInfo: any, callback: Function) => {
        log.writeToLog(1, `fetchURL login event ${url}`, true);
        callback();
    });
    request.once('error', (err: Error) => {
        onError(err);
    });
    request.end();
}

function onFullProxyConnectionEvent(event: ProxyEvent, request: any, proxyReq: CreateProxyRequest): void {
    if (event.eventType === ProxyEventType.ProxyData) {
        log.writeToLog(1, `proxy socket output chromium data: ${event.payload.length}`, true);
        request.writeSocket(event.payload);
    } else if (event.eventType === ProxyEventType.ChromiumData) {
        const flushed: boolean = event.clientSocket.write(event.payload);
        log.writeToLog(1, `proxy socket input chromium data: ${event.payload.length} flushed ${flushed}`, true);
//                log.writeToLog(1, `proxy socket input chromium data: ${data.toString('utf8')}`, true);
    } else if (event.eventType === ProxyEventType.Closed) {
        log.writeToLog(1, 'close chromium socket', true);
        request.closeSocket();
    } else if (event.eventType === ProxyEventType.Listening) {
        proxyReq.callback({success: true, data: {port: event.port, originalUrl: proxyReq.url}});
    }
}

/**
 * Create a socket for a client which takes complete control of data flow, such as RTMP
 * This function ask Chromium (via net module) to create a data socket first.  Once connected,
 * It creates the proxy socket, binding to localhost:somePort, and return port#
 *
 * @param {CreateProxyRequest} req
 */
function createFullProxySocket(req: CreateProxyRequest): void {
    const originalUrl: Url = parseUrl(req.url);
    const mappedUrl: Url = mapUrl(originalUrl);
    const url: string = formatUrl(mappedUrl);
    // ask net module to create the data socket
    const request = net.request({ url, dataSocket: true });
    requestMap[req.url] = request;
    // fired when Chromium socket is connected
    request.on('requestSocketConnected', (response: any) => {
        log.writeToLog(1, 'requestSocketConnected', true);
        let clientConn: nodeNet.Socket;
        const server: nodeNet.Server = startProxyConnection((event: ProxyEvent) => {
            if (event.eventType === ProxyEventType.Open) {
                clientConn = event.clientSocket;
            }
            onFullProxyConnectionEvent(event, request, req);
        });
        // data from Chromium socket
        response.on('data', (data: Buffer) => {
            onFullProxyConnectionEvent({eventType: ProxyEventType.ChromiumData, payload: data, clientSocket: clientConn},
                request, req);
        });
        // error from Chromium socket
        response.on('error', (err: string) => {
            log.writeToLog(1, `proxy socket response error: ${err}`, true);
            server.close();
        });

    });
    request.on('socketAuthRequired', (event: ProxyAuthEvent) => {
        log.writeToLog(1, `proxy socket auth requested: ${event.url}`, true);
        ofEvents.emit(route.system('proxy-socket-auth-requested'), {url: event.url, isProxy: event.isProxy});
    });
    request.on('error', (err: string) => {
        log.writeToLog(1, `proxy socket request error ${err}`, true);
        request.closeSocket();
        if (req.errorCallback) {
            req.errorCallback(err);
        }
    });
    request.on('close', () => {
        log.writeToLog(1, `proxy socket request closed, clean up ${req.url}`, true);
        delete requestMap[req.url];
    });
    request.createConnection();
}

/**
 * Start a node server on localhost as connection proxy
 *
 * @param {(data: any) => void} proxyCallback
 * @param response returned by requestSocketConnected event
 *
 */
function startProxyConnection(proxyCallback: (event: ProxyEvent) => void): nodeNet.Server {
    let clientConn: nodeNet.Socket; // only one connection is allowed per proxy socket
    const server: nodeNet.Server = nodeNet.createServer((conn: nodeNet.Socket) => {
        if (!clientConn) {
            log.writeToLog(1, `proxy socket new connection ${conn.localPort}`, true);
            clientConn = conn;
            conn.on('data', (data) => {
                log.writeToLog(1, `proxy socket input data ${data.length}`, true);
                proxyCallback({eventType: ProxyEventType.ProxyData, payload: data, clientSocket: conn});
            });
            conn.on('close', (hadError: boolean) => {
                log.writeToLog(1, `proxy socket closed ${hadError}`, true);
                server.close();
                proxyCallback({eventType: ProxyEventType.Closed, clientSocket: conn});
            });
            conn.on('end', () => {
                log.writeToLog(1, 'proxy socket ended', true);
            });
            conn.on('timeout', () => {
                log.writeToLog(1, 'proxy socket timeout', true);
            });
            conn.on('error', (err) => {
                log.writeToLog(1, `proxy socket connect error ${err}`, true);
                // according to the doc, 'close' event will come next
            });
            proxyCallback({eventType: ProxyEventType.Open, clientSocket: conn});
        } else {
            log.writeToLog(1, `proxy socket duplicate connection: ${JSON.stringify(server.address())}`, true);
            conn.end();
        }
    });
    server.maxConnections = 1;  //only one connection for each proxy
    server.on('listening', () => {
        log.writeToLog(1, `proxy server info ${JSON.stringify(server.address())}`, true);
        proxyCallback({eventType: ProxyEventType.Listening, port: server.address().port});
    });
    server.on('close', () => {
        log.writeToLog(1, 'proxy server closed', true);
        proxyCallback({eventType: ProxyEventType.Closed});
    });
    server.on('error', (err) => {
        log.writeToLog(1, `proxy server error ${err}`, true);
        server.close();
    });
    server.listen(0, 'localhost');
    return server;
}

export function authenticateChromiumSocket(req: AuthProxyRequest): void {
    const request = requestMap[req.url];
    if (request) {
        log.writeToLog(1, `proxy socket auth ${req.url}`, true);
        request.authenticateSocket(req.username, req.password);
    } else {
        log.writeToLog(1, `proxy socket auth missing request ${req.url}`, true);
    }
}
