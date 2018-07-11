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
const openfinSign = require('openfin-sign'); // OpenFin signing module

const dependencies = Object.keys(require('./package.json').dependencies).map(dep => `${dep}/**`);
const srcFiles = ['src/**/*.js', 'index.js', 'Gruntfile.js'];
const stagingNodeModulesPath = path.join('staging', 'core', 'node_modules');
const jsAdapterPath = path.join('node_modules', 'hadouken-js-adapter', 'out');

// https://github.com/beautify-web/js-beautify#options
// (Options in above-linked page are hyphen-separarted but here must be either camelCase or underscore_separated.)
const beautifierOptions = {
    js: {
        braceStyle: 'collapse,preserve-inline'
    }
};

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
                    src: [dependencies],
                    dest: stagingNodeModulesPath
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
            error: { //error dialog artifacts that need copying
                files: [{
                    src: ['src/error/*'],
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
                tsconfig: true,
                options: {
                    fast: 'never'
                }
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
                src: [
                    'src/**/*.ts',
                    '!src/**/*.d.ts',
                    'test/**/*.ts',
                    '!test/**/*.d.ts',
                ]
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
                src: ['staging/core/test/**.js'],
                options: {
                    reporter: 'dot'
                }
            }
        }
    });

    grunt.registerTask('build-dev', [
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
        'clean-up-dependencies',
        'sign-files'
    ]);

    grunt.registerTask('test', [
        'jshint',
        'jsbeautifier',
        'clean',
        'babel',
        'tslint',
        'ts',
        'mochaTest',
    ]);

    grunt.registerTask('build-pac', [
        'jshint',
        'jsbeautifier',
        'clean',
        'babel',
        'tslint',
        'ts',
        'mochaTest',
        'copy',
        'clean-up-dependencies',
        'build-deploy-modules',
        'sign-files',
        'sign-adapter',
        'package',
        'package-adapter',
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
        openfinSign('out/js-adapter.asar');
        grunt.log.ok('Finished signing asar.');
    });

    grunt.registerTask('sign-adapter', function() {
        const jsAdapterBundle = path.join(jsAdapterPath, 'js-adapter.js');

        openfinSign(jsAdapterBundle);
        grunt.log.ok('Finished signing js-adapter');
    });

    grunt.registerTask('clean', 'clean the out house', function() {
        wrench.rmdirSyncRecursive('staging', true);
        wrench.rmdirSyncRecursive('out', true);
    });
    
    grunt.registerTask('clean-up-dependencies', 'Clean up dependencies', function() {
        
        // Clean Rx library (6.94MB -> 144KB)
        const rxLibPath = path.join(stagingNodeModulesPath, 'rx');
        const rxLib = fs.readFileSync(path.join(rxLibPath, 'dist', 'rx.all.min.js'), 'utf-8');
        wrench.rmdirSyncRecursive(rxLibPath);
        wrench.mkdirSyncRecursive(rxLibPath);
        fs.writeFileSync(path.join(rxLibPath, 'index.js'), rxLib);
        
        // Underscore (128KB -> 20KB)
        const underscoreLibPath = path.join(stagingNodeModulesPath, 'underscore');
        const underscoreLib = fs.readFileSync(path.join(underscoreLibPath, 'underscore-min.js'), 'utf-8');
        wrench.rmdirSyncRecursive(underscoreLibPath);
        wrench.mkdirSyncRecursive(underscoreLibPath);
        fs.writeFileSync(path.join(underscoreLibPath, 'index.js'), underscoreLib);
        
        // Minimist (64KB -> 8KB)
        const minimistLibPath = path.join(stagingNodeModulesPath, 'minimist');
        const minimistLib = fs.readFileSync(path.join(minimistLibPath, 'index.js'), 'utf-8');
        wrench.rmdirSyncRecursive(minimistLibPath);
        wrench.mkdirSyncRecursive(minimistLibPath);
        fs.writeFileSync(path.join(minimistLibPath, 'index.js'), minimistLib);
        
        // JS-adapter (1.5MB -> 620KB)
        const jsAdapterPath = path.join(stagingNodeModulesPath, 'hadouken-js-adapter');
        if (fs.existsSync(path.join(jsAdapterPath, 'node_modules'))) {
            wrench.rmdirSyncRecursive(path.join(jsAdapterPath, 'node_modules')); // 472KB
        }
        wrench.rmdirSyncRecursive(path.join(jsAdapterPath, 'out', 'repl')); // 8KB
        wrench.rmdirSyncRecursive(path.join(jsAdapterPath, 'out', 'resources')); // 172KB
        wrench.rmdirSyncRecursive(path.join(jsAdapterPath, 'out', 'types')); // 136KB
        fs.unlinkSync(path.join(jsAdapterPath, 'yarn.lock')); // 124KB
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

    grunt.registerTask('package-adapter', 'Package the js-adapter', function() {
        const done = this.async();

        asar.createPackage(jsAdapterPath, 'out/js-adapter.asar', function () {
            grunt.log.ok('Finished packaging the adapter as an asar');
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
};
