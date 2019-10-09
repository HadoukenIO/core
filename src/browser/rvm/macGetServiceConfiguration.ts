import * as path from 'path';
import * as fs from 'fs';

interface ConfigObject {
    [key: string]: any;
    services: {
        [key: string]: ServiceConfig;
    };
}

interface ServiceConfig {
    name: string;
    [key: string]: any;
}

export async function macGetServiceConfiguration(name: string): Promise<ServiceConfig[]> {
    const plist = require('plist');
    const OPENFIN_PLIST_FILENAME = 'com.openfin.openfin.plist';
    const prefLocation = resolveHome(`~/Library/Preferences/${OPENFIN_PLIST_FILENAME}`);
    let config: ConfigObject = {services: {}};
    try {
        config = plist.parseFile(fs.readFileSync(prefLocation, 'utf-8'));
    } catch (error) {
        // Do some error handling
    }
    return Object.values(config.services);
}

function resolveHome(filepath: string) {
    if (filepath[0] === '~') {
        return path.join(process.env.HOME!, filepath.slice(1));
    }
    return filepath;
}