/* No fetch handler: authenticated routes and APIs are never cached here. */
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
function safeHref(value) {
 if(typeof value!=="string" || !/^\/(?![\/\\])/.test(value) || /[\\\u0000-\u0020]/.test(value))return "/notificacoes";
 try { const decoded=decodeURIComponent(value);if(decoded.startsWith("//")||/[\\\u0000-\u001f]/.test(decoded))return "/notificacoes";const url=new URL(value,self.location.origin);return url.origin===self.location.origin?url.href:"/notificacoes";}catch{return "/notificacoes";}
}
self.addEventListener("push", function(event){
 let data;try{data=event.data.json();}catch{return;}
 if(!data||typeof data.userId!=="string"||typeof data.id!=="string")return;
 event.waitUntil(fetch("/api/auth/session",{credentials:"same-origin",cache:"no-store"}).then(response=>response.ok?response.json():null).then(session=>{
 if(!session?.user||session.user.id!==data.userId)return;
 const href=safeHref(data.href);
 return self.registration.showNotification(typeof data.title==="string"?data.title.slice(0,80):"EventMap",{body:typeof data.message==="string"?data.message.slice(0,160):"",icon:"/branding/eventmap-community-logo.png",badge:"/branding/eventmap-community-logo.png",tag:"eventmap:"+data.userId+":"+(data.type||"SYSTEM")+":"+href,renotify:false,silent:true,requireInteraction:data.priority==="high",actions:[{action:"open",title:"Abrir"},{action:"dismiss",title:"Dispensar"}],data:{href,userId:data.userId}});
 }).catch(()=>{}));
});
self.addEventListener("notificationclick",function(event){
 event.notification.close();if(event.action==="dismiss")return;
 const data=event.notification.data||{};
 event.waitUntil(fetch("/api/auth/session",{credentials:"same-origin",cache:"no-store"}).then(response=>response.json()).then(async session=>{
 if(session?.user?.id!==data.userId)return;
 const target=new URL(safeHref(data.href),self.location.origin).href;
 const clients=await self.clients.matchAll({type:"window",includeUncontrolled:true});
 for(const client of clients)if(new URL(client.url).origin===self.location.origin){await client.navigate(target);await client.focus();return;}
 return self.clients.openWindow(target);
 }).catch(()=>{}));
});
