const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const ts=require('typescript');
async function main(){
 const source=await fs.readFile(path.join(__dirname,'../server/sharedPresence.mts'),'utf8');const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;const mod={exports:{}};new Function('require','module','exports',compiled)(require,mod,mod.exports);
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'eventmap-presence-test-'));let clock=1000;let first=['admin'];let second=['google-user','google-user'];const changes=[];const create=mod.exports.createSharedPresence;
 const a=create({directory,now:()=>clock,intervalMs:600000,getLocalUserIds:()=>first,onChange:ids=>changes.push(ids)});const b=create({directory,now:()=>clock,intervalMs:600000,getLocalUserIds:()=>second,onChange:()=>{}});
 try{
 await Promise.all([a.poll(),b.poll()]);await a.poll();assert.deepEqual(a.getSnapshot(),['admin','google-user']);console.log('PASS two independent servers and deduplicated presence');
 second=[];await b.poll();await a.poll();assert.deepEqual(a.getSnapshot(),['admin']);console.log('PASS logout propagates');
 second=['google-user'];await b.poll();await a.poll();assert.deepEqual(a.getSnapshot(),['admin','google-user']);
 clock=12000;await a.poll();assert.deepEqual(a.getSnapshot(),['admin']);console.log('PASS crashed-server presence expires');
 await fs.writeFile(path.join(directory,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.json'),JSON.stringify({updatedAt:clock,userIds:[123]}));await a.poll();assert.deepEqual(a.getSnapshot(),['admin']);console.log('PASS malformed snapshot ignored');
 first=['admin','admin'];await a.poll();const copy=a.getSnapshot();copy.push('spoof');assert.deepEqual(a.getSnapshot(),['admin']);console.log('PASS multi-tab deduplication and snapshot isolation');
 await b.stop();await a.poll();assert.deepEqual(a.getSnapshot(),['admin']);assert.ok(changes.length>=3);
 }finally{await a.stop();await b.stop();await fs.rm(directory,{recursive:true,force:true});}
 console.log('PASS shutdown cleanup');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
