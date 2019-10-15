'use strict';

/**
 *
 * Build tasks to facilitate the creation of an asar file.
 *
 */

const fs = require('fs');
const path = require('path');
const asar = require('asar');
const https = require('https');
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
    grunt.registerTask('default', ['submodules-update', 'build-pac']);
    grunt.registerTask('deploy', ['build-dev', 'copy-local']);

    // Load all grunt tasks matching the ['grunt-*', '@*/grunt-*'] patterns
    require('load-grunt-tasks')(grunt);

    grunt.initConfig({
        copy: {
            assets: { // assets: images, htmls, icons
                files: [{
                    src: ['assets/**/*'],
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
            },
            jsAdapter: {
                files: [{
                    cwd: './js-adapter/out',
                    expand: true,
                    src: ['js-adapter.js'],
                    dest: 'staging/core/js-adapter'
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
                rulesDirectory: [
                    'node_modules/tslint-microsoft-contrib',
                    'test/lint-rules/out'
                ],
                force: false
            },
            files: {
                src: [
                    'src/**/*.ts',
                    '!src/**/*.d.ts',
                    'test/**/*.ts',
                    '!test/**/*.d.ts'
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
        'js-adapter',
        'mochaTest'
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
        'sign-asars'
    ]);

    grunt.registerTask('typescript', [
        'tslint-rules',
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
        const done = this.async();

        // Clean RxJS library (19MB -> 148KB)
        const libRxjsDir = path.join('./lib', 'rxjs');
        const libRxjs = path.join(libRxjsDir, 'Rx.min.js');
        const rxjsStagingPath = path.join(stagingNodeModulesPath, 'rxjs');
        const rxjsStagingIndex = path.join(rxjsStagingPath, 'index.js');
        const rxjsPackageJsonPath = './node_modules/rxjs/package.json';
        const rxjsVersion = require(rxjsPackageJsonPath).version;
        const rxjsMinUrl = `https://unpkg.com/rxjs@${rxjsVersion}/bundles/Rx.min.js`;

        wrench.rmdirSyncRecursive(rxjsStagingPath);
        wrench.mkdirSyncRecursive(rxjsStagingPath);

        const resolveRxjs = new Promise((resolve, rej) => {
            try {
                fs.copyFileSync(libRxjs, rxjsStagingIndex);
                resolve();
            } catch (error) {
                https.get(rxjsMinUrl, (res) => {
                    if (res.statusCode !== 200) {
                        grunt.log.error('HTTPS request failed');
                        rej();
                    }

                    let data = '';
                    res.on('data', (d) => {
                        data += d;
                    });

                    res.on('end', () => {
                        if (!fs.existsSync(libRxjsDir)) {
                            fs.mkdirSync(libRxjsDir);
                        }
                        fs.writeFileSync(libRxjs, data);
                        fs.writeFileSync(path.join(rxjsStagingPath, 'index.js'), data);
                        resolve();
                    });
                }).on('error', (e) => {
                    grunt.log.error(e);
                    rej();
                });
            }
        });

        resolveRxjs.then(() => {
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
            done();
        });
    });

    grunt.registerTask('rebuild-native-modules', 'Rebuild native modules', function() {
        const done = this.async();

        const rebuildOptions = {
            buildPath: __dirname,
            electronVersion: '7.0.0-beta.3'
        };

        // don't rebuild the optionalDependencies since they're only used
        // on non-Windows systems
        if (process.platform === 'win32') {
            rebuildOptions.types = ['prod'];
        }

        electronRebuild.rebuild(rebuildOptions).then(() => {
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

    /*
        Task that updates submodules and installs their dependencies
    */
    grunt.registerTask('submodules-update', () => {
        grunt.log.subhead('Updating submodules...');
        childProcess.execSync('git submodule update --init --recursive');

        grunt.log.subhead('Installing js-adapter dependencies...');
        childProcess.execSync('cd js-adapter && npm install');
    });

    /*
        Build webpack'ed js-adapter
    */
    grunt.registerTask('js-adapter', () => {
        const gruntSubmodPath = path.resolve('./js-adapter/node_modules/.bin/grunt');
        grunt.log.subhead('Building js-adapter...');
        childProcess.execSync(`cd js-adapter && ${gruntSubmodPath} webpack`);
    });

    /*
        Build custom TSLint rules
    */
    grunt.registerTask('tslint-rules', () => {
        const tscPath = path.resolve('./node_modules/typescript/bin/tsc');
        grunt.log.subhead('Building custom TSLint rules...');
        childProcess.execSync(`cd test/lint-rules && node ${tscPath}`);
    });
};
