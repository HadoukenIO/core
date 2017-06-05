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
let fs = require('fs');
let path = require('path');

let eApp = require('electron').app;
let ExternalProcess = require('electron').externalProcess;
let ProcessMonitor = require('electron').processMonitor;

import ofEvents from './of_events';
import route from '../common/route';

const isWin32 = (process.platform === 'win32');

function ProcessTracker() {

    // map of pids to process objects
    this._processes = {};
    // map of uuids to pids
    this._uuidToPid = {};
    // map of windows to process uuids
    this._windowToUuids = {};
    // NOTE: The ProcessMonitor module lives for the entirety of the runtime, so
    // there's no need to unhook this listener
    this._processMonitor = new ProcessMonitor();
    this._processMonitor.on('process-terminated', (event, handle, pid, exitCode) => {
        var winUuid = this._processes[pid].window.uuid;
        var winName = this._processes[pid].window.name;
        var uuid = this._processes[pid].uuid;

        var result = {
            exitCode,
            processUuid: uuid,
        };

        ofEvents.emit(route.externalApplication('exited', uuid), Object.assign(result, {
            topic: 'external-application',
            type: 'exited'
        }));

        ofEvents.emit(route.window('external-process-exited', winUuid, winName), Object.assign(result, {
            uuid: winUuid,
            name: winName,
            topic: 'window',
            type: 'external-process-exited'
        }));

        this._cleanup(pid, uuid);
    });

    ofEvents.on(route.window('synth-close', '*'), payload => {
        if (this._windowToUuids[payload.source]) {
            let processes = this._windowToUuids[payload.source].slice(0);
            processes.forEach(uuid => {
                this.terminate(uuid, 500, true);
            });
        }
    });
}

ProcessTracker.prototype.launch = function(identity, options, errDataCallback) {
    let eProcess = new ExternalProcess();
    let procObj;

    var uuid = options.uuid || generateUuid();

    let success = (data) => {
        var windowUuid = identity.uuid;
        var windowName = identity.name;

        errDataCallback(undefined, data);

        ofEvents.emit(route.externalApplication('started', data.uuid), {
            uuid: data.uuid,
            topic: 'external-application',
            type: 'started'
        });

        ofEvents.emit(route.window('external-process-started', windowUuid, windowName), {
            uuid: windowUuid,
            name: windowName,
            topic: 'window',
            type: 'external-process-started',
            processUuid: data.uuid
        });
    };

    let error = (errObj) => {
        eApp.vlog(1, errObj);
        errDataCallback(errObj, undefined);
    };

    let withDefaultCertOptions = (certOptions) => {
        return Object.assign({
            publicKey: '',
            serial: '',
            subject: '',
            thumbprint: '',
            trusted: false
        }, certOptions);
    };

    let validateCertificate = (filePath, certOptions) => {
        let response = {
            publicKey: true,
            serial: true,
            subject: true,
            thumbprint: true,
            trusted: true,
            error: undefined
        };

        // Windows only
        if (isWin32) {
            let checkSignatureAndUpdateForError = (nativeSubject, key) => {
                let valueKey = key || nativeSubject;
                response[valueKey] = true;
                let value = certOptions[valueKey];
                if (value) {
                    if (!eApp.compareFileSignature(filePath, nativeSubject, value)) {
                        response.error = (response.error || '') + `${valueKey} does not match. `;
                        response[valueKey] = false;
                    }
                }
            };

            if (certOptions.trusted) {
                let result = eApp.verifyFileSignature(filePath, 1, 0x10);
                if (result !== 'success') {
                    response.trusted = false;
                    response.error = `${result}. `;
                }
            }

            checkSignatureAndUpdateForError('publickey', 'publicKey');
            checkSignatureAndUpdateForError('serial');
            checkSignatureAndUpdateForError('subject');
            checkSignatureAndUpdateForError('thumbprint');
        }

        return response;
    };

    let launchProcess = (fpath, args, cwd, certOpts) => {
        let certResult = validateCertificate(fpath, certOpts);
        if (!certResult.error) {
            fpath = expandEnvironmentVars(fpath);
            args = expandEnvironmentVars(args);
            cwd = expandEnvironmentVars(cwd);

            let parentWindowUuidName = getParentWindowUuidName(identity, options.lifetime);

            procObj = eProcess.launch(fpath, cwd, args, !!parentWindowUuidName);

            if (!procObj) {
                return error(`Error attempting to launch '${fpath}'.`);
            }

            if (parentWindowUuidName) {
                let processes = this._windowToUuids[parentWindowUuidName] || [];
                processes.push(uuid);
                this._windowToUuids[parentWindowUuidName] = processes;
            }

            this._processMonitor.add(procObj);

            this._processes[procObj.id] = {
                process: procObj,
                window: identity,
                lifetime: options.lifetime,
                uuid,
                monitor: true
            };

            this._uuidToPid[uuid] = procObj.id;

            success({
                uuid
            });

        } else {
            error(certResult.error);
        }
    };

    if (this._uuidToPid[uuid]) {
        return error(`Process with specified UUID already exists: ${uuid}`);
    }

    // app asset request
    if (options.alias) {
        // Fetch app asset from RVM
        var appAssetsFetcher = require('./rvm/runtime_initiated_topics/app_assets').appAssetsFetcher;
        appAssetsFetcher.fetchAppAsset(options.srcUrl, options.alias, (aliasJsonObject) => {
            var exeArgs = options.arguments || aliasJsonObject.args || '';
            var exePath = path.join(aliasJsonObject.path, (options.target || aliasJsonObject.target)); // launchExternal target takes precedence
            var exeCwd = aliasJsonObject.path || '';

            // Override manifest values when explicitly provided via the API
            let configCertOptions = options.certificate || {};
            let overrideCertOptions = aliasJsonObject.certificate || {};
            Object.keys(configCertOptions).forEach((key) => {
                overrideCertOptions[key] = configCertOptions[key];
            });

            let certificateOptions = withDefaultCertOptions(overrideCertOptions);

            fs.stat(exePath, (err, stats) => {
                if (err) {
                    error(`The app asset doesn\'t seem to exist :( Error: ${err}.`);
                } else if (!stats.isFile(exePath)) {
                    error('The app asset isn\'t a file.');
                } else {
                    try {
                        eApp.vlog(1, JSON.stringify(aliasJsonObject));
                    } catch (e) {
                        /* Could not serialize alias info for logging */
                    }

                    //Launch process.
                    launchProcess(exePath, exeArgs, exeCwd, certificateOptions);
                }
            });
        }, () => {
            error('Could not query application assets.');
        });
    } else {
        let args = options.arguments || '';
        let filePath = options.target || options.path || '';
        let certificateOptions = withDefaultCertOptions(options.certificate);

        if (filePath) {
            if (path.isAbsolute(filePath)) {
                fs.stat(filePath, (err) => {
                    if (err) {
                        error('file not found');
                    } else {
                        launchProcess(filePath, args, '', certificateOptions);
                    }
                });
            } else {
                launchProcess(filePath, args, '', certificateOptions);
            }
        } else {
            error('Target was not defined.');
        }
    }
};

