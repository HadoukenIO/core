/*
    src/browser/convert_options.js
 */

// built-in modules
let path = require('path');
let queryString = require('querystring');

// npm modules
let _ = require('underscore');

// local modules
let coreState = require('./core_state.js');
let log = require('./log');
import { fetchReadFile, readFile } from './cached_resource_fetcher';

// constants
import {
    DEFAULT_RESIZE_REGION_SIZE,
    DEFAULT_RESIZE_REGION_BOTTOM_RIGHT_CORNER,
    DEFAULT_RESIZE_SIDES
} from '../shapes';
const TRANSPARENT_WHITE = '#0FFF'; // format #ARGB

// contextMenuSettings is not updateable for enable_chromium.  RUN-4721
const contextMenuSettings = {
    'enable': true,
    'devtools': true, // enable_chromium only
    'reload': true, // enable_chromium only
};

const iframeBaseSettings = {
    'crossOriginInjection': false,
    'sameOriginInjection': true,
    'enableDeprecatedSharedName': false
};

const rendererBatchingBaseSettings = {
    'enabled': false,
    'maxSize': Number.MAX_VALUE,
    'ttl': 0
};

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
        'api': {
            'iframe': iframeBaseSettings
        },
        'applicationIcon': '',
        'aspectRatio': 0,
        'autoShow': false,
        'backgroundThrottling': false,
        'contextMenuSettings': contextMenuSettings,
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
        'disableIabSecureLogging': false,
        'draggable': false,
        'exitOnClose': false,
        'experimental': {
            'api': {
                'batching': {
                    'renderer': rendererBatchingBaseSettings
                },
                'breadcrumbs': false,
                'iframe': iframeBaseSettings
            },
            'disableInitialReload': false,
            'node': false,
            'v2Api': true
        },
        'frame': true,
        'frameConnect': '',
        'hideOnBlur': false,
        'hideOnClose': false,
        'hideWhileChildrenVisible': false,
        'icon': '',
        'isRawWindowOpen': false,
        'launchExternal': '',
        'loadErrorMessage': '',
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
            'bottomRightCorner': DEFAULT_RESIZE_REGION_BOTTOM_RIGHT_CORNER,
            'size': DEFAULT_RESIZE_REGION_SIZE,
            'sides': DEFAULT_RESIZE_SIDES
        },
        'saveWindowState': true,
        'shadow': false,
        'showTaskbarIcon': true,
        'smallWindow': false,
        'spellCheck': false, // app level
        'state': 'normal',
        'taskbarIcon': '',
        'taskbarIconGroup': '',
        'transparent': false,
        'url': 'about:blank',
        'uuid': '',
        'waitForPageLoad': true,
        'backgroundColor': '#FFF',
        'webSecurity': true
    };
}

