const assert=require("node:assert/strict"),fs=require("node:fs"),ts=require("typescript");
const load=require("./ai-events-test-loader.cjs")();const schema=load("schemas/aiEvents.ts");
const {NextRequest}=require("next/server");
const cache=new Map();let admin=null,calls=0,fail=false;
function local(file){if(cache.has(file))return cache.get(file).exports;const mod={exports:{}};cache.set(file,mod);const code=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;const req=name=>name==="@/lib/adminAuth"?{getAuthenticatedAdminId:async()=>admin}:name==="@/lib/prisma"?{default:{},__esModule:true}:name==="@/lib/aiEvents/service"?{AiEventsError:class extends Error{constructor(status,message){super(message);this.status=status;}},aiEventsAction:async()=>{calls++},aiEventsSnapshot:async()=>{if(fail)throw Error("private database details");return {candidates:[]}}}:name==="@/schemas/aiEvents"?schema:name==="@/lib/community/http"?local("lib/community/http.ts"):name==="@/lib/community/common"||name==="./common"?local("lib/community/common.ts"):name==="@/lib/publicUrl"?load("lib/publicUrl.ts"):require(name);new Function("require","module","exports",code)(req,mod,mod.exports);return mod.exports;}
(async()=>{const route=local("app/api/admin/ai-events/route.ts");const req=(body,origin="http://localhost:3100")=>new NextRequest("http://localhost:3100/api/admin/ai-events",{method:"POST",headers:{origin,"content-type":"application/json"},body:typeof body==="string"?body:JSON.stringify(body)});
// Use the same error class identity as the route's imported module.
let response=await route.GET(new NextRequest("http://localhost:3100/api/admin/ai-events"));assert.equal(response.status,403);
admin="fixture-admin";response=await route.POST(req({action:"run"},"https://evil.example"));assert.equal(response.status,403);assert.equal(calls,0);
response=await route.POST(req({action:"run",automatic:true}));assert.equal(response.status,400);
response=await route.POST(req("bad JSON"));assert.equal(response.status,400);
response=await route.POST(req("x".repeat(16001)));assert.equal(response.status,413);
response=await route.POST(req({action:"run"}));assert.equal(response.status,200);assert.equal(calls,1);assert.equal(response.headers.get("cache-control"),"private, no-store");
fail=true;response=await route.GET(new NextRequest("http://localhost:3100/api/admin/ai-events"));assert.equal(response.status,503);assert.equal((await response.text()).includes("private database details"),false);
console.log("PASS AI API handlers: unauthenticated denial, origin, strict schema, malformed/oversize bodies, no-store and sanitized failures (mock auth/service; real request parsing).");})().catch(e=>{console.error(e);process.exitCode=1});
