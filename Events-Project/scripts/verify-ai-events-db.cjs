const assert=require("node:assert/strict"),{randomUUID}=require("node:crypto");
if(process.env.AI_EVENTS_TEST_DATABASE!=="true")throw Error("Explicit AI_EVENTS_TEST_DATABASE=true required");
const load=require("./ai-events-test-loader.cjs")();
const {PrismaClient}=require("@prisma/client"),{aiEventsAction,pollAiEvents,aiEventsSnapshot}=load("lib/aiEvents/service.ts"),{parseOfficialEvent}=load("lib/aiEvents/provider.ts");
const db=new PrismaClient({log:[]}),rollback=Error("ROLLBACK_FIXTURES"),actor=randomUUID(),url="https://www.sympla.com.br/evento/test-fixture/"+randomUUID();
(async()=>{
try{await db.$transaction(async tx=>{
 const before=await tx.events.count();
 await tx.user.create({data:{id:actor,name:"AI validation temporary fixture",email:"ai-validation-"+actor+"@example.invalid",role:"ADMIN"}});
 // Isolate the transaction from any existing jobs/config without committing these edits.
 await tx.aiEventRun.updateMany({where:{status:{in:["QUEUED","RUNNING"]}},data:{status:"FAILED"}});
 await tx.aiEventAutomation.deleteMany({where:{id:"default"}});
 const nested=new Proxy(tx,{get(target,key){return key==="$transaction"?async fn=>fn(tx):target[key]}});
 const now=new Date(),start=new Date(now.getTime()+7*86400000),end=new Date(start.getTime()+2*3600000);
 const verified=parseOfficialEvent(JSON.stringify({"@type":"Event",name:"Transactional verification fixture",startDate:start.toISOString(),endDate:end.toISOString(),isAccessibleForFree:true,location:{address:{streetAddress:"Rua Teste, 100",addressLocality:"São Paulo",addressRegion:"SP"}}}),url,"São Paulo",now);
 const deps={configured:()=>false,now:()=>now,inspect:async()=>verified,discover:async()=>[url]};
 await aiEventsAction(nested,actor,{action:"inspect",url},deps);assert.equal(await pollAiEvents(nested,deps),true);
 const snapshot=await aiEventsSnapshot(nested,actor,deps),candidate=snapshot.candidates.find(c=>c.sourceUrl===url);assert.ok(candidate);assert.equal(candidate.status,"PENDING");assert.equal(await tx.events.count(),before);
 await aiEventsAction(nested,actor,{action:"approve",id:candidate.id},deps);
 const saved=await tx.aiEventCandidate.findUnique({where:{id:candidate.id},include:{event:true}});assert.equal(saved.event.status,"PUBLISHED");assert.equal(saved.approvedBy,actor);assert.equal(saved.event.userId,actor);
 await assert.rejects(()=>aiEventsAction(nested,actor,{action:"approve",id:candidate.id},deps),e=>e.status===409);
 assert.ok(await tx.communitySignal.count({where:{room:"user:"+actor}}));
 throw rollback;
},{timeout:60000,maxWait:15000});}catch(error){if(error!==rollback)throw error;}
assert.equal(await db.user.count({where:{id:actor}}),0);assert.equal(await db.aiEventCandidate.count({where:{sourceUrl:url}}),0);
console.log("PASS PostgreSQL AI queue -> pending -> individual approval -> dedup/private signals; all fixtures rolled back, no event published persistently.");
})().catch(error=>{console.error("AI database validation failed:",error.code||error.name, error.meta?.code || "");process.exitCode=1}).finally(()=>db.$disconnect());
