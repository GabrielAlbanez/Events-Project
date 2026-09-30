import { NextResponse } from "next/server";
import { getPublicEvent } from "@/lib/eventQueries";
import { eventInstant } from "@/lib/eventTime";
function escape(value:string){return value.replace(/\\/g,"\\\\").replace(/\r?\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;");}
function utc(value:Date){return value.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");}
function fold(line:string){const lines:string[]=[];let part="",size=0;for(const char of line){const length=Buffer.byteLength(char);if(size+length>74){lines.push(part);part=" "+char;size=1+length;}else{part+=char;size+=length;}}lines.push(part);return lines.join("\r\n");}
export async function GET(_request:Request,{params}:{params:{id:string}}){
 try{
 const event=await getPublicEvent(params.id);
 if(!event)return new NextResponse("Evento indisponível",{status:404});
 const start=eventInstant(event.dataInicio,event.startTime,event.timezone),end=eventInstant(event.dataFim,event.endTime,event.timezone,"23:59");
 if(!start||!end)return new NextResponse("Data indisponível",{status:400});
 const base=process.env.NEXT_PUBLIC_BASE_URL??process.env.NEXTAUTH_URL??"http://localhost:3000";
 const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//EventMap//Agenda//PT-BR","CALSCALE:GREGORIAN","METHOD:PUBLISH","BEGIN:VEVENT","UID:"+escape(event.id)+"@eventmap","DTSTAMP:"+utc(new Date()),"DTSTART:"+utc(start),"DTEND:"+utc(end),"SUMMARY:"+escape(event.nome),"DESCRIPTION:"+escape(event.descricao),"LOCATION:"+escape(event.endereco),"URL:"+base+"/eventos/"+encodeURIComponent(event.id),"STATUS:"+(event.status==="CANCELLED"?"CANCELLED":"CONFIRMED"),"END:VEVENT","END:VCALENDAR"];
 return new NextResponse(lines.map(fold).join("\r\n")+"\r\n",{headers:{"Content-Type":"text/calendar; charset=utf-8","Content-Disposition":'attachment; filename="evento.ics"',"Cache-Control":"no-store"}});
 }catch{return new NextResponse("Calendário indisponível",{status:503});}
}
