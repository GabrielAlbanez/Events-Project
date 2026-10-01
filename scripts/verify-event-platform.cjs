const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ts=require("typescript");
const {createRequire}=require("node:module");
const nativeRequire=createRequire(path.join(process.cwd(),"package.json"));
const cache=new Map();
let activeUser=null,db=null,testUserIds=[];
function load(relative){
 const filename=path.resolve(relative);
 if(cache.has(filename))return cache.get(filename).exports;
 const module={exports:{}};cache.set(filename,module);
 const source=ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
 const requireLocal=name=>{
  if(name==="@/lib/prisma")return {__esModule:true,default:db};
  if(name==="@/lib/adminAuth")return {getAuthenticatedUser:async()=>activeUser,getAuthenticatedAdminId:async()=>activeUser?.role==="ADMIN"?activeUser.id:null};
  if(name==="@/lib/eventNotifications"){
   const real=load("lib/eventNotifications.ts");
   return {notifyEventAudience:async(tx,event,notice)=>{
    const scoped=new Proxy(tx,{get(target,key){if(key!=="user")return target[key];return new Proxy(target.user,{get(user,key){if(key!=="findMany")return user[key];return args=>user.findMany({...args,where:{...args.where,id:{in:testUserIds}}});}});}});
    return real.notifyEventAudience(scoped,event,notice);
   }};
  }
  if(name.startsWith("@/"))return load(name.slice(2)+".ts");
  return nativeRequire(name);
 };
 new Function("require","module","exports","__filename","__dirname",source)(requireLocal,module,module.exports,filename,path.dirname(filename));
 return module.exports;
}
async function run(){
 const {getSessionRole,canAccessPath,isPublicPath}=load("lib/authPolicy.ts");
 assert.equal(getSessionRole(null),"GUEST");
 assert.equal(getSessionRole({id:"",role:"ADMIN"}),"GUEST");
 assert.equal(getSessionRole({id:"test",role:"ADMIN"}),"ADMIN");
 assert.equal(canAccessPath("BASIC","/eventos/test/editar"),false);
 assert.equal(canAccessPath("PROMOTER","/eventos/test/editar"),true);
 assert.equal(isPublicPath("/eventos/test"),true);
 assert.equal(isPublicPath("/eventos/test/editar"),false);
 assert.equal(getSessionRole({id:"test",role:"ADMIN",provider:"dev-admin"}),"GUEST");
 console.log("PASS: route access policy and retired development identity isolation");
 const userAdministration=load("lib/services/userAdministration.ts");
 assert.equal((await userAdministration.getAllUsers(async()=>null)).status,"error");
 assert.equal((await userAdministration.deleteUser({id:"test"},async()=>null)).status,"error");
 assert.equal((await userAdministration.alterRoleUser({id:"test"},"ADMIN",async()=>null)).status,"error");
 console.log("PASS: administrative services reject unauthenticated access before persistence");
 const {parseEventInput}=load("schemas/eventInput.ts");
 const {eventInstant}=load("lib/eventTime.ts");
 const fields={nome:"Evento de teste",descricao:"Descrição detalhada do evento.",endereco:"Local de teste",dataInicio:"2027-01-02",dataFim:"2027-01-02",startTime:"10:00",endTime:"11:00",isFree:"true",category:"Cultura"};
 const form=overrides=>{const data=new FormData();for(const [key,value] of Object.entries({...fields,...overrides}))data.set(key,value);return data;};
 assert.equal(parseEventInput(form(),true).success,true);
 for(const change of [{LinkParaCompraIngresso:"javascript:alert(1)"},{dataFim:"2026-02-30"},{dataFim:"2026-01-01"},{endTime:"09:00"},{startTime:"25:00"},{lat:"10"},{priceCents:"-1"}])assert.equal(parseEventInput(form(change),true).success,false);
 assert.equal(parseEventInput(new FormData(),false).success,true);
 assert.equal(parseEventInput(new FormData(),true).success,false);
 assert.equal(eventInstant("2027-01-02","10:00","America/Sao_Paulo").toISOString(),"2027-01-02T13:00:00.000Z");
 assert.equal(eventInstant("2027-01-02","10:00","Invalid/Timezone"),null);
 console.log("PASS: input validation, incomplete drafts, chronology, safe URLs and timezone");
 if(process.env.FEATURE_TEST_DATABASE!=="true")return;
 require("@next/env").loadEnvConfig(process.cwd());
 const {PrismaClient}=nativeRequire("@prisma/client"),{randomUUID}=require("node:crypto"),bcrypt=nativeRequire("bcrypt");
 db=new PrismaClient();
 const prefix="feature-test-"+randomUUID();
 const createdEvents=new Set();
 let phase="setup";
 try{
  const password=await bcrypt.hash(randomUUID(),10);
  const people=[];
  for(const role of ["ADMIN","PROMOTER","BASIC","PROMOTER"])people.push(await db.user.create({data:{name:"Feature Test",email:prefix+"-"+people.length+"@example.invalid",password,role,emailVerified:true}}));
  testUserIds=people.map(user=>user.id);
  const [admin,promoter,basic,other]=people;
  const actions=load("app/(actions)/eventos/actions.ts"),validation=load("app/(actions)/validateEvents/action.ts"),engagement=load("app/(actions)/engagement/action.ts"),queries=load("lib/eventQueries.ts"),history=load("app/(actions)/eventHistory/action.ts");
  phase="draft and ownership";activeUser=promoter;
  const draft=await actions.salvarRascunho(new FormData(),promoter.id);assert.equal(draft.success,true);createdEvents.add(draft.evento.id);
  assert.equal(draft.evento.status,"DRAFT");assert.equal(await queries.getPublicEvent(draft.evento.id),null);
  activeUser=other;assert.equal(await actions.getOwnedEvent(draft.evento.id),null);
  activeUser=basic;assert.equal((await actions.salvarRascunho(new FormData(),basic.id)).success,false);
  activeUser=promoter;
  const image=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2uoAAAAASUVORK5CYII=","base64");
  const submitted=form();submitted.set("banner",new File([image],"test.png",{type:"image/png"}));
  const saved=await actions.atualizarEvento(draft.evento.id,submitted,true);assert.equal(saved.success,true);assert.equal(saved.evento.status,"PENDING");assert.equal(await queries.getPublicEvent(saved.evento.id),null);
  phase="correction privacy";activeUser=admin;
  assert.equal((await actions.solicitarCorrecao(saved.evento.id,"Corrigir as informações de acesso.")).success,true);
  activeUser=promoter;
  assert.equal((await actions.getOwnedEvent(saved.evento.id)).status,"CHANGES_REQUESTED");
  assert.equal((await actions.atualizarEvento(saved.evento.id,form(),true)).success,true);
  activeUser=basic;assert.equal((await engagement.toggleFollow(promoter.id)).success,true);
  assert.equal((await validation.validateEvents([saved.evento.id],basic.id)).status,"error");
  phase="publish followers and public projection";activeUser=admin;
  const approved=await validation.validateEvents([saved.evento.id],admin.id);assert.equal(approved.validatedEventIds.length,1);
  const publicEvent=await queries.getPublicEvent(saved.evento.id);assert.equal(publicEvent.status,"PUBLISHED");
  for(const person of [publicEvent.user,publicEvent.validator])for(const key of ["password","email","accounts","sessions","role"])assert.equal(Object.hasOwn(person,key),false);
  activeUser=basic;const notices=await engagement.getNotifications();assert.ok(notices.some(item=>item.title==="Evento publicado"));assert.ok(notices.every(item=>!item.message.includes("Corrigir")));
  phase="favorites reminders and edits";assert.equal((await engagement.toggleFavorite(saved.evento.id)).saved,true);
  assert.equal((await engagement.setEventReminder(saved.evento.id,60)).success,true);
  assert.equal((await engagement.getFavoriteState(saved.evento.id)).reminderMinutes,60);
  assert.equal((await history.getEventHistory(saved.evento.id)).status,"error");
  activeUser=promoter;const changed=await actions.atualizarEvento(saved.evento.id,form({nome:"Evento revisado"}),true);assert.equal(changed.evento.status,"PENDING");assert.equal(await queries.getPublicEvent(saved.evento.id),null);
  activeUser=admin;await validation.validateEvents([saved.evento.id],admin.id);
  phase="duplicate and cancellation";activeUser=promoter;
  const duplicate=await actions.duplicarEvento(saved.evento.id);assert.equal(duplicate.success,true);createdEvents.add(duplicate.evento.id);assert.equal(duplicate.evento.status,"DRAFT");assert.equal(duplicate.evento.validate,false);
  assert.equal((await actions.cancelarEvento(saved.evento.id)).success,true);assert.equal((await queries.getPublicEvent(saved.evento.id)).status,"CANCELLED");
  activeUser=basic;assert.ok((await engagement.getSavedEvents()).some(event=>event.status==="CANCELLED"));
  assert.ok((await engagement.getNotifications()).some(notice=>notice.title==="Evento cancelado"));
  activeUser=promoter;assert.ok((await history.getEventHistory(saved.evento.id)).history.some(item=>item.action==="CANCELLED"));
  assert.equal((await engagement.getPromoterStats()).totals.favorites,1);
  console.log("PASS: database lifecycle, ownership, moderation privacy, safe public data, followers, favorites, reminders, history and cancellation");
 }catch(error){console.error("FAIL feature integration at "+phase+": "+(error.code||error.name||"error"));throw new Error("Feature integration failed");}
 finally{
  const events=await db.events.findMany({where:{userId:{in:testUserIds}},select:{id:true,banner:true,carrossel:true}});
  const images=new Set(events.flatMap(event=>[event.banner,...event.carrossel]).filter(url=>url.startsWith("/uploads/")));
  for(const event of events)createdEvents.add(event.id);
  await db.eventHistory.deleteMany({where:{eventId:{in:Array.from(createdEvents)}}});
  await db.events.deleteMany({where:{id:{in:Array.from(createdEvents)}}});
  await db.user.deleteMany({where:{id:{in:testUserIds}}});
  for(const url of images){const references=await db.events.count({where:{OR:[{banner:url},{carrossel:{has:url}}]}});if(!references)await fs.promises.unlink(path.join(process.cwd(),"public",url)).catch(()=>undefined);}
  await db.$disconnect();
 }
}
run().catch(()=>{process.exitCode=1;});
