import { app } from 'electron';
import { unlink } from 'fs';
import { exec } from 'child_process';

// we need to use require here because unix-dgram is an optional dependency
// and is only available on unix systems. import does a static check and
// will not compile if the module isn't present at time of compilation
const unixDgram = process.platform === 'win32' ? {} : require('unix-dgram');

import BaseTransport from './base';
import * as log from '../log';

type FileDescriptor = string;

interface Socket {
    close: () => void;
    bind: (name: string) => void;
    on: (event: string, callback?: (...args: any[]) => void) => void;
    send: (buffer: Buffer, offset: number, length: number, path: FileDescriptor) => void;
}

class UnixDomainSocket extends BaseTransport {
    private filenamePrefix: string;
    private serverName: FileDescriptor;
    private server: Socket;

    constructor(filenamePrefix: string) {
        super();

        this.filenamePrefix = filenamePrefix;
        this.serverName = filenamePrefix + Date.now();
        this.server = unixDgram.createSocket('unix_dgram', (buffer: Buffer) => {
            this.eventEmitter.emit('message', null, buffer);
        });
        this.server.on('listening', () => {
            log.writeToLog(1, `Now listening on the unix domain socket: ${this.serverName}`, true);
        });
        this.server.bind(this.serverName);

        // Not 100% sure why I need to use bind() here, but when I try to call
        // this.server.close() in this.cleanUpServer(), it throws an error
        // saying that this.server is undefined.
        app.on('window-all-closed', this.cleanUpServer.bind(this, this.server));
    }

    public publish(data: any): boolean {
        const message = new Buffer(JSON.stringify(data));
        this.getFileDescriptors().then((fds: FileDescriptor[]) => {
            fds
                .filter((fd: FileDescriptor) => fd !== this.serverName)
                .forEach((fd: FileDescriptor) => {
                    log.writeToLog(1, `Sending a unix domain socket transport message to ${fd}`, true);
                    const client: Socket = unixDgram.createSocket('unix_dgram');
                    client.send(message, 0, message.length, fd);
                    client.close();
                });
        });
        return true;
    }

    private cleanUpServer(server: Socket): void {
        log.writeToLog(1, 'Cleaning up unix domain socket transport', true);
        server.close();
        unlink(this.serverName);
    }

    private getFileDescriptors(): Promise<FileDescriptor[]> {
        return new Promise<FileDescriptor[]>((resolve) => {
            exec(`lsof -U | grep ${this.filenamePrefix}`, (error, stdout) => {
                if (error) {
                    log.writeToLog(1, '[unix domain socket] begin exec error', true);
                    log.writeToLog(1, error, true);
                    log.writeToLog(1, '[unix domain socket] end exec error', true);
                    return resolve([]);
                }
                resolve(this.parseOutput(stdout));
            });
        });
    }

    private parseOutput(output: string): FileDescriptor[] {
        return output
            .split(/\n/)
            .filter(line => line.length)
            .map(line => line.split(/\s+/).find(word => word.startsWith(this.filenamePrefix)));
    }
}

export default UnixDomainSocket;
