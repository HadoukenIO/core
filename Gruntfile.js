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

'use strict';

/**
 *
 * Build tasks to facilitate the creation of an asar file.
 *
 */

const fs = require('fs');
const path = require('path');

const asar = require('asar');
const nativeBuilder = require('electron-rebuild');
const wrench = require('wrench');

const dependencies = Object.keys(require('./package.json').dependencies).map(dep => `${dep}/**`);
const srcFiles = ['src/**/*.js', 'index.js', 'Gruntfile.js'];

//optional dependencies that we ship.
const optionalDependencies = [
    'js-adapter/**',
    'runtime-p2p/**'
];

// https://github.com/beautify-web/js-beautify#options
// (Options in above-linked page are hyphen-separarted but here must be either camelCase or underscore_separated.)
const beautifierOptions = {
    js: {
        braceStyle: 'collapse,preserve-inline'
    }
};

try {
    var openfinSign = require('openfin-sign');
} catch (err) {
    openfinSign = function() {};
}

/**
 * A list of files that have already moved to TypeScript. This list will
 * slowly increase as more and more files are moved to TypeScript
 */
const trans2TSFiles = [
    'src/browser/api_protocol/api_handlers/clipboard.ts',
    'src/browser/api_protocol/shapes.ts',
    'src/browser/transports/base.ts',
    'src/browser/transports/chromium_ipc.ts',
    'src/browser/transports/electron_ipc.ts',
    'src/browser/transports/wm_copydata.ts',
    'src/browser/clip_bounds.ts',
    'src/browser/deferred.ts',
    'src/browser/cached_resource_fetcher.ts',
    'src/browser/int_pool.ts',
    'src/browser/log.ts',
    'src/browser/of_events.ts',
    'src/browser/session.ts',
    'src/browser/transport.ts',
    'src/browser/window_group_transaction_tracker.ts',
    'src/common/errors.ts',
    'src/common/regex.ts',
    'src/browser/port_discovery.ts',
    'src/browser/api_protocol/**/**.ts',
    'src/browser/rvm/rvm_message_bus.ts',
    'src/browser/api/**.ts'
];

// OpenFin commercial license
const commercialLic = `/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/
`;

// Open-source license
const openSourceLic = `/*
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
`;