function isInContainer(type) {
    return process && process.versions && process.versions[type];
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

function fetchLocalConfig(configUrl, successCallback, errorCallback) {
    log.writeToLog(1, `Falling back on local-startup-url path: ${configUrl}`, true);
    readFile(configUrl, true)
        .then((configObject) => successCallback({ configObject, configUrl }))
        .catch(errorCallback);
}
export const getStartupAppOptions = function(appJson) {
    return appJson['startup_app'];
};
export const convertToElectron = function(options, returnAsString) {

    const usingIframe = !!(options.api && options.api.iframe);

    // build on top of the 5.0 base
    let newOptions = validateOptions(options);

    if (isInContainer('openfin')) {
        newOptions.resizable = newOptions.resize && newOptions.resizable;
        //always rely on the core to show the window.
        newOptions.show = false;
        newOptions.skipTaskbar = !newOptions.showTaskbarIcon;
        newOptions.title = newOptions.name;

        let minHeight = newOptions.minHeight;
        let maxHeight = newOptions.maxHeight;
        let defaultHeight = newOptions.defaultHeight;
        if (defaultHeight < minHeight) {
            newOptions.height = minHeight;
        } else if (maxHeight !== -1 && defaultHeight > maxHeight) {
            newOptions.height = maxHeight;
        } else {
            newOptions.height = defaultHeight;
        }

        let defaultWidth = newOptions.defaultWidth;
        let minWidth = newOptions.minWidth;
        let maxWidth = newOptions.maxWidth;
        if (defaultWidth < minWidth) {
            newOptions.width = minWidth;
        } else if (maxWidth !== -1 && defaultWidth > maxWidth) {
            newOptions.width = maxWidth;
        } else {
            newOptions.width = defaultWidth;
        }

        newOptions.center = newOptions.defaultCentered;
        if (!newOptions.center) {
            newOptions.x = newOptions.defaultLeft;
            newOptions.y = newOptions.defaultTop;
        }
    }

    const useNodeInRenderer = newOptions.experimental.node;
    const noNodePreload = path.join(__dirname, '..', 'renderer', 'node-less.js');

    // Because we have communicated the experimental option, this allows us to
    // respect that if its set but defaults to the proper passed in `iframe` key
    if (usingIframe) {
        Object.assign(newOptions.experimental.api.iframe, newOptions.api.iframe);
    } else {
        newOptions.api.iframe = newOptions.experimental.api.iframe;
    }

    if (_.has(options, 'contextMenu')) { // backwards compatible
        newOptions.contextMenuSettings.enable = options.contextMenu;
    }

    // Electron BrowserWindow options
    newOptions.enableLargerThanScreen = true;
    newOptions['enable-plugins'] = true;
    newOptions.webPreferences = {
        api: newOptions.experimental.api,
        contextMenuSettings: newOptions.contextMenuSettings,
        disableInitialReload: newOptions.experimental.disableInitialReload,
        nodeIntegration: false,
        plugins: newOptions.plugins,
        preload: (!useNodeInRenderer ? noNodePreload : ''),
        sandbox: !useNodeInRenderer,
        spellCheck: newOptions.spellCheck,
        backgroundThrottling: newOptions.backgroundThrottling
    };

    if (coreState.argo['disable-web-security'] || newOptions.webSecurity === false) {
        newOptions.webPreferences.webSecurity = false;
    }

    if (coreState.argo['user-app-config-args']) {
        newOptions.userAppConfigArgs = queryString.parse(coreState.argo['user-app-config-args']);
    }

    if (options.message !== undefined) {
        newOptions.message = options.message;
    }

    if (options.customData !== undefined) {
        newOptions.customData = options.customData;
    }

    if (options.permissions !== undefined) { // API policy
        newOptions.permissions = options.permissions;
    }

    if ('preloadScripts' in options || 'preload' in options) {
        newOptions.preloadScripts = this.normalizePreloadScripts(options);
    }

    if (options.customRequestHeaders !== undefined) {
        newOptions.customRequestHeaders = options.customRequestHeaders;
    }

    // implicitly set the backgroundColor if the window is transparent
    if (newOptions.transparent) {
        newOptions.backgroundColor = TRANSPARENT_WHITE;
    }

    if (returnAsString) {
        return JSON.stringify(newOptions);
    } else {
        return JSON.parse(JSON.stringify(newOptions));
    }
};

export const fetchOptions = function(argo, onComplete, onError) {
    // ensure removal of eclosing double-quotes when absolute path.
    let configUrl = (argo['startup-url'] || argo['config']);
    let localConfigPath = argo['local-startup-url'];
    let offlineAccess = false;
    let errorCallback = err => {
        if (offlineAccess) {
            fetchLocalConfig(localConfigPath, onComplete, onError);
        } else {
            onError(err);
        }
    };

    // if local-startup-url is defined and its config specifies offline mode, then
    // allow fetching from the local-startup-url config
    if (localConfigPath) {
        try {
            // Use this version of the fs module because the decorated version checks if the file
            // has a matching signature file
            const originalFs = require('original-fs');
            let localConfig = JSON.parse(originalFs.readFileSync(localConfigPath));

            if (localConfig['offlineAccess']) {
                offlineAccess = true;
            }
        } catch (err) {
            log.writeToLog(1, err, true);
        }
    }

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

    // read config file from RVM local app folder if it exists
    const actualConfigUrl = localConfigPath ? localConfigPath : configUrl;

    // Note: actualConfigUrl is only used for getting config object, but configUrl is still needed in callback function. otherwise RVM sent error message.
    fetchReadFile(actualConfigUrl, true)
        .then((configObject) => onComplete({ configObject, configUrl }))
        .catch(errorCallback);
};
export function normalizePreloadScripts(options) {
    let preloadScripts = [];

    if ('preload' in options) {
        if (typeof options.preload === 'string') {
            preloadScripts = [{ url: options.preload }];
        } else if (Array.isArray(options.preload)) {
            preloadScripts = options.preload;
        }
    }

    if ('preloadScripts' in options && Array.isArray(options.preloadScripts)) {
        preloadScripts = options.preloadScripts;
    }

    return preloadScripts;
}
export default {
    getStartupAppOptions,
    convertToElectron,
    fetchOptions,
    normalizePreloadScripts
};
