const fs = require('node:fs');
const ts = require('typescript');
module.exports = function load(file, overrides = {}) {
  const result = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  new Function('require','module','exports',output)(name => Object.hasOwn(overrides,name) ? overrides[name] : require(name), result, result.exports);
  return result.exports;
};
