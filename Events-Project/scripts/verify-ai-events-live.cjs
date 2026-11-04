const assert=require("node:assert/strict"),{Client}=require("pg"),{io}=require("socket.io-client");
if(process.env.AI_EVENTS_TEST_DATABASE!=="true")throw Error("Explicit AI_EVENTS_TEST_DATABASE=true required");
const url=process.env.AI_EVENTS_TEST_URL||"http://localhost:3100";
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url))throw Error("Local preview only");
const pg=new Client({connectionString:process.env.DATABASE_LISTEN_URL||process.env.DATABASE_URL,connectionTimeoutMillis:10000});
const socket=io(url,{transports:["websocket"],extraHeaders:{Origin:url},reconnection:false,timeout:10000});
const wait=event=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{socket.off(event,done);reject(Error("TIMEOUT_"+event));},12000);function done(){clearTimeout(timer);resolve();}socket.once(event,done);});
(async()=>{if(!socket.connected)await wait("connect");await pg.connect();const changed=wait("update-events");await pg.query("SELECT pg_notify('eventmap_events_updated','published')");await changed;assert.equal(socket.connected,true);console.log("PASS live PostgreSQL NOTIFY -> running server -> anonymous WebSocket update-events; no event data changed.");})().catch(error=>{console.error("Live realtime validation:",error.code||error.message);process.exitCode=1;}).finally(async()=>{socket.disconnect();await pg.end().catch(()=>{});});
