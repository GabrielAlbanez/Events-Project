const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const load = require('./load-notification-module.cjs');
const catalog = load('catalog');
const creator = load('create');
const id = '00000000-0000-4000-8000-000000000001';
(async () => {
  assert.equal(Object.keys(catalog.notificationCatalog).length, 7);
  assert.equal(catalog.getNotificationType(null), 'SYSTEM');
  assert.equal(catalog.getNotificationType('__proto__'), 'SYSTEM');
  const input = { userId: 'owner', title: 'Tudo pronto', message: 'Confira seus avisos.', href: '/notificacoes', type: 'SYSTEM' };
  for (const href of ['https://example.com','//example.com','/\\example.com','/%2fexample.com','/%5cexample.com','/ok\n','/%00x','/%zz']) assert.throws(() => creator.validateNotification({...input,href}));
  assert.throws(() => creator.validateNotification({...input,title:'x'.repeat(81)}));
  assert.throws(() => creator.validateNotification({...input,message:'x'.repeat(161)}));
  assert.throws(() => creator.validateNotification({...input,type:'INVALID'}));
  const files = ['lib/eventNotifications.ts','lib/community/events.ts','lib/community/notifications.ts','lib/community/rooms.ts','lib/services/attendance.ts','lib/services/eventReports.ts','lib/partyConnections/actions.ts','server/notificationWorker.mts'];
  let creatorSites=0;
  for(const file of files){const source=fs.readFileSync(file,'utf8');creatorSites+=(source.match(/await createNotifications?\(/g)||[]).length;
    for(const title of ['Evento '+ 'x'.repeat(200),''])for(const message of ['x'.repeat(240),'']){
      const prepared=catalog.notificationCopy({...input,title,message});
      assert.doesNotThrow(()=>creator.validateNotification(prepared),file+' copy must not reject long/empty content');
      assert.ok(prepared.title.length<=80&&prepared.message.length<=160);
    }
  }
  assert.equal(creatorSites,10,'all ten creation sites must use shared normalization');
  const calls = [];
  const db = { notification: { create: async data => calls.push(data), createMany: async data => calls.push(data) } };
  await creator.createNotification(db,input);
  assert.equal(calls[0].data.priority,'normal');
  assert.equal(creator.validateNotification({...input,type:'ADMIN'}).priority,'high');
  await assert.rejects(creator.createNotifications(db,[input,{...input,href:'//evil'}]));
  assert.equal(calls.length,1,'invalid batch must write nothing');
  let query;
  const store = { notification: {
    findMany: async q => { query=q; return [{id,title:'Legada',message:'Mensagem antiga',href:'/notificacoes',createdAt:new Date(),readAt:null}]; },
    count: async q => {query=q;return 125;},
    groupBy: async q => {query=q;return [{type:'EVENT_CHANGE',_count:{_all:4}},{type:null,_count:{_all:2}}];},
    updateMany: async q => {query=q;return {count:1};},
  }};
  const module = {exports:{}};
  const source=ts.transpileModule(fs.readFileSync('lib/services/notifications.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
  new Function('require','module','exports',source)(name=>name==='@/lib/prisma'?{__esModule:true,default:store}:name.includes('notifications/')?load(name):require(name),module,module.exports);
  const service=module.exports, owner=async()=>({id:'owner',role:'BASIC'});
  assert.equal(await service.getUnreadCount(async()=>null),0);assert.equal(query,undefined);
  assert.equal(await service.getUnreadCount(owner),125);assert.deepEqual(query.where,{userId:'owner',readAt:null});
  const rows=await service.getNotifications(owner);assert.equal(rows[0].type,'SYSTEM');assert.equal(rows[0].priority,'normal');
  const page=await service.getNotificationPage(owner,{category:'Conexões',limit:10});assert.equal(query.take,11);assert.deepEqual(query.where.type.in,['CONNECTION']);assert.equal(page.items.length,1);
  await service.getNotificationPage(owner,{category:'Sistema'});assert.ok(query.where.type.notIn.includes('CONNECTION'));assert.ok(!query.where.type.notIn.includes('SYSTEM'));
  assert.deepEqual(await service.getNotificationCounts(owner),{total:6,Eventos:4,Comunidade:0,Conexões:0,Sistema:2});
  await service.getRecentNotifications(owner,{since:new Date().toISOString()});assert.equal(query.take,20);assert.equal(query.where.userId,'owner');
  assert.deepEqual(await service.markNotificationRead(id,async()=>null),{success:false});
  const marked=await service.markNotificationRead(id,owner);assert.equal(query.where.userId,'owner');assert.equal(query.where.id,id);
  assert.equal((await service.undoNotificationRead(id,marked.readAt,owner)).success,true);assert.equal(query.where.readAt.toISOString(),marked.readAt);
  assert.equal((await service.undoNotificationRead(id,new Date(Date.now()-16000).toISOString(),owner)).success,false);
  const actions=fs.readFileSync('app/(actions)/engagement/action.ts','utf8');assert.equal((actions.match(/allowImpersonation: false/g)||[]).length,2);
  const auth=fs.readFileSync('lib/adminAuth.ts','utf8');assert.ok(auth.includes('options.allowImpersonation === false && token.impersonationId'));
  console.log('PASS notifications: catalog, strict writes, safe destinations, atomic batch validation, legacy rows, count >50, categories, bounded recent reads, owner isolation and conditional undo.');
})().catch(error=>{console.error(error);process.exitCode=1;});