ProcessTracker.prototype.monitor = function(winIdentity, options) {
    let {
        pid: pidRequested,
        uuid: uuidRequested,
        lifetime,
        monitor: monitorRequested,
    } = options;

    let pid = parseInt(pidRequested, 10);
    let processEntry = this._processes[pid] || {};

    if (isNaN(pid)) {
        throw new Error(`Error monitoring external process, invalid pid value specified.`);
    }

    if (monitorRequested && processEntry.monitor) {
        throw new Error(`Error monitoring external process, already monitoring pid: '${pid}'.`);
    }

    if (uuidRequested && processEntry.uuid && processEntry.uuid !== uuidRequested) {
        throw new Error(`Error monitoring external process, pid '${pid}' previously assigned a different UUID.`);
    }

    let uuid = processEntry.uuid || uuidRequested || generateUuid();
    let monitor = processEntry.monitor || monitorRequested;

    let eProcess = new ExternalProcess();
    let parentWindowUuidName = getParentWindowUuidName(winIdentity, lifetime);
    let procObj = eProcess.attach(pid);

    if (!procObj.handle) {
        return;
    }

    if (parentWindowUuidName) {
        let processes = this._windowToUuids[parentWindowUuidName] || [];
        processes.push(uuid);
        this._windowToUuids[parentWindowUuidName] = processes;
    }

    this._processMonitor.add(procObj);

    this._processes[pid] = {
        process: procObj,
        window: winIdentity,
        lifetime,
        uuid,
        monitor
    };

    this._uuidToPid[uuid] = pid;

    return {
        uuid
    };
};

ProcessTracker.prototype.release = function(uuid) {
    let pid = this._uuidToPid[uuid];

    if (!pid) {
        throw new Error(`Error releasing external process, no match for UUID '${uuid}'`);
    }

    if (this._processes[pid].lifetime && this._processes[pid].lifetime !== 'persist') {
        throw new Error(`Error releasing external process, cannot release nonpersistent processes`);
    }

    this._processes[pid].monitor = false;
};

ProcessTracker.prototype.terminate = function(uuid, timeout, child) {
    var pid = this._uuidToPid[uuid];

    if (!pid) {
        throw new Error(`Error terminating external process, no match for UUID '${uuid}'`);
    }

    return this._processes[pid].process.terminate(timeout, child);
};

ProcessTracker.prototype.getProcessByUuid = function(uuid) {
    var pid = this._uuidToPid[uuid];

    return pid ? this._processes[pid] : null;
};

ProcessTracker.prototype.getProcessByPid = function(pid) {
    return this._processes[pid];
};

ProcessTracker.prototype._cleanup = function(pid, uuid) {
    let winIdentity = this._processes[pid].window;
    let lifetime = this._processes[pid].lifetime;
    let parentWindowUuidName = getParentWindowUuidName(winIdentity, lifetime);

    if (parentWindowUuidName && this._windowToUuids[parentWindowUuidName]) {
        let index = this._windowToUuids[parentWindowUuidName].indexOf(uuid);
        if (index !== -1) {
            this._windowToUuids[parentWindowUuidName].splice(index, 1);
        }

        if (this._windowToUuids[parentWindowUuidName].length === 0) {
            delete this._windowToUuids[parentWindowUuidName];
        }
    }

    delete this._processes[pid];
    delete this._uuidToPid[uuid];
};

/*** Helpers ***/

function generateUuid() {
    return eApp.generateGUID();
}

function expandEnvironmentVars(str) {
    let replacementFn = (match, p1) => {
        return process.env[p1] || match;
    };

    if (isWin32) {
        // %ENV%
        return str.replace(/%(.+)%/g, replacementFn);
    } else {
        // $ENV, ${ENV}
        return str.replace(/\$([\w]+)/g, replacementFn).replace(/\$\{(.+)\}/g, replacementFn);
    }
}

function getParentWindowUuidName(winIdentity, lifetime) {
    let result;

    switch (lifetime) {
        case 'application':
            result = `${winIdentity.uuid}-${winIdentity.uuid}`;
            break;
        case 'window':
            result = `${winIdentity.uuid}-${winIdentity.name}`;
            break;
        case 'persist':
            /* falls through */
        default:
            result = null;
            break;
    }

    return result;
}

module.exports = new ProcessTracker();
