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

let fs = require('fs');
let path = require('path');
let me = fs.readFileSync(path.join(__dirname, 'api-decorator.js'), 'utf8');

let jsAdapter = fs.readFileSync(path.join(process.resourcesPath, 'adapter.asar', 'openfin-desktop.js'), 'utf8');

// Remove strict (Prevents, as of now, poorly understood memory lifetime scoping issues with remote module)
me = me.slice(13);

module.exports.api = `${me} ; ${jsAdapter} ;`;
