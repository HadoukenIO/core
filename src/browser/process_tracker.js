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
let EventEmitter = require('events').EventEmitter;
let fs = require('fs');
let path = require('path');
let util = require('util');

let eApp = require('electron').app;
let ExternalProcess = require('electron').externalProcess;
let ProcessMonitor = require('electron').processMonitor;

const isWin32 = (process.platform === 'win32');

function ProcessTracker() {
    EventEmitter.call(this);

    // map of pids to process objects
    this._processes = {};
    // map of uuids to pids
    this._uuidToPid = {};
    // NOTE: The ProcessMonitor module lives for the entirety of the runtime, so
    // there's no need to unhook this listener
    this._processMonitor = new ProcessMonitor();
    this._processMonitor.on('process-terminated', (event, handle, pid, exitCode) => {
        var winUuid = this._processes[pid].window.uuid;
        var winName = this._processes[pid].window.name;
        var uuid = this._processes[pid].uuid;

        this.emit(`synth-process-terminated/${winUuid}-${winName}`, {
            exitCode,
            processUuid: uuid,
        });

        this._cleanup(pid, uuid);
    });
}

util.inherits(ProcessTracker, EventEmitter);

ProcessTracker.prototype.launch = function(winIdentity, config, resolve) {
    let eProcess = new ExternalProcess();
    let procObj;

    var uuid = generateUuid();

    let error = (msg) => {
        eApp.vlog(1, msg);
        resolve(msg);
    };

    let withDefaultCertOptions = (raw) => {
        let options = raw || {};
        return {
            publicKey: options.publicKey || '',
            serial: options.serial || '',
            subject: options.subject || '',
            thumbprint: options.thumbprint || '',
            trusted: options.trusted || false
        };
    };

    let validateCertificate = (filePath, options) => {
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
                let value = options[valueKey];
                if (value) {
                    if (!eApp.compareFileSignature(filePath, nativeSubject, value)) {
                        response.error = (response.error || '') + `${valueKey} does not match. `;
                        response[valueKey] = false;
                    }
                }
            };

            if (options.trusted) {
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

            procObj = eProcess.launch(fpath, cwd, args);
            this._processMonitor.add(procObj);

            this._processes[procObj.id] = {
                process: procObj,
                window: winIdentity,
                uuid
            };
            this._uuidToPid[uuid] = procObj.id;

            this.emit(`synth-process-started/${winIdentity.uuid}-${winIdentity.name}`, {
                processUuid: uuid
            });

            resolve(undefined, {
                uuid
            });
        } else {
            error(certResult.error);
        }
    };

    // app asset request
    if (config.alias) {
        // Fetch app asset from RVM
        var AppAssetsFetcher = require('./rvm/runtime_initiated_topics/app_assets.js');
        AppAssetsFetcher.fetchAppAsset(config.srcUrl, config.alias, (aliasJsonObject) => {
            var exeArgs = config.arguments || aliasJsonObject.args || '';
            var exePath = path.join(aliasJsonObject.path, (config.target || aliasJsonObject.target)); // launchExternal target takes precedence
            var exeCwd = aliasJsonObject.path || '';

            // Override manifest values when explicitly provided via the API
            let configCertOptions = config.certificate || {};
            let overrideCertOptions = aliasJsonObject.certificate || {};
            Object.keys(configCertOptions).forEach((key) => {
                overrideCertOptions[key] = configCertOptions[key];
            });

            let certificateOptions = withDefaultCertOptions(overrideCertOptions);

            /*var exeOptions = {
                cwd: aliasJsonObject.path
            };

            if (aliasJsonObject.variables) {
                exeOptions.env = aliasJsonObject.variables;
            }*/

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
        let args = config.arguments || '';
        let filePath = config.target || config.path || '';
        let certificateOptions = withDefaultCertOptions(config.certificate);

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

ProcessTracker.prototype.monitor = function(winIdentity, pid) {
    var eProcess = new ExternalProcess();
    var procObj = eProcess.attach(pid);
    var uuid = null;

    if (procObj.handle) {
        uuid = generateUuid();

        this._processMonitor.add(procObj);

        this._processes[pid] = {
            process: procObj,
            window: winIdentity,
            uuid
        };
        this._uuidToPid[uuid] = pid;
    }

    return {
        uuid
    };
};

ProcessTracker.prototype.release = function(uuid) {
    var pid = this._uuidToPid[uuid];

    if (!pid) {
        throw new Error(`Error releasing external process, no match for UUID '${uuid}'`);
    }

    this._processMonitor.remove(this._processes[pid].process);
    this._cleanup(pid, uuid);
};

ProcessTracker.prototype.terminate = function(uuid, timeout, child) {
    var pid = this._uuidToPid[uuid];

    if (!pid) {
        throw new Error(`Error terminating external process, no match for UUID '${uuid}'`);
    }

    return this._processes[pid].process.terminate(timeout, child);
};

ProcessTracker.prototype._cleanup = function(pid, uuid) {
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

module.exports = new ProcessTracker();
