const fs=require("node:fs");
const {spawnSync}=require("node:child_process");
const webpush=require("web-push");
const subject=process.argv[2];
if(!subject||!(/^(mailto:[^@\s]+@[^@\s]+|https:\/\/[^\s]+)$/.test(subject))){console.error("Informe um contato: npm run push:configure -- mailto:seu-email");process.exit(1);}
if(spawnSync("git",["ls-files","--error-unmatch",".env"],{stdio:"ignore"}).status===0){console.error("O .env está rastreado pelo Git. Pare e remova-o do versionamento antes de configurar.");process.exit(1);}
if(spawnSync("git",["check-ignore",".env"],{stdio:"ignore"}).status!==0){console.error("Adicione .env ao .gitignore antes de configurar.");process.exit(1);}
let env=fs.existsSync(".env")?fs.readFileSync(".env","utf8"):"";
function value(name){const line=env.split(/\r?\n/).find(line=>line.startsWith(name+"="));return line?line.slice(name.length+1).trim().replace(/^["']|["']$/g,""):"";}
if(value("WEB_PUSH_PUBLIC_KEY")||value("WEB_PUSH_PRIVATE_KEY")){console.error("As chaves já estão configuradas. Elas não foram substituídas.");process.exit(1);}
const keys=webpush.generateVAPIDKeys();
env=env.replace(/^WEB_PUSH_(?:PUBLIC_KEY|PRIVATE_KEY|SUBJECT)=.*(?:\r?\n|$)/gm,"");
env+="\nWEB_PUSH_PUBLIC_KEY="+keys.publicKey+"\nWEB_PUSH_PRIVATE_KEY="+keys.privateKey+"\nWEB_PUSH_SUBJECT="+subject+"\n";
fs.writeFileSync(".env",env);
console.log("Configuração salva no .env local. Reinicie o servidor. Nenhuma chave foi exibida.");
