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

let nativeBuilder = require('electron-rebuild');
let wrench = require('wrench');
let fs = require('fs');
let asar = require('asar');
let exec = require('child_process').exec;
let loadGruntTasks = require('load-grunt-tasks');
let path = require('path');
let os = require('os');

let dependencies = Object.keys(require('./package.json').dependencies).map(function(dep) {
        return dep + '/**';
    });

/**
 * A list of files that have already moved to TypeScript. This list will
 * slowly increase as more and more files are moved to TypeScript
 */
const trans2TSFiles = [
    'src/browser/transports/base.ts',
    'src/browser/transports/chromium_ipc.ts',
    'src/browser/transports/electron_ipc.ts',
    'src/browser/transports/wm_copydata.ts',
    'src/browser/clip_bounds.ts',
    'src/browser/deferred.ts',
    'src/browser/icon.ts',
    'src/browser/int_pool.ts',
    'src/browser/log.ts',
    'src/browser/of_events.ts',
    'src/browser/session.ts',
    'src/browser/transport.ts',
    'src/browser/window_group_transaction_tracker.ts',
    'src/common/errors.ts',
    'src/common/regex.ts',
    'src/browser/port_discovery.ts',
    'src/browser/api_protocol/**/**.ts'
];

module.exports = function(grunt) {

    grunt.loadNpmTasks('grunt-ts');
    grunt.loadNpmTasks('grunt-jsbeautifier');

    let srcFiles = ['src/**/*.js', 'index.js', 'Gruntfile.js'];
    let staging = path.resolve(__dirname, 'staging', 'core');
    let isWindows = os.type().toLowerCase().indexOf('windows') !== -1;
    let version = grunt.option('of-version') || '6.44.8.55';
    let eightOrGreater = '\\AppData\\Local\\OpenFin';
    let dest = process.env['USERPROFILE'] + eightOrGreater + '\\runtime\\' + version + '\\OpenFin\\resources\\default_app';
    let runner = grunt.option('run') || path.resolve(dest, '../', '../', 'openfin.exe');

    grunt.initConfig({
        copy: {
            lib: {
                files: [{
                    cwd: './node_modules',
                    expand: true,
                    src: [dependencies],
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
            },
            rcb: { //copy the rcb - windows only
                files: [{
                    src: 'rcb',
                    dest: path.resolve(dest, '../' + 'rcb')
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
                configuration: 'tslint.json',
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
        jsbeautifier : {
            default: {
                src : ['src/**/*.js', 'index.js']
            },
            'git-pre-commit': {
                src : ['src/**/*.js', 'index.js'],
                options : {
                   mode:'VERIFY_ONLY'
                }
            }
        },
        mochaTest: {
            default: {
                src: 'staging/core/test/**.js'
            }
        }
    });

    /*
      The default task is to build and and package resulting in an asar file
      in ./out/
     */

    grunt.registerTask('build-dev', ['jshint', 'jsbeautifier:default', 'clean', 'babel', 'tslint', 'ts', 'test',  'copy:lib', 'copy:etc', 'copy:login', 'copy:certificate']);

    grunt.registerTask('build-pac', ['jshint', 'jsbeautifier', 'clean', 'babel', 'tslint', 'ts', 'test', 'copy', 'build-deploy-modules', 'package']);

    grunt.registerTask('clean', 'clean the out house', function() {
        wrench.rmdirSyncRecursive('staging', true);
        wrench.rmdirSyncRecursive('out', true);
    });

    grunt.registerTask('build-deploy-modules', 'Build native modules', function() {
        let done = this.async();
        let nativeModVersion = grunt.option('nmv') || 'v5.10.0';
        let nodeHeaderVersion = grunt.option('nhv') || 'v0.37.5';
        let rebuildNativeVersion = grunt.option('rnv') || '0.37.5';
        let outdir = './staging/core/node_modules';
        let arch = grunt.option('arch') || 'ia32';

        grunt.log.writeln('Checking if must rebuild native modules...').ok();
        nativeBuilder.shouldRebuildNativeModules(undefined, nativeModVersion).then(function(shouldBuild) {
            if (!shouldBuild) {
                grunt.log.writeln('Skipping native builds').ok();
                done();
                return true;
            }

            grunt.log.writeln('Installing headers...').ok();
            return nativeBuilder.installNodeHeaders(nodeHeaderVersion, undefined, undefined, 'ia32')
                .then(function() {
                    // Ensure directory tree exists
                    grunt.file.mkdir(outdir);
                    grunt.log.writeln('Building native modules...').ok();
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

        let done = this.async();

        asar.createPackage('staging/core', 'out/app.asar', function() {
            done();
            grunt.log.writeln('Finished packaging as asar.').ok();

            wrench.rmdirSyncRecursive('staging', true);
            grunt.log.writeln('Staging cleaned up.').ok();
        });

    });

    grunt.registerTask('dev', 'copy over', function() {
        let done = this.async();
        let url = grunt.option('url') || 'https://demoappdirectory.openf.in/desktop/config/apps/OpenFin/HelloOpenFin/alpha-next.json';

        if (isWindows) {
            grunt.task.run(['copy:rcb']);

            wrench.copyDirRecursive(staging, dest, {
                forceDelete: true
            }, function() {
                grunt.log.writeln(runner + ' --debug="5858" --startup-url="' + url + '"');
                exec(runner + ' --debug="5858" --startup-url="' + url + '"', function() {
                    done();
                });

            });
        }
    });

    grunt.registerTask('copy-local', function () {
        let target = grunt.option('target');
        let done = this.async();

        if(!target) {
            console.log('No target specified skipping local deploy');
            done();
        } else {
            let asarFile = path.join(target, 'app.asar');
            let asarFileBk = path.join(target, 'app.asar.bk');
            let defaultAppFolder = path.join(target, 'default_app');
            let origin = './staging/core';
            if (fs.existsSync(asarFile)) {
                fs.renameSync(asarFile, asarFileBk);
                grunt.log.writeln('renamed: ', asarFile, ' to: ', asarFileBk, '\n');
            }
            wrench.copyDirRecursive(origin, defaultAppFolder, {
                forceDelete: true
            }, function() {
                grunt.log.writeln('deployed to: ', defaultAppFolder);
                done();
            });
        }
    });

    grunt.registerTask('default', ['build-pac']);
    grunt.registerTask('deploy', ['build-dev', 'copy-local']);

    grunt.registerTask('test', ['mochaTest']);

    loadGruntTasks(grunt);

    grunt.loadNpmTasks('grunt-jsbeautifier');

    // this will be our commercial lic
    var commercialLic = `/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/\n`;

    // this will be the open src
    var openSourceLic =`/*
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
*/\n`;


    // add files here to give them the of commercial license
    var ofLicensedFiles = [
        'src/browser/api_protocol/external_application.js',
        'src/browser/api_protocol/transport_strategy/ws_strategy.ts',
        'src/browser/api_protocol/api_handlers/authorization.js',
        'src/browser/port_discovery.ts',
        'src/browser/rvm/rvm_message_bus.js',
        'src/browser/rvm/runtime_initiated_topics/app_assets.js',
        'src/browser/rvm/runtime_initiated_topics/rvm_info.js',
        'src/browser/rvm/utils.ts',
        'src/browser/api/external_application.js',
        'src/browser/external_window_event_adapter.js',
        'src/browser/transport.ts',
        'src/browser/transports/socket_server.js',
        'src/browser/transports/wm_copydata.ts',
        'src/browser/transports/base.ts',
        'src/browser/transports/chromium_ipc.ts',
        'src/browser/transports/electron_ipc.ts'
    ];

    function addLic(filepath, lic){
        var filestr = fs.readFileSync(filepath, 'utf-8');
        var needsLicBanner = !hasLic(filestr, lic);

        if (needsLicBanner) {
            fs.writeFileSync(filepath, lic + filestr);
        }
    }

    function hasLic(filestr, lic){
        var licSearchLen = lic.length;

        return filestr.substr(0, licSearchLen) === lic;
    }

    function remLic(filepath, lic){
        var filestr = fs.readFileSync(filepath, 'utf-8');
        var hasLicBanner  = hasLic(filestr, lic);

        if (hasLicBanner) {
            fs.writeFileSync(filepath, filestr.slice(lic.length));
        }
    }

    grunt.registerTask('license', [], function(){
        var categorizedFiles = categorizeFiles();
        var ofLic = categorizedFiles.ofLic;
        var genLic = categorizedFiles.genLic;

        ofLic.forEach(function(file){
            addLic(path.join(__dirname, file), commercialLic);
        });

        genLic.forEach(function(file){
            addLic(path.join(__dirname, file), openSourceLic);
        });

    });

    grunt.registerTask('remlicense', [], function(){

        var categorizedFiles = categorizeFiles();
        var ofLic = categorizedFiles.ofLic;
        var genLic = categorizedFiles.genLic;

        ofLic.forEach(function(file){
            remLic(path.join(__dirname, file), commercialLic);
        });

        genLic.forEach(function(file){
            remLic(path.join(__dirname, file), openSourceLic);
        });

    });

    grunt.registerTask('lic', ['license']);
    grunt.registerTask('remlic', ['remlicense']);


    function categorizeFiles () {
        var ofLic = [];
        var genLic = [];

        // May need to consider file types here, .ico files etc..
        var gruntSelectedAll = grunt.file.expand('**/*', '!staging/**/*', '!node_modules/**/*', '!*.json', '!*.html', '!*.ico', '!rcb');

        gruntSelectedAll.forEach(function(file){
            if (!grunt.file.isDir(file)) {
                if (ofLicensedFiles.indexOf(file) === -1) {
                    genLic.push(file);
                } else {
                    ofLic.push(file);
                }
            }
        });

        return {
            ofLic: ofLic,
            genLic: genLic
        };
    }
};
