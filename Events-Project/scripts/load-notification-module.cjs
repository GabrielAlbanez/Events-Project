// Execute the real shared notification modules in isolated TypeScript regression scripts.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
module.exports = function loadNotificationModule(name) {
  const file = path.join('lib/notifications', path.basename(name).replace(/\.(js|ts)$/, '') + '.ts');
  const result = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', source)(dependency => dependency.startsWith('./') ? loadNotificationModule(dependency) : require(dependency), result, result.exports);
  return result.exports;
};
