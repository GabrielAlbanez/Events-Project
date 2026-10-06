const assert = require('node:assert/strict');
const {NextRequest} = require('next/server');
const url = require('./load-public-url.cjs');
const {publicSocketEnvironment} = require('./start-public-socket.cjs');
const saved = {NEXTAUTH_URL:process.env.NEXTAUTH_URL,NEXT_PUBLIC_BASE_URL:process.env.NEXT_PUBLIC_BASE_URL};
try {
  process.env.NEXTAUTH_URL='https://current-preview.trycloudflare.com';
  process.env.NEXT_PUBLIC_BASE_URL='http://localhost:3000';
  assert.equal(url.publicSiteUrl().origin,process.env.NEXTAUTH_URL);
  for(const [origin,allowed] of [['https://current-preview.trycloudflare.com',true],['http://localhost:3001',true],['https://other-preview.trycloudflare.com',false],['https://current-preview.trycloudflare.com.attacker.invalid',false],['null',false]]) {
    const request = new NextRequest('http://localhost:3001/api/upload',{headers:{origin,'x-forwarded-host':'other-preview.trycloudflare.com'}});
    assert.equal(url.isAllowedRequestOrigin(request),allowed);
  }
  const missing = new NextRequest('http://localhost:3001/api/upload');
  assert.equal(url.isAllowedRequestOrigin(missing),true);
  assert.equal(url.isAllowedRequestOrigin(missing,true),false);
  process.env.NEXTAUTH_URL='https://new-preview.trycloudflare.com';
  assert.equal(url.publicSiteUrl().origin,process.env.NEXTAUTH_URL,'Runtime URL changes do not use an old build-time public URL');
  const environment = publicSocketEnvironment(process.env.NEXTAUTH_URL,'3001');
  assert.equal(environment.NEXTAUTH_URL,environment.NEXT_PUBLIC_BASE_URL);
  assert.equal(environment.PORT,'3001');
  assert.equal(environment.SOCKET_IO_ALLOWED_ORIGINS,'https://new-preview.trycloudflare.com,http://localhost:3001');
  for(const invalid of ['http://preview.invalid','https://preview.invalid/path','https://user:pass@preview.invalid','https://preview.invalid?token=x']) assert.throws(()=>publicSocketEnvironment(invalid));
  for(const invalid of ['0','65536','bad'])assert.throws(()=>publicSocketEnvironment('https://preview.invalid',invalid));
  process.env.NEXTAUTH_URL='invalid';
  assert.equal(url.configuredPublicOrigin(),null);assert.throws(()=>url.publicSiteUrl());
  console.log('PASS: canonical runtime URL, strict tunnel origins, missing-origin semantics and public socket configuration');
} finally {
  for(const [name,value] of Object.entries(saved)){if(value===undefined)delete process.env[name];else process.env[name]=value;}
}
