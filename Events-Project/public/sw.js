self.addEventListener("push", function (event) {
 let data; try { data=event.data.json(); } catch { return; }
 event.waitUntil(fetch("/api/auth/session", {credentials:"same-origin",cache:"no-store"}).then(function(response){return response.json();}).then(function(session){
 if(!session.user || session.user.id!==data.userId)return;
 return self.registration.showNotification(data.title || "EventMap", {body:data.message || "",tag:data.id || "eventmap",data:{href:typeof data.href==="string"&&data.href.startsWith("/")&&!data.href.startsWith("//")?data.href:"/notificacoes"}});
 }).catch(function(){}));
});
self.addEventListener("notificationclick", function (event) {
 event.notification.close();
 const target=new URL(event.notification.data.href,self.location.origin).href;
 event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(async function(clients){
 for(const client of clients){if(new URL(client.url).origin===self.location.origin){await client.focus();await client.navigate(target);return;}}
 return self.clients.openWindow(target);
 }));
});
