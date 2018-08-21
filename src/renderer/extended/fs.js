var extend = require('util')._extend;
var fs = require('fs');
var extendedFs = extend(fs, {
    internalModuleStat: process.binding('fs').internalModuleStat,
    internalModuleReadFile: process.binding('fs').internalModuleReadFile
});
module.exports = extendedFs;
