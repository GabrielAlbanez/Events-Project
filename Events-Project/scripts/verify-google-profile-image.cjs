const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const moduleResult = {exports:{}};
const output = ts.transpileModule(fs.readFileSync('lib/auth/googleProfileImage.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
new Function('exports','module',output)(moduleResult.exports,moduleResult);
const {googleProfileImage,refreshedGoogleImage} = moduleResult.exports;
const photo = 'https://lh3.googleusercontent.com/test-photo=s96-c';
assert.equal(googleProfileImage(photo),photo);
for (const invalid of [null,undefined,'/uploads/photo.png','http://lh3.googleusercontent.com/photo','https://lh3.googleusercontent.com.attacker.invalid/photo','https://user:pass@lh3.googleusercontent.com/photo','https://lh3.googleusercontent.com:444/photo']) assert.equal(googleProfileImage(invalid),null);
assert.equal(refreshedGoogleImage(null,photo),photo);
assert.equal(refreshedGoogleImage('https://lh3.googleusercontent.com/old',photo),photo);
assert.equal(refreshedGoogleImage('/uploads/custom.jpg',photo),null);
assert.equal(refreshedGoogleImage('https://example.invalid/custom.jpg',photo),null);
assert.equal(refreshedGoogleImage(photo,photo),null);
assert.equal(refreshedGoogleImage(photo,null),null);
async function verifySignIn() {
  let current = {id:'google-user',image:null,accounts:[{provider:'google'}]};
  const writes = [];
  const database = {user:{findUnique:async()=>current,updateMany:async args=>{writes.push(args);return {count:1};}}};
  const {authOptions} = require('./load-moderation-service.cjs')('lib/auth/options.ts',{
    '@/lib/prisma':{__esModule:true,default:database},
    '@next-auth/prisma-adapter':{PrismaAdapter:()=>({})},
    '@/lib/auth/accountAccess':{isAccountSuspended:()=>false,accountSessionValid:()=>true},
    '@/lib/auth/sessionCredential':require('./load-session-credential.cjs'),
    '@/lib/auth/impersonation':{},
    '@/lib/auth/googleProfileImage':moduleResult.exports,
  });
  const signIn = args=>authOptions.callbacks.signIn({user:{id:'google-user',email:'avatar-test@example.invalid',image:photo},account:{provider:'google',providerAccountId:'google-sub',type:'oauth'},profile:{picture:photo},...args});
  assert.equal(await signIn(),true);
  assert.deepEqual(writes[0],{where:{id:'google-user',image:null},data:{image:photo}});
  current = {...current,image:'/uploads/custom.jpg'};
  assert.equal(await signIn(),true);
  assert.equal(writes.length,1,'Custom uploads are never overwritten');
  assert.equal(await signIn({account:{provider:'credentials'}}),true);
  assert.equal(writes.length,1,'Credential sign-in does not refresh Google photos');
  console.log('Google profile image: real sign-in callback, photo refresh, allowed hosts and custom upload preservation passed.');
}
verifySignIn().catch(error=>{console.error(error);process.exitCode=1});
