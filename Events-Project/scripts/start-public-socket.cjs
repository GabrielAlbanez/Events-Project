const {spawn} = require('node:child_process');

function publicSocketEnvironment(value, portValue = '3000') {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('Use somente a origem HTTPS do link público.');
  const port = Number(portValue);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Informe uma porta válida.');
  return {
    NODE_ENV:'development', HOSTNAME:'localhost', PORT:String(port),
    NEXTAUTH_URL:url.origin, NEXT_PUBLIC_BASE_URL:url.origin,
    SOCKET_IO_ALLOWED_ORIGINS:[url.origin,`http://localhost:${port}`].join(','),
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length % 2 || args.some((value,index)=>index%2===0&&!['--url','--port'].includes(value))) throw Error('Use npm run dev:socket:public -- --url https://seu-link.trycloudflare.com [--port 3000]');
  const options = new Map();
  for(let index=0;index<args.length;index+=2) options.set(args[index],args[index+1]);
  if(!options.get('--url')) throw Error('Informe --url com o link público atual do túnel.');
  const environment = publicSocketEnvironment(options.get('--url'),options.get('--port'));
  const compilation = spawn(process.execPath,[require.resolve('typescript/bin/tsc'),'--project','tsconfig.server.json'],{stdio:'inherit'});
  const code = await new Promise((resolve,reject)=>{compilation.on('error',reject);compilation.on('exit',resolve);});
  if(code!==0) {process.exitCode=code||1;return;}
  const server = spawn(process.execPath,['dist/server.mjs'],{stdio:'inherit',env:{...process.env,...environment}});
  const stop = ()=>server.kill();
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  server.once('error',()=>{console.error('Não foi possível iniciar o servidor público.');process.exitCode=1;});
  server.once('exit',code=>{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);process.exitCode=code||0;});
}

module.exports = {publicSocketEnvironment};
if(require.main===module)main().catch(error=>{console.error(error instanceof TypeError?'URL pública inválida.':error.message);process.exitCode=1;});
