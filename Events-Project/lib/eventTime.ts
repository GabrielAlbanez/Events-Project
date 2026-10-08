// Convert a local event date/time to UTC without assuming the server timezone.
export function eventInstant(date: string, time: string | null | undefined, timezone = "America/Sao_Paulo", fallback = "09:00"): Date | null {
 if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
 const clock = time || fallback;
 if (!/^\d{2}:\d{2}$/.test(clock)) return null;
 const [year,month,day] = date.split("-").map(Number);
 const [hour,minute] = clock.split(":").map(Number);
 let result = Date.UTC(year,month-1,day,hour,minute);
 try {
 const formatter = new Intl.DateTimeFormat("en-CA", {timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
 for(let iteration=0;iteration<3;iteration++){
  const parts=Object.fromEntries(formatter.formatToParts(new Date(result)).filter(part=>part.type!=="literal").map(part=>[part.type,part.value]));
  const represented=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute),Number(parts.second));
  result += Date.UTC(year,month-1,day,hour,minute)-represented;
 }
 return Number.isNaN(result)?null:new Date(result);
 }catch{return null;}
}
