const fs = require("node:fs"), path = require("node:path"), ts = require("typescript");
module.exports = function loader() {
  const cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const mod = {exports:{}}; cache.set(file,mod);
    const code = ts.transpileModule(fs.readFileSync(file,"utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
    const req = name => name.startsWith(".") ? load(path.resolve(path.dirname(file), name.replace(/\.js$/,"") + ".ts")) : require(name);
    new Function("require","module","exports",code)(req,mod,mod.exports);
    return mod.exports;
  }
  return load;
};
