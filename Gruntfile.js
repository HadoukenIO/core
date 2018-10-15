'use strict';

/**
 *
 * Build tasks to facilitate the creation of an asar file.
 *
 */

const fs = require('fs');
const path = require('path');
const asar = require('asar');
const electronRebuild = require('electron-rebuild');
const wrench = require('wrench');
const openfinSign = require('openfin-sign'); // OpenFin signing module
const childProcess = require('child_process');

// Use NPM to query immediate and nested production dependencies
const npmDeps = JSON.parse(childProcess.execSync('npm ls --json --prod').toString('utf8'));
const fullDependencies = Object.entries(npmDeps.dependencies);

// Flatten all production dependencies, including nested ones, into an array.
// Prevents duplicates.
function flattenDeep(arr1, usedModules) {
    return arr1.reduce((acc, val) => {
        // Add top level dependencies without duplicates
        if(!usedModules[val[0]]) {
            usedModules[val[0]] = true;
            acc.push(`${val[0]}/**`);
        }

        // Handle nested dependencies
        const subDep = val[1].dependencies;
        if(typeof subDep === 'object') {
            acc = acc.concat(flattenDeep(Object.entries(subDep), usedModules));
        }

        return acc;
    }, []);
}

const dependencies = flattenDeep(fullDependencies, {});
const srcFiles = ['src/**/*.js', 'index.js', 'Gruntfile.js'];
const stagingNodeModulesPath = path.join('staging', 'core', 'node_modules');
const jsAdapterPath = path.join('node_modules', 'hadouken-js-adapter', 'out');

// optional dependencies that we ship.
const optionalDependencies = [
    'bindings/**',  // needed by unix-dgram
    'unix-dgram/**'
];

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
            assets: { // assets: images, htmls, icons
                files: [{
                    src: ['assets/*'],
                    dest: 'staging/core/'
                }]
            },
            lib: {
                files: [{
                    cwd: './node_modules',
                    expand: true,
                    src: [dependencies, optionalDependencies],
                    dest: stagingNodeModulesPath
                }]
            },
            etc: { // other artifacts that need copying
                files: [{
                    src: ['package.json'],
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
                project: 'tslint.json',
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

    grunt.registerTask('test', [
        'jshint',
        'jsbeautifier',
        'clean',
        'babel',
        'typescript',
        'mochaTest',
    ]);

    grunt.registerTask('build-dev', [
        'test',
        'rebuild-native-modules',
        'copy',
        'clean-up-dependencies',
        'sign-files',
        'sign-adapter'
    ]);

    grunt.registerTask('build-pac', [
        'build-dev',
        'package',
        'package-adapter',
        'sign-asars'
    ]);

    grunt.registerTask('typescript', [
        'tslint',
        'ts'
    ]);

    grunt.registerTask('sign-files', function() {
        wrench.readdirSyncRecursive('staging/core').forEach(function(filename) {
            let filepath = path.join('staging', 'core', filename);

            if (!fs.statSync(filepath).isDirectory() && !filename.endsWith('.ofds')) {
                openfinSign(filepath);
            }
        });
        grunt.log.ok('Finished signing files.');
    });

    grunt.registerTask('sign-asars', function() {
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
        wrench.rmdirSyncRecursive(path.join(jsAdapterPath, 'out', 'resources')); // 172KB
        wrench.rmdirSyncRecursive(path.join(jsAdapterPath, 'out', 'types')); // 136KB
    });

    grunt.registerTask('rebuild-native-modules', 'Rebuild native modules', function() {
        const done = this.async();

        electronRebuild.rebuild({
            buildPath: __dirname,
            electronVersion: '3.0.0'
        }).then(() => {
            grunt.log.writeln('Rebuild successful!');
            done();
        }).catch(e => {
            grunt.log.error('Rebuilding failed!');
            grunt.log.error(e);
            done();
        });
    });

    grunt.registerTask('package', 'Package in an asar', function() {
        const done = this.async();

        //delete build/test related files before packaging.
        grunt.file.delete('staging/core/Gruntfile.js');
        wrench.rmdirSyncRecursive('staging/core/test', true);
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
