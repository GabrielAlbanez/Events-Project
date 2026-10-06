const fs = require("node:fs");
const ts = require("typescript");
const moduleInstance = { exports: {} };
const output = ts.transpileModule(fs.readFileSync("lib/auth/impersonation.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
new Function("require", "module", "exports", output)(
  name => name === "./accountAccess" ? require("./load-account-access.cjs") : name === "./sessionCredential" ? require("./load-session-credential.cjs") : require(name),
  moduleInstance,
  moduleInstance.exports,
);
module.exports = moduleInstance.exports;
