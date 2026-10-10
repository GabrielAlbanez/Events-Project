"use client";
import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import { useMotionValueEvent, useScroll, useSpring, useTransform } from "framer-motion";
type Plane = RefObject<HTMLDivElement>;
export type LoggedHomeScrollSceneProps = {
 container: Plane; hero: RefObject<HTMLElement>; heroPosters: MutableRefObject<(HTMLElement | null)[]>;
 flightPosters: MutableRefObject<(HTMLElement | null)[]>;
 ringSection: RefObject<HTMLElement>; ring: Plane; mapSection: RefObject<HTMLElement>; mapPlane: Plane;
 ticketStack: Plane; closing: RefObject<HTMLElement>; progressBar: Plane;
 eventKey: string; count: number; onActive: (index: number) => void;
};
const clamp = (value: number) => Math.min(1,Math.max(0,value));
export default function LoggedHomeScrollScene(props: LoggedHomeScrollSceneProps) {
 const {container,hero,heroPosters,flightPosters,ringSection,ring,mapSection,mapPlane,ticketStack,closing,progressBar,count,eventKey,onActive} = props;
 const timers = useRef(new Map<HTMLElement,ReturnType<typeof setTimeout>>());
 const activeIndex = useRef(-1);
 const flightGeometry=useRef<{x:number;y:number;endX:number;endY:number;scale:number}[]>([]);
 const headingGeometry=useRef<{node:HTMLElement;top:number;height:number;index:number;revealed:boolean}[]>([]);
 function measureHeadings() {
  const scroll=container.current,root=hero.current?.parentElement;if(!scroll||!root)return;
  const viewport=scroll.getBoundingClientRect(),previous=new Map(headingGeometry.current.map(item=>[item.node,item.revealed]));
  headingGeometry.current=Array.from(root.querySelectorAll<HTMLElement>("[data-heading-line]")).map(node=>{
   const transform=node.style.transform;node.style.removeProperty("transform");const bounds=node.getBoundingClientRect();node.style.transform=transform;
   return {node,top:bounds.top-viewport.top+scroll.scrollTop,height:bounds.height,index:Number(node.dataset.headingLine)||0,revealed:previous.get(node)??(bounds.top<viewport.bottom&&bounds.bottom>viewport.top)};
  });
 }
 function updateHeadings(value:number) {
  const height=container.current?.clientHeight||1;
  headingGeometry.current.forEach(item=>{
   if(item.revealed)return;
   const progress=clamp((value-(item.top-height*.9)-item.index*24)/(height*.42));
   write(item.node,`translateY(${(1-progress)*item.height*1.15}px)`);
   if(progress===1)item.revealed=true;
  });
 }
 function measureFlights() {
  const root=hero.current?.parentElement,stage=ring.current?.parentElement;
  if(!root||!stage||!ring.current)return;
  const origin=root.getBoundingClientRect(),target=stage.getBoundingClientRect(),targetWidth=ring.current.offsetWidth;
  const radius=Number.parseFloat(ring.current.style.getPropertyValue("--ring-radius"))||170;
  flightGeometry.current=heroPosters.current.map((node,index)=>{
   const copy=flightPosters.current[index];if(!node||!copy)return {x:0,y:0,endX:0,endY:0,scale:1};
   const transform=node.style.transform;node.style.removeProperty("transform");
   const bounds=node.getBoundingClientRect(),width=node.offsetWidth;node.style.transform=transform;
   copy.style.width=width+"px";
   const eventIndex=[1,2,0][index],angle=eventIndex*2*Math.PI/Math.max(1,count);
   return {x:bounds.left-origin.left+(bounds.width-width)/2,y:bounds.top-origin.top,endX:target.left-origin.left+target.width/2-width/2+Math.sin(angle)*radius*.5,endY:target.top-origin.top+target.height/2-width*4/3/2,scale:targetWidth/Math.max(1,width)};
  });
 }
 const {scrollYProgress:overall,scrollY} = useScroll({container});
 const {scrollYProgress:heroRaw} = useScroll({container,target:hero,offset:["start start","end start"]});
 const {scrollYProgress:ringRaw} = useScroll({container,target:ringSection,offset:["start start","end end"]});
 const {scrollYProgress:mapRaw} = useScroll({container,target:mapSection,offset:["start start","end end"]});
 const {scrollYProgress:closingRaw}=useScroll({container,target:closing,offset:["start end","end start"]});
 const closingProgress=useSpring(closingRaw,{stiffness:100,damping:28,mass:.4});
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
   const flight=clamp((value-.35)/.65),copy=flightPosters.current[index],geometry=flightGeometry.current[index];
   if(node)node.style.opacity=String(1-clamp(flight/.12));
   if(copy&&geometry){
    const ease=flight*flight*(3-2*flight);
    write(copy,`perspective(1000px) translate3d(${geometry.x+(geometry.endX-geometry.x)*ease}px,${geometry.y+(geometry.endY-geometry.y)*ease}px,0) rotateY(${side*12*(1-ease)}deg) rotateZ(${side*5*(1-ease)}deg) scale(${1+(geometry.scale-1)*ease})`);
    copy.style.opacity=String(clamp(flight/.12)*clamp((1-flight)/.18));
   }
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
  const end=clamp((value-.76)/.24),zoom=end*end*(3-2*end)*.09;
  write(mapPlane.current,`rotateX(${(1-value)*56}deg) rotateZ(${(1-value)*-10}deg) scale(${.85+value*.15+zoom})`);
  mapPlane.current?.querySelectorAll<HTMLElement>("[data-map-pin]").forEach(pin=>write(pin,`translateZ(${value*24}px) rotateX(${(1-value)*-56}deg)`));
 }
 function updateTickets(value:number) {
  ticketStack.current?.querySelectorAll<HTMLElement>("[data-ticket]").forEach((node,index)=>{
   const side=index-1;
   write(node,`translate3d(${side*(value-.5)*140}px,${(value-.5)*-42}px,${60+index*30}px) rotateX(${(.5-value)*30}deg) rotateZ(${side*(value-.5)*12}deg)`);
  });
 }
 function updateClosing(raw:number) {
  const value=clamp(raw),node=closing.current;if(!node)return;
  write(node.querySelector("h2"),`translate3d(0,${(.5-value)*28}px,0) scale(${.985+value*.03})`);
  node.style.setProperty("--closing-glow-offset",`${(.5-value)*36}px`);
  node.style.setProperty("--closing-glow-scale",String(1+value*.035));
  node.style.setProperty("--closing-glow-change","transform");
  const old=timers.current.get(node);if(old)clearTimeout(old);
  timers.current.set(node,setTimeout(()=>{node.style.removeProperty("--closing-glow-change");timers.current.delete(node);},180));
 }
 useMotionValueEvent(closingProgress,"change",updateClosing);
 useMotionValueEvent(scrollY,"change",updateHeadings);
 useMotionValueEvent(heroValue,"change",updateHero);
 useMotionValueEvent(ringValue,"change",updateRing);
 useMotionValueEvent(mapValue,"change",updateMap);
 useMotionValueEvent(ticketValue,"change",updateTickets);
 useMotionValueEvent(overall,"change",value=>{if(progressBar.current)progressBar.current.style.transform=`scaleX(${clamp(value)})`;});
 useEffect(()=>{
  measureFlights();measureHeadings();updateHeadings(scrollY.get());
  const resize=()=>{measureFlights();measureHeadings();updateHeadings(scrollY.get());updateHero(heroValue.get());};
  window.addEventListener("resize",resize);
  const sizes=new ResizeObserver(resize);if(hero.current?.parentElement)sizes.observe(hero.current.parentElement);if(hero.current)sizes.observe(hero.current);if(ring.current?.parentElement)sizes.observe(ring.current.parentElement);
  updateClosing(closingProgress.get());
  activeIndex.current=-1;updateHero(heroValue.get());updateRing(ringValue.get());updateMap(mapValue.get());updateTickets(ticketValue.get());
  if(progressBar.current)progressBar.current.style.transform=`scaleX(${clamp(overall.get())})`;
  const node=ring.current;
  const focus=()=>updateRing(ringValue.get());node?.addEventListener("home-ring-focus",focus);
  const resume=()=>{if(node && !node.contains(document.activeElement)){delete node.dataset.focusedIndex;updateRing(ringValue.get());}};
  const scrollNode=container.current;scrollNode?.addEventListener("scroll",resume,{passive:true});
  const heroNodes=[...heroPosters.current],flightNodes=[...flightPosters.current];
  const moving=[...heroNodes,...flightNodes,...headingGeometry.current.map(item=>item.node),closing.current?.querySelector<HTMLElement>("h2"),node,mapPlane.current,...Array.from(mapPlane.current?.querySelectorAll<SVGRectElement>("[data-map-route-reveal]")??[]),...Array.from(mapPlane.current?.querySelectorAll<HTMLElement>("[data-map-pin]")??[]),...Array.from(ticketStack.current?.querySelectorAll<HTMLElement>("[data-ticket]")??[]),progressBar.current];
  const closingNode=closing.current;
  const pending=timers.current;
  return()=>{["--closing-glow-offset","--closing-glow-scale","--closing-glow-change"].forEach(key=>closingNode?.style.removeProperty(key));window.removeEventListener("resize",resize);sizes.disconnect();flightGeometry.current=[];headingGeometry.current=[];heroNodes.forEach(item=>item?.style.removeProperty("opacity"));flightNodes.forEach(item=>{item?.style.removeProperty("opacity");item?.style.removeProperty("width");});scrollNode?.removeEventListener("scroll",resume);node?.removeEventListener("home-ring-focus",focus);pending.forEach(timer=>clearTimeout(timer));pending.clear();moving.forEach(item=>{item?.style.removeProperty("transform");item?.style.removeProperty("will-change");});};
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
