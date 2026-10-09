"use client";
import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import { useMotionValueEvent, useScroll, useSpring, useTransform } from "framer-motion";
type Plane = RefObject<HTMLDivElement>;
export type LoggedHomeScrollSceneProps = {
 container: Plane; hero: RefObject<HTMLElement>; heroPosters: MutableRefObject<(HTMLElement | null)[]>;
 ringSection: RefObject<HTMLElement>; ring: Plane; mapSection: RefObject<HTMLElement>; mapPlane: Plane;
 ticketStack: Plane; closing: RefObject<HTMLElement>; progressBar: Plane;
 eventKey: string; count: number; onActive: (index: number) => void;
};
const clamp = (value: number) => Math.min(1,Math.max(0,value));
export default function LoggedHomeScrollScene(props: LoggedHomeScrollSceneProps) {
 const {container,hero,heroPosters,ringSection,ring,mapSection,mapPlane,ticketStack,closing,progressBar,count,eventKey,onActive} = props;
 const timers = useRef(new Map<HTMLElement,ReturnType<typeof setTimeout>>());
 const activeIndex = useRef(-1);
 const {scrollYProgress:overall} = useScroll({container});
 const {scrollYProgress:heroRaw} = useScroll({container,target:hero,offset:["start start","end start"]});
 const {scrollYProgress:ringRaw} = useScroll({container,target:ringSection,offset:["start start","end end"]});
 const {scrollYProgress:mapRaw} = useScroll({container,target:mapSection,offset:["start start","end end"]});
 const {scrollYProgress:ticketRaw} = useScroll({container,target:ticketStack,offset:["start end","end start"]});
 const heroProgress=useSpring(heroRaw,{stiffness:100,damping:25,mass:.4});
 const ringProgress=useSpring(ringRaw,{stiffness:120,damping:30,mass:.4});
 const mapProgress=useSpring(mapRaw,{stiffness:100,damping:28,mass:.4});
 const ticketProgress=useSpring(ticketRaw,{stiffness:110,damping:28,mass:.4});
 const heroValue=useTransform(heroProgress,value=>clamp(value));
 const ringValue=useTransform(ringProgress,value=>clamp(value));
 const mapValue=useTransform(mapProgress,value=>clamp(value));
 const ticketValue=useTransform(ticketProgress,value=>clamp(value));
 function write(node: HTMLElement | null | undefined,transform: string) {
  if(!node)return;
  node.style.transform=transform;node.style.willChange="transform";
  const old=timers.current.get(node);if(old)clearTimeout(old);
  timers.current.set(node,setTimeout(()=>{node.style.removeProperty("will-change");timers.current.delete(node);},180));
 }
 function updateHero(value: number) {
  heroPosters.current.forEach((node,index)=>{
   const side=[-1,1,0][index] ?? 0;
   write(node,`translate3d(0,${-value * (index===2?130:70+index*24)}px,${index===2?70:20}px) rotateY(${side*12-value*side*8}deg) rotateZ(${side*5}deg)`);
  });
 }
 function updateRing(value:number) {
  const node=ring.current;if(!node||!count)return;
  const focused=node.dataset.focusedIndex;
  const focusIndex=focused===undefined?null:Number(focused);
  const index=focusIndex!==null&&Number.isInteger(focusIndex)&&focusIndex>=0&&focusIndex<count?focusIndex:Math.min(count-1,Math.round(value*(count-1)));
  const angle=focusIndex!==null?index*360/count:value*(count-1)*360/count;
  write(node,`translateZ(calc(var(--ring-radius) * -1)) rotateY(${-angle}deg)`);
  if(index!==activeIndex.current){activeIndex.current=index;onActive(index);}
 }
 function updateMap(value:number) {
  const reveal=mapPlane.current?.querySelector<SVGRectElement>("[data-map-route-reveal]");if(reveal)reveal.style.transform=`scaleX(${clamp(value*1.4)})`;
  write(mapPlane.current,`rotateX(${(1-value)*56}deg) rotateZ(${(1-value)*-10}deg) scale(${.85+value*.15})`);
  mapPlane.current?.querySelectorAll<HTMLElement>("[data-map-pin]").forEach(pin=>write(pin,`translateZ(${value*24}px) rotateX(${(1-value)*-56}deg)`));
 }
 function updateTickets(value:number) {
  ticketStack.current?.querySelectorAll<HTMLElement>("[data-ticket]").forEach((node,index)=>{
   const side=index-1;
   write(node,`translate3d(${side*(value-.5)*18}px,${(value-.5)*-10}px,${index*14}px) rotateX(${(.5-value)*8}deg) rotateZ(${side*(value-.5)*5}deg)`);
  });
 }
 useMotionValueEvent(heroValue,"change",updateHero);
 useMotionValueEvent(ringValue,"change",updateRing);
 useMotionValueEvent(mapValue,"change",updateMap);
 useMotionValueEvent(ticketValue,"change",updateTickets);
 useMotionValueEvent(overall,"change",value=>{if(progressBar.current)progressBar.current.style.transform=`scaleX(${clamp(value)})`;});
 useEffect(()=>{
  activeIndex.current=-1;updateHero(heroValue.get());updateRing(ringValue.get());updateMap(mapValue.get());updateTickets(ticketValue.get());
  if(progressBar.current)progressBar.current.style.transform=`scaleX(${clamp(overall.get())})`;
  const node=ring.current;
  const focus=()=>updateRing(ringValue.get());node?.addEventListener("home-ring-focus",focus);
  const resume=()=>{if(node && !node.contains(document.activeElement)){delete node.dataset.focusedIndex;updateRing(ringValue.get());}};
  const scrollNode=container.current;scrollNode?.addEventListener("scroll",resume,{passive:true});
  const moving=[...heroPosters.current,node,mapPlane.current,...Array.from(mapPlane.current?.querySelectorAll<SVGRectElement>("[data-map-route-reveal]")??[]),...Array.from(mapPlane.current?.querySelectorAll<HTMLElement>("[data-map-pin]")??[]),...Array.from(ticketStack.current?.querySelectorAll<HTMLElement>("[data-ticket]")??[]),progressBar.current];
  const pending=timers.current;
  return()=>{scrollNode?.removeEventListener("scroll",resume);node?.removeEventListener("home-ring-focus",focus);pending.forEach(timer=>clearTimeout(timer));pending.clear();moving.forEach(item=>{item?.style.removeProperty("transform");item?.style.removeProperty("will-change");});};
 // Ref containers are stable; eventKey refreshes newly loaded poster/card nodes.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[eventKey,count]);
 useEffect(()=>{
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{entry.target.toggleAttribute("data-scene-visible",entry.isIntersecting);}),{root:container.current,rootMargin:"40px"});
  const sections=[hero.current,closing.current];sections.forEach(section=>{if(section)observer.observe(section);});
  return()=>{observer.disconnect();sections.forEach(section=>section?.removeAttribute("data-scene-visible"));};
 },[container,hero,closing]);
 return null;
}
