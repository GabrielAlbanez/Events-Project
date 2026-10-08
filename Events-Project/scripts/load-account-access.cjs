const fs = require("node:fs");
const ts = require("typescript");
const mod = { exports: {} };
const output = ts.transpileModule(fs.readFileSync("lib/auth/accountAccess.ts", "utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
new Function("module", "exports", output)(mod,mod.exports);
module.exports=mod.exports;
