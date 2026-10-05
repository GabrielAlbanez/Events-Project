const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const {NextRequest} = require('next/server');
class CommunityError extends Error { constructor(status,message){super(message);this.status=status;} }
const mod={exports:{}};
const source=ts.transpileModule(fs.readFileSync('lib/community/http.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
new Function('require','module','exports',source)(name=>name==='@/lib/publicUrl'?require('./load-public-url.cjs'):name==='./common'?{CommunityError}:require(name),mod,mod.exports);
const previous=process.env.NEXTAUTH_URL;
try {
 process.env.NEXTAUTH_URL='https://preview.example.invalid';
 const request=(origin,extra={})=>new NextRequest('http://localhost:3001/api/community/rooms/test',{method:'POST',headers:{...(origin?{origin}:{}),...extra}});
 for(const origin of ['https://preview.example.invalid','http://localhost:3001',null]) assert.doesNotThrow(()=>mod.exports.checkOrigin(request(origin)));
 for(const origin of ['https://attacker.example.invalid','https://preview.example.invalid.attacker.invalid','http://preview.example.invalid']) assert.throws(()=>mod.exports.checkOrigin(request(origin)),error=>error.status===403);
 assert.throws(()=>mod.exports.checkOrigin(request('https://attacker.example.invalid',{'x-forwarded-host':'attacker.example.invalid','x-forwarded-proto':'https'})),error=>error.status===403);
 assert.throws(()=>mod.exports.checkOrigin(request('https://preview.example.invalid',{'content-length':'16001'})),error=>error.status===413);
 for(const value of [undefined,'invalid-url']) { if(value===undefined) delete process.env.NEXTAUTH_URL; else process.env.NEXTAUTH_URL=value; assert.throws(()=>mod.exports.checkOrigin(request('https://preview.example.invalid')),error=>error.status===403); }
 console.log('PASS: community public/local origin, foreign origin rejection, forged proxy headers, invalid configuration and body limit');
} finally {if(previous===undefined) delete process.env.NEXTAUTH_URL; else process.env.NEXTAUTH_URL=previous;}
