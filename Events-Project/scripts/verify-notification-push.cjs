const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {notificationPushPayload}=require('./load-notification-module.cjs')('push');
async function harness(fetch){const handlers={},shown=[],opened=[];const self={location:{origin:'https://eventmap.example'},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:async()=>{},registration:{showNotification:async(title,options)=>shown.push({title,...options})},clients:{claim:async()=>{},matchAll:async()=>[],openWindow:async url=>{opened.push(url);return {};}}};vm.runInNewContext(fs.readFileSync('public/sw.js','utf8'),{self,fetch,URL});return{self,shown,opened,async push(data){let done;handlers.push({data:{json:()=>data},waitUntil:p=>done=p});await done;},async click(href){let done;handlers.notificationclick({notification:{data:{href},close(){}},waitUntil:p=>done=p});await done;}};}
(async()=>{
 const base={id:'notice',userId:'owner',title:'T'.repeat(100),message:'M'.repeat(200),href:'/eventos/test'};
 for(const type of ['EVENT_REMINDER','EVENT_CHANGE','COMMUNITY','CONNECTION','CHECKIN','ADMIN','SYSTEM']){const p=notificationPushPayload({...base,type});assert.ok(p.title.length<=80&&p.message.length<=160);assert.equal(p.title.startsWith('T'),['EVENT_REMINDER','EVENT_CHANGE'].includes(type));assert.ok(Buffer.byteLength(JSON.stringify(p))<4096);}
 for(const fetch of [async()=>{throw Error('offline')},async()=>({ok:false}),async()=>({ok:true,json:async()=>({user:{id:'other'}})})]){const h=await harness(fetch);await h.push(base);assert.equal(h.shown.length,1);assert.equal(h.shown[0].title,'EventMap');assert.equal(h.shown[0].body,'Você tem uma atualização');await h.click('/eventos/test');assert.equal(h.opened[0],'https://eventmap.example/eventos/test');}
 const h=await harness(async()=>({ok:true,json:async()=>({user:{id:'owner'}})}));await h.push({...base,type:'EVENT_CHANGE'});await h.push({...base,id:'second',type:'EVENT_CHANGE'});assert.equal(h.shown[0].tag,h.shown[1].tag);assert.equal(h.shown[0].renotify,false);assert.equal(h.shown[0].silent,undefined);
 for (const [title, message, href] of [
   ['Convite para sala', 'Nome da sala privada fictícia', '/salas/fixture'],
   ['Tarefa de equipe', 'Título da tarefa privada fictícia', '/eventos/fixture/comunidade'],
 ]) {
   const notice = {...base, title, message, href, type:'COMMUNITY'};
   const payload = notificationPushPayload(notice);
   assert.equal(payload.title, 'EventMap');
   assert.equal(payload.message, 'Você tem uma atualização');
   for (const data of [payload, notice, {...notice, type:undefined}]) {
     await h.push(data);
     assert.equal(h.shown.at(-1).title, 'EventMap');
     assert.equal(h.shown.at(-1).body, 'Você tem uma atualização');
     await h.click(h.shown.at(-1).data.href);
     assert.equal(h.opened.at(-1), 'https://eventmap.example' + href);
   }
 }
 for(const href of ['//evil.example','/\\evil.example','/%2fevil.example','javascript:alert(1)']){await h.click(href);assert.equal(h.opened.at(-1),'https://eventmap.example/notificacoes');}
 let attempt=0;h.self.clients.openWindow=async url=>{if(++attempt===1)throw Error('blocked');h.opened.push(url);return {};};await h.click('/eventos/test');assert.equal(h.opened.at(-1),'https://eventmap.example/notificacoes');
 assert.ok(!fs.readFileSync('public/sw.js','utf8').includes('addEventListener("fetch"'));
 console.log('PASS push: seven type policies, bounds, generic fallback on offline/wrong session, navigation without session, safe destinations, fallback window and stable tags.');
})().catch(error=>{console.error(error);process.exitCode=1;});
