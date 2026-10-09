import { NextResponse } from "next/server";
import { getPublicEvent } from "@/lib/eventQueries";
import { eventInstant } from "@/lib/eventTime";
import { createEventCalendar } from "@/lib/eventCalendar";
import { publicSiteUrl } from "@/lib/publicUrl";
export async function GET(_request:Request,{params}:{params:{id:string}}){
 try{
 const event=await getPublicEvent(params.id);
 if(!event)return new NextResponse("Evento indisponível",{status:404});
 const start=eventInstant(event.dataInicio,event.startTime,event.timezone),end=eventInstant(event.dataFim,event.endTime,event.timezone,"23:59");
 if(!start||!end)return new NextResponse("Data indisponível",{status:400});
 const base=publicSiteUrl().origin;
 const calendar=createEventCalendar([event],base);
 return new NextResponse(calendar,{headers:{"Content-Type":"text/calendar; charset=utf-8","Content-Disposition":'attachment; filename="evento.ics"',"Cache-Control":"no-store"}});
 }catch{return new NextResponse("Calendário indisponível",{status:503});}
}
