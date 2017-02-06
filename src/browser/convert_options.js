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
/*
    src/browser/convert_options.js
 */

let fs = require('fs');
let path = require('path');

let app = require('electron').app;
let ResourceFetcher = require('electron').resourceFetcher;

let _ = require('underscore');
let parseArgv = require('minimist');
let regex = require('../common/regex');

// this is the 5.0 base to be sure that we are only extending what is already expected
function five0BaseOptions() {
    return {
        'accelerator': {
            'devtools': false,
            'zoom': false,
            'reload': false,
            'reloadIgnoringCache': false
        },
        'alphaMask': {
            'blue': -1,
            'green': -1,
            'red': -1
        },
        'alwaysOnBottom': false,
        'alwaysOnTop': false,
        'applicationIcon': '',
        'autoShow': false,
        'contextMenu': true,
        'cornerRounding': {
            'height': 0,
            'width': 0
        },
        'defaultCentered': false,
        'defaultHeight': 500,
        'defaultLeft': 10,
        'defaultTop': 10,
        'defaultWidth': 800,
        'delay_connection': false,
        'draggable': false,
        'exitOnClose': false,
        'frame': true,
        'frameConnect': '',
        'hideOnBlur': false,
        'hideOnClose': false,
        'hideWhileChildrenVisible': false,
        'icon': '',
        'launchExternal': '',
        'maxHeight': -1,
        'maxWidth': -1,
        'maximizable': true,
        'minHeight': 0,
        'minWidth': 0,
        'minimizable': true,
        'name': '',
        'opacity': 1,
        'plugins': false,
        'resizable': true,
        'resize': true,
        'resizeRegion': {
            'bottomRightCorner': 4,
            'size': 2
        },
        'saveWindowState': true,
        'shadow': false,
        'showTaskbarIcon': true,
        'state': 'normal',
        'taskbarIcon': '',
        'taskbarIconGroup': '',
        'transparent': false,
        'url': 'about:blank',
        'uuid': '',
        'waitForPageLoad': true
    };
}


function isInContainer(type) {
    return process && process.versions && process.versions[type];
}

function readFile(filePath, done, onError) {
    app.vlog(1, `Requested contents from ${filePath}`);
    let normalizedPath = path.resolve(filePath);
    app.vlog(1, `Normalized path as ${normalizedPath}`);
    fs.readFile(normalizedPath, 'utf8', (err, data) => {
        if (err) {
            onError(err);
            return;
        }

        app.vlog(1, `Contents from ${normalizedPath}`);
        app.vlog(1, data);

        let config;
        try {
            config = JSON.parse(data);
        } catch (e) {
            onError(e);
            return;
        }
        done(config);
    });
}

function getURL(url, done, onError) {
    let fetcher = new ResourceFetcher('string');

    fetcher.once('fetch-complete', (object, status, data) => {
        if (status !== 'success') {
            onError(new Error(`Could not retrieve ${url}`));
            return;
        }

        app.vlog(1, `Contents from ${url}`);
        app.vlog(1, data);

        let config;
        try {
            config = JSON.parse(data);
        } catch (e) {
            onError(new Error(`Error parsing JSON from ${url}`));
            return;
        }
        done(config);
    });

    app.vlog(1, `Fetching ${url}`);
    fetcher.fetch(url);
}

function validateOptions(options) {
    var baseOptions = five0BaseOptions();

    // extend the base options to handle a raw window.open
    // exclusde from the general base options as this is internal use
    if (options.rawWindowOpen) {
        baseOptions.rawWindowOpen = options.rawWindowOpen;
    }

    return validate(baseOptions, options);
}

function validate(base, user) {
    let options = {};

    _.each(base, (value, key) => {
        const baseType = typeof base[key];
        const userType = typeof user[key];

        if (baseType === 'object') {
            options[key] = validate(base[key], user[key] || {});
        } else {
            options[key] = (userType !== baseType) ? base[key] : user[key];
        }
    });

    return options;
}

module.exports = {

    getWindowOptions: function(appJson) {
        return appJson['startup_app'];
    },

    convertToElectron: function(options, returnAsString) {

        // build on top of the 5.0 base
        let newOptions = validateOptions(options);

        if (isInContainer('openfin')) {
            newOptions['resizable'] = newOptions['resize'] && newOptions['resizable'];
            newOptions['show'] = newOptions['autoShow'] && !newOptions['waitForPageLoad'];
            newOptions['skipTaskbar'] = !newOptions['showTaskbarIcon'];
            newOptions['title'] = newOptions['name'];

            let minHeight = newOptions['minHeight'];
            let maxHeight = newOptions['maxHeight'];
            let defaultHeight = newOptions['defaultHeight'];
            if (defaultHeight < minHeight) {
                newOptions['height'] = minHeight;
            } else if (maxHeight !== -1 && defaultHeight > maxHeight) {
                newOptions['height'] = maxHeight;
            } else {
                newOptions['height'] = defaultHeight;
            }

            let defaultWidth = newOptions['defaultWidth'];
            let minWidth = newOptions['minWidth'];
            let maxWidth = newOptions['maxWidth'];
            if (defaultWidth < minWidth) {
                newOptions['width'] = minWidth;
            } else if (maxWidth !== -1 && defaultWidth > maxWidth) {
                newOptions['width'] = maxWidth;
            } else {
                newOptions['width'] = defaultWidth;
            }

            newOptions['center'] = newOptions['defaultCentered'];
            if (!newOptions['center']) {
                newOptions['x'] = newOptions['defaultLeft'];
                newOptions['y'] = newOptions['defaultTop'];
            }
        }

        // Electron BrowserWindow options
        newOptions['backgroundColor'] = '#FFF';
        newOptions['enableLargerThanScreen'] = true;
        newOptions['enable-plugins'] = true;
        newOptions['webPreferences'] = {
            nodeIntegration: false,
            plugins: newOptions['plugins']
        };
        let argv = parseArgv(app.getCommandLineArguments().split(' '));
        if (argv['disable-web-security'] || newOptions['webSecurity'] === false) {
            newOptions['webPreferences'].webSecurity = false;
        }

        if (options.message !== undefined) {
            newOptions.message = options.message;
        }

        if (options.customData !== undefined) {
            newOptions.customData = options.customData;
        }

        if (returnAsString) {
            return JSON.stringify(newOptions);
        } else {
            return JSON.parse(JSON.stringify(newOptions));
        }
    },

    fetchOptions: function(processArgs, onComplete, onError) {
        let argv = parseArgv(processArgs);
        // ensure removal of eclosing double-quotes when absolute path.
        let configUrl = (argv['startup-url'] || argv['config']);
        if (typeof configUrl !== 'string') {
            configUrl = '';
        }

        configUrl = configUrl.replace(/"/g, '');

        if (!configUrl) {
            if (typeof onError === 'function') {
                onError(new Error('missing runtime argument --startup-url'));
            }
            return;
        }

        if (regex.isURL(configUrl)) {
            return getURL(configUrl, (configObject) => {
                onComplete({
                    configObject,
                    configUrl
                });
            }, onError);
        }

        let filepath = regex.isURI(configUrl) ? regex.uriToPath(configUrl) : configUrl;

        return readFile(filepath, (configObject) => {
            onComplete({
                configObject,
                configUrl
            });
        }, onError);
    }

};
