const assert = require('node:assert/strict');
const {NextRequest} = require('next/server');
const load = require('./load-moderation-service.cjs');
const publicUrl = require('./load-public-url.cjs');
const saved = process.env.NEXTAUTH_URL;
class UploadError extends Error {constructor(status,message){super(message);this.status=status;}}
class AttendanceError extends Error {}
async function main() {
  process.env.NEXTAUTH_URL='https://tunnel-test.trycloudflare.com';
  let authenticatedReads=0;
  const deps={
    '@/lib/publicUrl':publicUrl,
    '@/lib/prisma':{__esModule:true,default:{}},
    '@/lib/adminAuth':{getAuthenticatedUser:async()=>{authenticatedReads++;return null;},getAuthenticatedAdminId:async()=>{authenticatedReads++;return null;}},
    '@/lib/storage/profileImages':{UploadError},
    '@/lib/services/attendance':{AttendanceError},
    '@/lib/services/eventReports':{},
    '@/lib/services/checkIn':{},
  };
  const cases=[['app/api/upload/route.ts','POST',401],['app/api/events/[id]/check-in/route.ts','POST',401],['app/api/events/[id]/reports/route.ts','POST',401],['app/api/admin/reports/[id]/route.ts','PATCH',403],['app/api/push/subscriptions/route.ts','POST',403],['app/api/push/subscriptions/route.ts','DELETE',403],['app/api/event-engagement/[id]/route.ts','POST',400]];
  for(const [file,method,expected] of cases){
    const route=load(file,deps);
    for(const [origin,status] of [['https://tunnel-test.trycloudflare.com',expected],['https://another.trycloudflare.com',403]]){
      const response=await route[method](new NextRequest('http://localhost:3001/api/test',{method,headers:{origin,'content-type':'application/json'},body:'{}'}),{params:{id:'test'}});
      assert.equal(response.status,status,file+' '+origin);
    }
  }
  assert.ok(authenticatedReads>0);
  console.log('PASS: upload, check-in, event/admin reports, push subscriptions and engagement accept configured tunnel origin and reject foreign origins before writes');
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{if(saved===undefined)delete process.env.NEXTAUTH_URL;else process.env.NEXTAUTH_URL=saved;});
