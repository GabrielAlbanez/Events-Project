const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const result = {exports:{}};
const output = ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/auth/googleProfileImage.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
new Function('exports','module',output)(result.exports,result);
module.exports = result.exports;
