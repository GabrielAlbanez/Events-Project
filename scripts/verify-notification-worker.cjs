const fs=require('node:fs');
const assert=require('node:assert/strict');
const ts=require('typescript');
const FixedDate=class extends Date{constructor(...args){super(...(args.length?args:['2026-09-30T12:00:00Z']));}static now(){return new FixedDate().getTime();}};
const source=ts.transpileModule(fs.readFileSync('server/notificationWorker.mts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
const eventTimeModule={exports:{}};
const eventTimeSource=ts.transpileModule(fs.readFileSync('lib/eventTime.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
new Function('exports',eventTimeSource)(eventTimeModule.exports);
const {eventInstant}=eventTimeModule.exports;
let intervals=[],errors=[],notices=0,ended=0,reminderPages=0,endPages=0,changed=0;
const favorites=Array.from({length:501},(_,i)=>({userId:String(i).padStart(4,'0'),eventId:'event',reminderMinutes:60,reminderSentAt:null,event:{id:'event',nome:'Teste',dataInicio:'2026-09-30',startTime:i===500?'09:30':'20:00',timezone:'America/Sao_Paulo'}}));
const events=Array.from({length:501},(_,i)=>({id:String(i).padStart(4,'0'),nome:'Teste',userId:'owner',dataFim:'2026-09-30',endTime:i===500?'08:00':'23:00',timezone:'America/Sao_Paulo',status:'PUBLISHED'}));
const prisma={favorite:{async findMany(q){reminderPages++;const cursor=q.where.OR?.[0].userId.gt;return favorites.filter(f=>!f.reminderSentAt&&(!cursor||f.userId>cursor)).slice(0,q.take);},async updateMany(q){const f=favorites.find(f=>f.userId===q.where.userId&&!f.reminderSentAt);if(!f)return{count:0};f.reminderSentAt=q.data.reminderSentAt;return{count:1};}},events:{async findMany(q){endPages++;return events.filter(e=>e.status==='PUBLISHED'&&(!q.where.id||e.id>q.where.id.gt)).slice(0,q.take);},async updateMany(q){const e=events.find(e=>e.id===q.where.id&&e.status==='PUBLISHED');if(!e)return{count:0};e.status='ENDED';ended++;return{count:1};}},notification:{async create(){notices++;}},eventHistory:{async create(){}},async $transaction(fn){return fn(prisma);}};
const moduleObject={exports:{}};
new Function('require','module','exports','process','setInterval','clearInterval','console','Date',source)(name=>name==='web-push'?require('web-push'):name==='../lib/eventTime.js'?{eventInstant}:require(name),moduleObject,moduleObject.exports,{env:{WEB_PUSH_PUBLIC_KEY:'invalid',WEB_PUSH_PRIVATE_KEY:'invalid',WEB_PUSH_SUBJECT:'invalid'}},fn=>{intervals.push(fn);return intervals.length;},()=>{},{error:message=>errors.push(message)},FixedDate);
const stop=moduleObject.exports.startNotificationWorker(prisma,()=>{},()=>changed++);
async function settle(){for(let i=0;i<30;i++)await new Promise(resolve=>setImmediate(resolve));}
(async()=>{await settle();assert.equal(notices,1);assert.equal(ended,1);assert.equal(changed,1);assert.ok(reminderPages>=2&&endPages>=2);assert.deepEqual(errors,['External push disabled: invalid configuration.']);intervals[1]();await settle();assert.equal(notices,1);assert.equal(ended,1);stop();console.log('PASS: invalid push configuration is isolated; reminders and lifecycle traverse >500 candidates without duplicate notifications.');})().catch(error=>{stop();console.error(error);process.exitCode=1;});
