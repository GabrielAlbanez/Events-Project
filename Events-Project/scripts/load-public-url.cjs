const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const result = {exports:{}};
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/publicUrl.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
new Function('exports','module',source)(result.exports,result);
module.exports = result.exports;
