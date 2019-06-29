import { app } from 'electron';
import { unlink } from 'fs';
import { exec } from 'child_process';

// we need to use require here because unix-dgram is an optional dependency
// and is only available on unix systems. import does a static check and
// will not compile if the module isn't present at time of compilation
const unixDgram = process.platform === 'win32' ? {} : require('unix-dgram');

import BaseTransport from './base';
import * as coreState from '../core_state';
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

        const version: string = coreState.argo['version-keyword'];
        const securityRealm: string = coreState.argo['security-realm'] || '';
        this.filenamePrefix = filenamePrefix;
        // e.g. /some/prefix/string.<version>.<optional security realm>.<unix timestamp>.<pid>
        this.serverName = `${filenamePrefix}.${version}.${securityRealm ? securityRealm + '.' : ''}.${Date.now()}.${process.pid}`;
        this.server = unixDgram.createSocket('unix_dgram', (buffer: Buffer) => {
            this.eventEmitter.emit('message', null, buffer);
        });
        this.server.on('listening', () => {
            log.writeToLog(1, `Now listening on the unix domain socket: ${this.serverName}`, true);
        });
        this.server.bind(this.serverName);

        app.on('quit', this.cleanUpServer);

        // Clean up abandoned file descriptors
        Promise.all([this.getAllFileDescriptors(), this.getOpenFileDescriptors()]).then((values: [FileDescriptor[], FileDescriptor[]]) => {
            values[0]
                .filter((fd: FileDescriptor) => !values[1].includes(fd))
                .forEach((fd: FileDescriptor) => {
                    log.writeToLog(1, `Removing abandoned file descriptor ${fd}`, true);
                    unlink(fd, (err) => {
                        if (err) {
                            log.writeToLog(1, '[unix domain socket] begin unlink error', true);
                            log.writeToLog(1, err, true);
                            log.writeToLog(1, '[unix domain socket] end unlink error', true);
                            return;
                        }
                        log.writeToLog(1, `${fd} was deleted`, true);
                    });
                });
        });
    }

    public publish(data: any): boolean {
        const message = new Buffer(JSON.stringify(data));
        this.getOpenFileDescriptors().then((fds: FileDescriptor[]) => {
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

    private cleanUpServer = () => {
        log.writeToLog(1, 'Cleaning up unix domain socket transport', true);
        this.server.close();
        unlink(this.serverName, (err) => {
            if (err) {
                log.writeToLog(1, '[unix domain socket] begin unlink error', true);
                log.writeToLog(1, err, true);
                log.writeToLog(1, '[unix domain socket] end unlink error', true);
                return;
            }
            log.writeToLog(1, `${this.serverName} was deleted`, true);
        });
    }

    // Includes all file descriptors, including ones that may have been abandoned on runtime crashes
    private getAllFileDescriptors(): Promise<FileDescriptor[]> {
        return new Promise<FileDescriptor[]>((resolve) => {
            exec(`/bin/ls ${this.filenamePrefix}*`, (error, stdout) => {
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

    // Includes only file descriptors that are currently open
    private getOpenFileDescriptors(): Promise<FileDescriptor[]> {
        return new Promise<FileDescriptor[]>((resolve) => {
            exec(`/usr/sbin/lsof -U | /usr/bin/grep ${this.filenamePrefix}`, (error, stdout) => {
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