module.exports = (grunt) => {

    // The default task is to build and and package resulting in an asar file in ./out/
    grunt.registerTask('default', ['build-pac']);
    grunt.registerTask('deploy', ['build-dev', 'copy-local']);

    // Load all grunt tasks matching the ['grunt-*', '@*/grunt-*'] patterns
    require('load-grunt-tasks')(grunt);

    grunt.initConfig({
        copy: {
            lib: {
                files: [{
                    cwd: './node_modules',
                    expand: true,
                    src: [dependencies, optionalDependencies],
                    dest: 'staging/core/node_modules'
                }]
            },
            etc: { //other artifacts that need copying
                files: [{
                    src: ['package.json', 'blank.ico'],
                    dest: 'staging/core/'
                }]
            },
            login: { //login dialog artifacts that need copying
                files: [{
                    src: ['src/login/*'],
                    dest: 'staging/core/'
                }]
            },
            certificate: { //certificate dialog artifacts that need copying
                files: [{
                    src: ['src/certificate/*'],
                    dest: 'staging/core/'
                }]
            }
        },

        // Transpile TypeScript to JavaScript
        ts: {
            default: {
                tsconfig: true
            }
        },

        // Lint TypeScript files
        tslint: {
            options: {
                // todo: use 'node_modules/tslint-microsoft-contrib/tslint.json'
                // when transition to TypeScript is fully done
                configuration: grunt.file.readJSON('tslint.json'),
                rulesDirectory: 'node_modules/tslint-microsoft-contrib',
                force: false
            },
            files: {
                src: trans2TSFiles
            }
        },

        babel: {
            dist: {
                files: [{
                    expand: true,
                    src: srcFiles,
                    dest: 'staging/core'
                }]
            }
        },
        jshint: {
            src: srcFiles,
            options: {
                jshintrc: './.jshintrc'
            }
        },
        watch: { //just build and lint for now
            scripts: {
                files: srcFiles,
                tasks: ['jshint', 'jsbeautifier'],
                options: {}
            },
            deploy: {
                files: srcFiles,
                tasks: ['deploy']
            }
        },
        jsbeautifier: {
            default: {
                src: ['src/**/*.js', 'index.js'],
                options: beautifierOptions
            },
            'git-pre-commit': {
                src: ['src/**/*.js', 'index.js'],
                options: Object.assign({ mode: 'VERIFY_ONLY' }, beautifierOptions)
            }
        },
        mochaTest: {
            default: {
                src: ['staging/core/test/**.js']
            }
        }
    });

    grunt.registerTask('build-dev', [
        'license',
        'jshint',
        'jsbeautifier:default',
        'clean',
        'babel',
        'tslint',
        'ts',
        'mochaTest',
        'copy:lib',
        'copy:etc',
        'copy:login',
        'copy:certificate',
        'sign-files'
    ]);

    grunt.registerTask('test', [
        'license',
        'jshint',
        'jsbeautifier',
        'clean',
        'babel',
        'tslint',
        'ts',
        'mochaTest',
    ]);

    grunt.registerTask('build-pac', [
        'license',
        'jshint',
        'jsbeautifier',
        'clean',
        'babel',
        'tslint',
        'ts',
        'mochaTest',
        'copy',
        'build-deploy-modules',
        'sign-files',
        'package',
        'sign-asar'
    ]);

    grunt.registerTask('typescript', [
        'tslint',
        'ts'
    ]);

    grunt.registerTask('sign-files', function() {
        wrench.readdirSyncRecursive('staging/core').forEach(function(filename) {
            let filepath = path.join('staging', 'core', filename);

            if (!fs.statSync(filepath).isDirectory()) {
                openfinSign(filepath);
            }
        });
        grunt.log.ok('Finished signing files.');
    });

    grunt.registerTask('sign-asar', function() {
        openfinSign('out/app.asar');
        grunt.log.ok('Finished signing asar.');
    });

    grunt.registerTask('clean', 'clean the out house', function() {
        wrench.rmdirSyncRecursive('staging', true);
        wrench.rmdirSyncRecursive('out', true);
    });

    grunt.registerTask('build-deploy-modules', 'Build native modules', function() {
        const done = this.async();
        const nativeModVersion = grunt.option('nmv') || 'v5.10.0';
        const nodeHeaderVersion = grunt.option('nhv') || 'v0.37.5';
        const rebuildNativeVersion = grunt.option('rnv') || '0.37.5';
        const outdir = './staging/core/node_modules';
        const arch = grunt.option('arch') || 'ia32';

        grunt.log.ok('Checking if rebuilding native modules is required.');
        nativeBuilder.shouldRebuildNativeModules(undefined, nativeModVersion).then(function(shouldBuild) {
            if (!shouldBuild) {
                grunt.log.ok('Skipping native builds.');
                done();
                return true;
            }

            grunt.log.ok('Installing headers.');
            return nativeBuilder.installNodeHeaders(nodeHeaderVersion, undefined, undefined, 'ia32')
                .then(function() {
                    // Ensure directory tree exists
                    grunt.file.mkdir(outdir);
                    grunt.log.ok('Building native modules.');
                    nativeBuilder.rebuildNativeModules(rebuildNativeVersion, outdir, undefined, undefined, arch).then(function() {
                        done();
                    });
                });
        }).catch(function(e) {
            grunt.log.error('Building modules didn\'t work!');
            grunt.log.error(e);
            done();
        });
    });

    grunt.registerTask('package', 'Package in an asar', function() {
        const done = this.async();

        asar.createPackage('staging/core', 'out/app.asar', function() {
            grunt.log.ok('Finished packaging as asar.');
            wrench.rmdirSyncRecursive('staging', true);
            grunt.log.ok('Cleaned up staging.');
            done();
        });
    });

    grunt.registerTask('copy-local', function() {
        const target = grunt.option('target');
        const done = this.async();

        if (!target) {
            grunt.log.ok('No target specified...skipping local deploy.');
            done();
        } else {
            const asarFile = path.join(target, 'app.asar');
            const asarFileBk = path.join(target, 'app.asar.bk');
            const defaultAppFolder = path.join(target, 'default_app');
            const origin = './staging/core';

            if (fs.existsSync(asarFile)) {
                fs.renameSync(asarFile, asarFileBk);
                grunt.log.ok(`renamed: ${asarFile} to: ${asarFileBk}`);
            }

            wrench.copyDirRecursive(origin, defaultAppFolder, {
                forceDelete: true
            }, function() {
                grunt.log.ok(`Deployed to: ${defaultAppFolder}`);
                done();
            });
        }
    });

    /**
     * This task goes through the list of all files that need to have
     * a license and validates that they have proper licenses.
     * Usage:
     * 1. grunt license - default
     * 2. grunt license:add - will add open-source license to all non-commercial files
     * 3. grunt license:remove - will remove licenses from all files
     */
    grunt.registerTask('license', (option) => {
        let foundLicensingProblem = false;

        // List of files that must have OpenFin commercial license
        const ofLicensedFiles = [
            'src/browser/api/external_application.ts',
            'src/browser/api_protocol/external_application.js',
            'src/browser/api_protocol/transport_strategy/base_handler.ts',
            'src/browser/api_protocol/transport_strategy/ws_strategy.ts',
            'src/browser/api_protocol/api_handlers/authorization.js',
            'src/browser/api_protocol/api_handlers/api_policy_processor.ts',
            'src/browser/api_protocol/api_handlers/external_application.ts',
            'src/browser/api_protocol/api_handlers/mesh_middleware.ts',
            'src/browser/port_discovery.ts',
            'src/browser/rvm/rvm_message_bus.ts',
            'src/browser/remote_subscriptions.ts',
            'src/browser/rvm/runtime_initiated_topics/app_assets.js',
            'src/browser/rvm/runtime_initiated_topics/rvm_info.js',
            'src/browser/rvm/utils.ts',
            'src/browser/external_window_event_adapter.js',
            'src/browser/connection_manager.ts',
            'src/browser/transport.ts',
            'src/browser/transports/socket_server.js',
            'src/browser/transports/wm_copydata.ts',
            'src/browser/transports/base.ts',
            'src/browser/transports/chromium_ipc.ts',
            'src/browser/transports/electron_ipc.ts'
        ];

        // List of files that need to have some kind of license
        const allFilesForLicense = grunt.file.expand(
            'src/**/*.ts',
            'src/**/*.js',
            'test/**/*.ts',
            'test/**/*.js',
            'index.ts',
            'index.js'
        );

        // Goes through all the files and verifies licenses
        allFilesForLicense.forEach(filePartPath => {
            const fileFullPath = path.join(__dirname, filePartPath);
            let fileContent = String(fs.readFileSync(fileFullPath));

            // When given 'remove' option, just remove the license
            if (option === 'remove') {
                fileContent = fileContent.replace(openSourceLic, '');
                fileContent = fileContent.replace(commercialLic, '');
                fs.writeFileSync(fileFullPath, fileContent);
                grunt.log.writeln(`Removed license from ${filePartPath}`['yellow'].bold);
                return;
            }

            // OpenFin commercial license file
            if (ofLicensedFiles.includes(filePartPath)) {

                // Remove open-source license from a commercial file
                if (fileContent.includes(openSourceLic)) {
                    fileContent = fileContent.replace(openSourceLic, '');
                    fs.writeFileSync(fileFullPath, fileContent);
                    grunt.log.writeln(`Removed open-source license from OpenFin commercial file ${filePartPath}`['yellow'].bold);
                }

                // Add license if missing
                if (!fileContent.includes(commercialLic)) {
                    fileContent = commercialLic + fileContent;
                    fs.writeFileSync(fileFullPath, fileContent);
                    grunt.log.writeln(`Added missing OpenFin commercial license to ${filePartPath}`['yellow'].bold);
                }
            }

            // Open-sourced files or new files that are missing a license
            else {

                // File has commercial license but is not added to the list of commercial files
                if (fileContent.includes(commercialLic)) {
                    grunt.log.writeln(`Found commercial license in ${filePartPath}, but file is `['yellow'].bold +
                        `not added to Grunt's list of commercial files. Please, add it.`['yellow'].bold);
                }

                // File is missing any kind of license
                else if (!fileContent.includes(openSourceLic)) {

                    // When calling this task with an 'add' option, it will add open-source license
                    // to all the files that are missing a license and are not specified as commercial
                    if (option === 'add') {
                        fileContent = openSourceLic + fileContent;
                        fs.writeFileSync(fileFullPath, fileContent);
                        grunt.log.writeln(`Added open-source license to ${filePartPath}`['yellow'].bold);
                    } else {
                        grunt.log.writeln(`File ${filePartPath} is missing a license`['red'].bold);
                        foundLicensingProblem = true;
                    }
                }
            }
        });

        if (foundLicensingProblem) {
            // Abort Grunt if there are problems found with licensing
            grunt.fail.fatal('Aborted due to problems with licensing'['red'].bold);
        } else {
            grunt.log.writeln(`Licensing task is done`['green'].bold);
        }
    });
};
