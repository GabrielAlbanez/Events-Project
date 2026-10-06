const assert = require('node:assert/strict');
const load = require('./load-moderation-service.cjs');
const moderation = load('lib/services/userSuspension.ts');
const service = load('lib/services/impersonationAudit.ts',{'./userSuspension':moderation});
(async () => {
 let query;
 const db={user:{findUnique:async()=>({role:'ADMIN'})},impersonationSession:{fields:{expiresAt:'expiresAt'},findMany:async input=>{query=input;return [{id:'audit',adminId:'admin',userId:'target',reason:'Suporte solicitado',ip:'127.0.0.1',startedAt:new Date(),expiresAt:new Date(Date.now()+10000),endedAt:null,admin:{name:'Admin'},user:{name:'Alvo'}}]},count:async()=>30}};
 const result=await service.getImpersonationAudit(db,'admin',new URLSearchParams('page=2&status=active&q=Alvo'));
 assert.equal(query.take,25);assert.equal(query.skip,25); assert.equal(result.data[0].status,'active'); assert.equal(result.pagination.totalPages,2);
 assert.equal(result.data[0].reason,'Suporte solicitado');assert.equal(result.data[0].admin,undefined);
 await assert.rejects(service.getImpersonationAudit(db,'admin',new URLSearchParams('from=2026-11-01&to=2026-01-01')),/Intervalo/);
 await assert.rejects(service.getImpersonationAudit(db,'admin',new URLSearchParams('status=invalid')),/Status/);
 db.user.findUnique=async()=>({role:'BASIC'});
 await assert.rejects(service.getImpersonationAudit(db,'other',new URLSearchParams()),/negado/);
 console.log('PASS: audit authorization, bounded pagination, minimal projections, justification and filters.');
})().catch(e=>{console.error(e);process.exitCode=1});
