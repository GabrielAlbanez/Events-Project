const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const {NextRequest}=require('next/server');
const mod={exports:{}};
const code=ts.transpileModule(fs.readFileSync('lib/auth/impersonationHttp.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
new Function('require','module','exports',code)(name=>name==='@/lib/publicUrl'?require('./load-public-url.cjs'):name.startsWith('@/')?{}:require(name),mod,mod.exports);
const previous=process.env.NEXTAUTH_URL;
try {
 process.env.NEXTAUTH_URL='https://preview.example.invalid';
 const request=origin=>new NextRequest('http://localhost:3001/api/admin/impersonation/start',{method:'POST',headers:origin?{origin}:{}});
 for(const origin of ['https://preview.example.invalid','http://localhost:3001']) assert.equal(mod.exports.sameOrigin(request(origin)),true);
 for(const origin of [null,'https://attacker.example.invalid','http://preview.example.invalid','https://preview.example.invalid.attacker.invalid']) assert.equal(mod.exports.sameOrigin(request(origin)),false);
 for(const value of [undefined,'invalid']){if(value===undefined)delete process.env.NEXTAUTH_URL;else process.env.NEXTAUTH_URL=value;assert.equal(mod.exports.sameOrigin(request('https://preview.example.invalid')),false);}
 console.log('PASS: admin local/public origin, missing and foreign origins rejected, invalid configuration rejected');
} finally {if(previous===undefined)delete process.env.NEXTAUTH_URL;else process.env.NEXTAUTH_URL=previous;}
