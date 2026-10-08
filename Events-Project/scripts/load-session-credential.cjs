const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const moduleResult = { exports: {} };
const output = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../lib/auth/sessionCredential.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
new Function("require", "module", "exports", output)(require, moduleResult, moduleResult.exports);
module.exports = moduleResult.exports;
