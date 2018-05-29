import { app } from 'electron';
import { unlink } from 'fs';
import { exec } from 'child_process';

// we need to use require here because unix-dgram is an optional dependency
// and is only available on unix systems. import does a static check and
// will not compile if the module isn't present at time of compilation
const unixDgram = process.platform === 'win32' ? {} : require('unix-dgram');

import BaseTransport from './base';

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
        this.server.bind(this.serverName);

        app.on('will-quit', this.cleanUpServer);

        process.on('SIGINT', this.cleanUpServer);
    }

    public publish(data: any): boolean {
        const message = new Buffer(JSON.stringify(data));
        this.getFileDescriptors().then((fds: FileDescriptor[]) => {
            fds
                .filter((fd: FileDescriptor) => fd !== this.serverName)
                .forEach((fd: FileDescriptor) => {
                    const client: Socket = unixDgram.createSocket('unix_dgram');
                    client.send(message, 0, message.length, fd);
                    client.close();
                });
        });
        return true;
    }

    private cleanUpServer(): void {
        this.server.close();
        unlink(this.serverName);
    }

    private getFileDescriptors(): Promise<FileDescriptor[]> {
        return new Promise<FileDescriptor[]>((resolve) => {
            exec(`lsof -U | grep ${this.filenamePrefix}`, (error, stdout) => {
                if (error) {
                    console.error(`exec error: ${error}`);
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
