const assert=require("node:assert/strict");
const {randomUUID}=require("node:crypto");
const {PrismaClient}=require("@prisma/client");
const bcrypt=require("bcrypt");
const {io}=require("socket.io-client");
require("@next/env").loadEnvConfig(process.cwd());
const base=process.env.FEATURE_HTTP_URL||"http://localhost:3000",db=new PrismaClient();
let users=[],eventIds=[],sockets=[],phase="setup";
async function signIn(provider,fields={}){
 const csrfResponse=await fetch(base+"/api/auth/csrf");const csrf=await csrfResponse.json();
 const csrfCookie=csrfResponse.headers.getSetCookie().find(value=>value.startsWith("next-auth.csrf-token=")).split(";")[0];
 const response=await fetch(base+"/api/auth/callback/"+provider,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",Cookie:csrfCookie},body:new URLSearchParams({csrfToken:csrf.csrfToken,callbackUrl:base+"/",json:"true",...fields}),redirect:"manual"});
 return response.headers.getSetCookie().find(value=>value.startsWith("next-auth.session-token="))?.split(";")[0];
}
async function connect(cookie){
 const socket=io(base,{transports:["websocket"],extraHeaders:{Cookie:cookie},reconnection:false});sockets.push(socket);
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("socket timeout")),5000);socket.once("connect",()=>{clearTimeout(timer);resolve();});socket.once("connect_error",reject);});
 return socket;
}
function signal(socket,event){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(event+" timeout")),12000);socket.once(event,value=>{clearTimeout(timer);resolve(value);});});}
(async()=>{
 try{
 const password=randomUUID();const hash=await bcrypt.hash(password,10),prefix="feature-http-"+randomUUID();
 for(const role of ["ADMIN","PROMOTER","BASIC"])users.push(await db.user.create({data:{email:prefix+"-"+users.length+"@example.invalid",password:hash,name:"Smoke Test",role,emailVerified:true}}));
 const [admin,promoter,basic]=users;
 const date=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
 const common={nome:'Evento de teste <script>alert("x")</script>',descricao:"Descrição de teste, com uma linha.\nInformações de acesso.",banner:"/favicon.ico",carrossel:[],dataInicio:date,dataFim:date,startTime:"10:00",endTime:"11:00",linkParaCompra:"https://example.com",endereco:"Local de teste",userId:promoter.id,isFree:false,priceCents:0,category:"Cultura",lat:-23.55,lng:-46.63};
 const published=await db.events.create({data:{...common,status:"PUBLISHED",validate:true,validatedBy:admin.id,validatedAt:new Date()}});eventIds.push(published.id);
 for(const status of ["DRAFT","PENDING"])eventIds.push((await db.events.create({data:{...common,status,validate:false}})).id);
 phase="sessions and permissions";
 const adminCookie=await signIn("credentials",{email:admin.email,password}),basicCookie=await signIn("credentials",{email:basic.email,password});
 assert.ok(adminCookie&&basicCookie);
 assert.equal((await fetch(base+"/api/admin/events",{headers:{Cookie:basicCookie}})).status,403);
 const adminEvents=await(await fetch(base+"/api/admin/events",{headers:{Cookie:adminCookie}})).json();
 assert.ok(adminEvents.some(item=>item.id===eventIds[2]));assert.ok(!adminEvents.some(item=>item.id===eventIds[1]));
 if(process.env.FEATURE_EXPECT_PRODUCTION==="true")assert.equal(await signIn("dev-admin"),undefined);
 phase="public projection and pages";
 const publicEvents=await(await fetch(base+"/api/AllEvents")).json();
 assert.ok(publicEvents.some(item=>item.id===published.id));assert.ok(!publicEvents.some(item=>item.id===eventIds[1]||item.id===eventIds[2]));
 const publicEvent=publicEvents.find(item=>item.id===published.id);
 for(const person of [publicEvent.user,publicEvent.validator])for(const key of ["password","email","role","accounts","sessions"])assert.equal(Object.hasOwn(person,key),false);
 const html=await(await fetch(base+"/eventos/"+published.id)).text();
 const jsonld=html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
 if(jsonld){assert.equal(JSON.parse(jsonld[1]).name,published.nome);assert.ok(!jsonld[1].includes("<script>"));assert.equal(JSON.parse(jsonld[1]).offers,undefined);}else{assert.notEqual(process.env.FEATURE_EXPECT_PRODUCTION,"true");assert.ok(html.includes("Iniciando sessão de desenvolvimento"));}
 phase="private page isolation";const privatePage=await fetch(base+"/eventos/"+eventIds[1]);if(privatePage.status!==404){assert.notEqual(process.env.FEATURE_EXPECT_PRODUCTION,"true");assert.equal(privatePage.status,200);assert.ok((await privatePage.text()).includes("Iniciando sessão de desenvolvimento"));}
 phase="promoter page";assert.equal((await fetch(base+"/promotores/"+promoter.id)).status,200);
 phase="authenticated pages";for(const route of ["/salvos","/notificacoes"])assert.equal((await fetch(base+route,{headers:{Cookie:basicCookie}})).status,200);
 assert.equal((await fetch(base+"/resultados",{headers:{Cookie:adminCookie}})).status,200);
 const deniedEdit=await fetch(base+"/eventos/"+published.id+"/editar",{headers:{Cookie:basicCookie},redirect:"manual"});assert.equal(deniedEdit.status,307);
 phase="calendar and analytics";
 const calendar=await(await fetch(base+"/api/event-calendar/"+published.id)).text();assert.ok(calendar.includes("BEGIN:VCALENDAR"));assert.ok(calendar.includes("DTSTART:"+date.replaceAll("-","")+"T130000Z"));assert.ok(calendar.includes("\\nInformações"));
 const first=await fetch(base+"/api/event-engagement/"+published.id,{method:"POST",headers:{"Content-Type":"application/json",Origin:base},body:JSON.stringify({action:"view"})});
 assert.equal(first.status,200);const metricCookie=first.headers.getSetCookie()[0].split(";")[0];
 await fetch(base+"/api/event-engagement/"+published.id,{method:"POST",headers:{"Content-Type":"application/json",Origin:base,Cookie:metricCookie},body:JSON.stringify({action:"view"})});
 await fetch(base+"/api/event-engagement/"+published.id,{method:"POST",headers:{"Content-Type":"application/json",Origin:base,Cookie:metricCookie},body:JSON.stringify({action:"ticket"})});
 const counts=await db.events.findUnique({where:{id:published.id}});assert.equal(counts.views,1);assert.equal(counts.ticketClicks,1);
 assert.equal((await fetch(base+"/api/event-engagement/"+published.id,{method:"POST",headers:{"Content-Type":"application/json",Origin:"https://untrusted.example"},body:JSON.stringify({action:"view"})})).status,403);
 phase="sockets and targeted notices";
 const adminSocket=await connect(adminCookie),basicSocket=await connect(basicCookie),promoterSocket=await connect(await signIn("credentials",{email:promoter.email,password}));
 const update=signal(basicSocket,"update-events");adminSocket.emit("events-changed");await update;
 const targeted=signal(promoterSocket,"event-validated");adminSocket.emit("events-changed",{validatedEventIds:[published.id]});assert.equal((await targeted).eventId,published.id);
 const notice=signal(basicSocket,"notification-updated");await db.notification.create({data:{userId:basic.id,title:"Aviso de teste",message:"Teste de entrega direcionada",href:"/eventos/"+published.id}});await notice;
 assert.equal((await fetch(base+"/api/push/subscriptions")).status,401);
 console.log("PASS: HTTP routes, public privacy, draft isolation, public page rendering, ICS, deduplicated metrics, access control and targeted Socket.IO");
 if(process.env.FEATURE_EXPECT_PRODUCTION==="true")console.log("PASS: automatic development login blocked in production");
 }catch(error){console.error("FAIL HTTP integration at "+phase+": "+(error.code||error.name||"error"));throw error;}
 finally{
 for(const socket of sockets)socket.disconnect();
 await db.eventHistory.deleteMany({where:{eventId:{in:eventIds}}});await db.events.deleteMany({where:{id:{in:eventIds}}});await db.user.deleteMany({where:{id:{in:users.map(user=>user.id)}}});await db.$disconnect();
 }
})().catch(()=>{process.exitCode=1;});
