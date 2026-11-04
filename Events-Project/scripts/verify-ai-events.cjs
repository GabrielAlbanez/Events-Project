const assert = require("node:assert/strict"), {randomUUID}=require("node:crypto");
const load=require("./ai-events-test-loader.cjs")();
const {aiEventsAction,aiEventsSnapshot,pollAiEvents}=load("lib/aiEvents/service.ts");
const {parseOfficialEvent}=load("lib/aiEvents/provider.ts");
const {aiEventActionSchema}=load("schemas/aiEvents.ts");
const now=new Date("2030-01-01T00:00:00Z"), actor=randomUUID(), ordinary=randomUUID();
const url="https://www.sympla.com.br/evento/teste/123";
function fixture(name="Evento de teste") { return parseOfficialEvent(JSON.stringify({"@type":"MusicEvent",name,startDate:"2030-02-02T19:30:00-03:00",endDate:"2030-02-02T22:00:00-03:00",location:{address:{streetAddress:"Rua Exemplo, 100",addressLocality:"São Paulo",addressRegion:"SP"}},isAccessibleForFree:true}),url,"São Paulo",now); }
function memory() {
  let store={user:[{id:actor,role:"ADMIN",suspendedAt:null,suspendedUntil:null},{id:ordinary,role:"BASIC"}],aiEventAutomation:[],aiEventRun:[],aiEventCandidate:[],events:[],communitySignal:[],eventHistory:[],notification:[],follow:[]}, notes=[];
  const db={};
  const matches=(row,where={})=>Object.entries(where).every(([k,v])=>v&&typeof v==="object"&&!(v instanceof Date)?Object.entries(v).every(([op,x])=>op==="in"?x.includes(row[k]):op==="gte"?row[k]>=x:row[k]===v):row[k]===v);
  for(const name of Object.keys(store)) {
    const list=args=>{let rows=store[name].filter(r=>matches(r,args?.where)); if(args?.orderBy){const [k,d]=Object.entries(args.orderBy)[0]; rows.sort((a,b)=>(a[k]>b[k]?1:a[k]<b[k]?-1:0)*(d==="asc"?1:-1));}return rows.slice(0,args?.take??rows.length);};
    const create=async({data})=>{const row={id:randomUUID(),createdAt:now,status:name==="aiEventRun"?"QUEUED":name==="aiEventCandidate"?"PENDING":undefined,...(name==="aiEventAutomation"?{city:"São Paulo",enabled:false,maxPerRun:3}:{}),...data};store[name].push(row);return row;};
    db[name]={findUnique:async a=>list(a)[0]??null,findFirst:async a=>list(a)[0]??null,findMany:async a=>list(a),count:async a=>list(a).length,create,
      createMany:async({data})=>{for(const row of data)await create({data:row});return{count:data.length};},
      update:async a=>{const row=list(a)[0];assert.ok(row);Object.assign(row,a.data);return row;},
      updateMany:async a=>{const rows=list(a);rows.forEach(r=>Object.assign(r,a.data));return{count:rows.length};},
      upsert:async a=>{const row=list(a)[0];if(row){Object.assign(row,a.update);return row;}return create({data:a.create});}
    };
  }
  db.$queryRaw=async(strings,...values)=>{notes.push(strings.join("?"));return[];};
  db.$transaction=async fn=>{const backup=structuredClone(store), count=notes.length;try{return await fn(db);}catch(error){store=backup;notes.length=count;throw error;}};
  return {db,get store(){return store;},notes};
}
async function run(){
  let verified=fixture(), configured=true;
  const deps={configured:()=>configured,now:()=>now,discover:async()=>[url,url],inspect:async()=>verified};
  const m=memory(), db=m.db;
  const denied=fn=>assert.rejects(fn,error=>error.status===403);
  await denied(()=>aiEventsSnapshot(db,ordinary,deps));
  for(const input of [{action:"run"},{action:"inspect",url},{action:"approve",id:randomUUID()},{action:"reject",id:randomUUID()},{action:"settings",city:"São Paulo",maxPerRun:3,enabled:true,authorize:true}]) await denied(()=>aiEventsAction(db,ordinary,input,deps));
  assert.equal(m.store.events.length,0);
  assert.equal(aiEventActionSchema.safeParse({action:"settings",city:"SP",maxPerRun:6,enabled:true,authorize:true}).success,false);
  assert.equal(aiEventActionSchema.safeParse({action:"run",approvalMode:"AUTO"}).success,false);
  await assert.rejects(()=>aiEventsAction(db,actor,{action:"settings",city:"São Paulo",maxPerRun:2,enabled:true,authorize:false},deps),e=>e.status===400);
  configured=false;await assert.rejects(()=>aiEventsAction(db,actor,{action:"run"},deps),e=>e.status===503);
  await aiEventsAction(db,actor,{action:"settings",city:"São Paulo",maxPerRun:2,enabled:false,authorize:false},deps);
  await aiEventsAction(db,actor,{action:"inspect",url},deps);
  assert.equal(m.store.aiEventRun[0].status,"QUEUED");
  assert.equal(await pollAiEvents(db,deps),true);
  assert.equal(m.store.aiEventCandidate.length,1);assert.equal(m.store.events.length,0);assert.equal(m.store.aiEventRun[0].status,"SUCCEEDED");
  assert.ok(m.store.communitySignal.every(s=>s.room==="user:"+actor));
  let id=m.store.aiEventCandidate[0].id;
  verified=fixture("Fonte alterada");await assert.rejects(()=>aiEventsAction(db,actor,{action:"approve",id},deps),e=>e.status===409);assert.equal(m.store.events.length,0);assert.equal(m.store.aiEventCandidate[0].name,"Fonte alterada");
  await aiEventsAction(db,actor,{action:"approve",id},deps);assert.equal(m.store.events.length,1);assert.equal(m.store.events[0].status,"PUBLISHED");assert.equal(m.store.aiEventCandidate[0].approvedBy,actor);assert.ok(m.notes.some(n=>n.includes("pg_notify('eventmap_events_updated'")));
  await assert.rejects(()=>aiEventsAction(db,actor,{action:"approve",id},deps),e=>e.status===409);assert.equal(m.store.events.length,1);
  await aiEventsAction(db,actor,{action:"inspect",url},deps);await pollAiEvents(db,deps);assert.equal(m.store.aiEventCandidate.length,1);
  const snapshot=await aiEventsSnapshot(db,actor,deps);assert.equal("data" in snapshot.candidates[0],false);assert.equal(snapshot.config.approvalMode,"REVIEW");
  configured=true;await aiEventsAction(db,actor,{action:"settings",city:"São Paulo",maxPerRun:2,enabled:true,authorize:true},deps);
  m.store.aiEventAutomation[0].nextRunAt=now;await pollAiEvents(db,deps);assert.ok(m.store.aiEventRun.some(r=>r.trigger==="HOURLY"));assert.equal(m.store.events.length,1);
  m.store.aiEventAutomation[0].nextRunAt=now;m.store.user[0].role="BASIC";await pollAiEvents(db,deps);assert.equal(m.store.aiEventAutomation[0].enabled,false);
  const revoked=memory();await aiEventsAction(revoked.db,actor,{action:"inspect",url},deps);revoked.store.user[0].suspendedAt=now;await pollAiEvents(revoked.db,deps);assert.equal(revoked.store.aiEventCandidate.length,0);assert.equal(revoked.store.aiEventRun[0].status,"FAILED");
  const rejected=memory();await aiEventsAction(rejected.db,actor,{action:"inspect",url},deps);await pollAiEvents(rejected.db,deps);id=rejected.store.aiEventCandidate[0].id;await aiEventsAction(rejected.db,actor,{action:"reject",id},deps);await assert.rejects(()=>aiEventsAction(rejected.db,actor,{action:"approve",id},deps),e=>e.status===409);
  console.log("PASS AI service: ADMIN authorization, consent, missing key, queue, no worker publication, source changes, duplicate approval, provenance, dedup, private signals, hourly scheduling and revocation (in-memory transaction fixtures).");
}
run().catch(error=>{console.error(error);process.exitCode=1;});
