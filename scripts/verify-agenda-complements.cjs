const assert = require("node:assert/strict"), fs = require("node:fs"), ts = require("typescript");
function load(file, dependencies={}) {const m={exports:{}};new Function("require","module","exports",ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText)(name=>Object.hasOwn(dependencies,name)?dependencies[name]:require(name),m,m.exports);return m.exports;}
(async()=>{
 const time=load("lib/eventTime.ts");const rank=load("lib/eventRecommendations.ts",{"@/lib/eventTime":time});const invites=load("lib/planInvite.ts");
 const base={id:"first",nome:"Show público",descricao:"",endereco:"Campinas",dataInicio:"2099-01-01",dataFim:"2099-01-01",startTime:"18:00",endTime:"22:00",timezone:"America/Sao_Paulo",status:"PUBLISHED",category:"Música",lat:-22.9,lng:-47.06,userId:"organizer"};
 const old={...base,id:"old",dataInicio:"2020-01-01",dataFim:"2020-01-01"},cancelled={...base,id:"cancelled",status:"CANCELLED"},pending={...base,id:"pending",status:"PENDING"};
 const preference={...base,id:"preference",userId:"followed",category:"Teatro"};
 const ranked=rank.rankRecommendedEvents([base,base,old,cancelled,pending,preference],[{category:"Música",lat:null,lng:null}],["followed"]);
 assert.deepEqual(ranked.map(r=>r.event.id),["preference","first"]);
 assert.match(ranked[0].reason,/organizador/);assert.match(ranked[1].reason,/categoria/);
 const text=invites.buildPlanInvite([{...base,email:"private@example.com"},cancelled,pending,base],"https://example.com/other");
 assert.equal((text.match(/https:\/\/example.com\/eventos\/first/g)||[]).length,1);assert.ok(!text.includes("private@example.com"));assert.ok(!text.includes("cancelled"));
 assert.throws(()=>invites.buildPlanInvite([cancelled],"https://example.com"));assert.throws(()=>invites.buildPlanInvite([base],"javascript:alert(1)"));
 const many=invites.buildPlanInvite(Array.from({length:9},(_,i)=>({...base,id:String(i)})),"https://example.com");assert.equal((many.match(/https:\/\//g)||[]).length,5);
 let owner=null;const calls=[];const db={favorite:{findMany:async q=>{calls.push(q);return [{event:{category:"Música",lat:null,lng:null}}];}},follow:{findMany:async q=>{calls.push(q);return [{promoterId:"followed"}];}},events:{findMany:async q=>{calls.push(q);return [base,preference];}}};
 const service=load("lib/services/recommendations.ts",{"@/lib/prisma":{__esModule:true,default:db},"@/lib/eventQueries":{publicEventSelect:{id:true,nome:true}},"@/lib/eventRecommendations":rank});
 assert.deepEqual(await service.getRecommendedEvents(async()=>owner),[]);assert.equal(calls.length,0);
 owner={id:"session-owner",role:"BASIC"};assert.equal((await service.getRecommendedEvents(async()=>owner)).length,2);
 assert.equal(calls[0].where.userId,owner.id);assert.equal(calls[1].where.userId,owner.id);
 for(const q of calls.slice(2)){assert.equal(q.where.status,"PUBLISHED");assert.equal(q.where.favorites.none.userId,owner.id);assert.equal(q.take,80);assert.equal(q.select.email,undefined);}
 console.log("PASS: recommendation ranking/access bounds, public selected invitations and private-data exclusion");
})().catch(error=>{console.error(error);process.exitCode=1;});
