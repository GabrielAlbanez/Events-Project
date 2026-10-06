const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const mod = { exports: {} };
const output = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../lib/auth/impersonation.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
new Function("require", "module", "exports", output)(name => name === "./accountAccess" ? require("./load-account-access.cjs") : name === "./sessionCredential" ? require("./load-session-credential.cjs") : require(name), mod, mod.exports);
module.exports = { ...mod.exports, resolveImpersonationIdentity: async (db, token) => mod.exports.resolveImpersonationIdentity({ ...db, impersonationSession: db.impersonationSession ?? { findFirst: async () => null, findUnique: async () => null, updateMany: async () => ({ count: 0 }) } }, token) };
