const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const {NextRequest} = require('next/server');
const mod = {exports:{}};
const source = ts.transpileModule(fs.readFileSync('app/api/events/[id]/registration/route.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
class AttendanceError extends Error {}
new Function('require','module','exports',source)(name => {
 if(name === '@/lib/adminAuth') return {getAuthenticatedUser:async()=>null};
 if(name === '@/lib/services/attendance') return {AttendanceError};
 return require(name);
},mod,mod.exports);
(async()=>{
 const previous = process.env.NEXTAUTH_URL;
 try {
  process.env.NEXTAUTH_URL='https://preview.example.invalid';
  for(const method of ['POST','DELETE']) {
   for(const [origin,expected] of [['https://preview.example.invalid',401],['http://localhost:3001',401],['https://attacker.example.invalid',403],['https://preview.example.invalid.attacker.invalid',403]]) {
    const response=await mod.exports[method](new NextRequest('http://localhost:3001/api/events/test/registration',{method,headers:{origin}}),{params:{id:'test'}});
    assert.equal(response.status,expected,method+' '+origin);
   }
   delete process.env.NEXTAUTH_URL;
   assert.equal((await mod.exports[method](new NextRequest('http://localhost:3001/api/events/test/registration',{method,headers:{origin:'https://preview.example.invalid'}}),{params:{id:'test'}})).status,403);
   process.env.NEXTAUTH_URL='https://preview.example.invalid';
  }
  console.log('PASS: configured tunnel and local origins require authentication; foreign origins rejected for POST and DELETE');
 } finally { if(previous===undefined) delete process.env.NEXTAUTH_URL; else process.env.NEXTAUTH_URL=previous; }
})().catch(error=>{console.error(error);process.exitCode=1;});
