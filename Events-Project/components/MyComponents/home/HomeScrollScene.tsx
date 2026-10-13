"use client";
import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import { useMotionValueEvent, useScroll, useSpring } from "framer-motion";
type PlaneRef = RefObject<HTMLDivElement>;
type HomeScrollSceneProps = {
 container: PlaneRef; hero: RefObject<HTMLElement>; mapPlane: PlaneRef; pinPlane: PlaneRef;
 ticketPlane: PlaneRef; featured: RefObject<HTMLElement>; discovery: RefObject<HTMLElement>;
 cards: MutableRefObject<(HTMLElement | null)[]>; cardKey: string;
};
const clamp = (value: number) => Math.min(1, Math.max(0, value));
/** The three drivers use the actual discovery scroller, never the window. */
export default function HomeScrollScene({container,hero,mapPlane,pinPlane,ticketPlane,featured,discovery,cards,cardKey}:HomeScrollSceneProps) {
 const {scrollYProgress:heroRaw}=useScroll({container,target:hero,offset:["start start","end start"]});
 const {scrollYProgress:featuredRaw}=useScroll({container,target:featured,offset:["start end","end start"]});
 const {scrollYProgress:discoveryRaw}=useScroll({container,target:discovery,offset:["start end","end start"]});
 const heroProgress=useSpring(heroRaw,{stiffness:110,damping:26,mass:.4});
 const featuredProgress=useSpring(featuredRaw,{stiffness:120,damping:28,mass:.4});
 const discoveryProgress=useSpring(discoveryRaw,{stiffness:160,damping:19,mass:.5});
 const touched=useRef(new Set<Element>());
 const cleanupTimer=useRef<ReturnType<typeof setTimeout>>();
 const measurements=useRef(new Map<Element,{visible:boolean}>());
 function write(node:HTMLElement|SVGElement|null|undefined,transform:string,opacity?:number) {
  if(!node)return;
  node.style.transform=transform;
  if(opacity!==undefined)node.style.opacity=String(opacity);
  node.style.willChange=opacity===undefined?"transform":"transform, opacity";
  touched.current.add(node);
 }
 function release() {
  clearTimeout(cleanupTimer.current);
  cleanupTimer.current=setTimeout(()=>touched.current.forEach(node=>(node as HTMLElement).style.removeProperty("will-change")),180);
 }
 function headings(section:HTMLElement|null,value:number) {
  section?.querySelectorAll<HTMLElement>("[data-home-heading-line]").forEach((node,index)=>{
   if(measurements.current.get(node)?.visible)return;
   const phase=clamp((value-.08-index*.025)/.25);
   write(node,`translateY(${(1-phase)*110}%)`);
   if(phase===1)measurements.current.set(node,{visible:true});
  });
 }
 function updateHero(value:number) {
  const phase=clamp(value);
  write(mapPlane.current,`translate3d(0,${phase*55}px,${-phase*70}px) rotateX(${16+phase*19}deg) rotate(-12deg) skewY(4deg) scale(${1+phase*.1})`);
  write(pinPlane.current,`translate3d(0,${-phase*130}px,${phase*140}px) rotateY(${-phase*22}deg) rotate(${12+phase*8}deg) scale(${1+phase*.3})`);
  write(ticketPlane.current,`translate3d(0,${-phase*85}px,${phase*80}px) rotateX(${-phase*12}deg) rotate(${5-phase*10}deg)`);
  write(hero.current?.querySelector<HTMLElement>("[data-home-copy]"),`translateY(${-phase*40}px)`,1-phase*.7);
  write(mapPlane.current?.querySelector<SVGElement>("[data-home-route-reveal]"),`scaleX(${.18+phase*.82})`);
  headings(hero.current,phase);release();
 }
 function updateFeatured(value:number) {
  const phase=clamp(value),entrance=1-clamp((phase-.1)/.35),departure=clamp((phase-.7)/.3);
  cards.current.forEach((node,index)=>{
   const side=index-1,center=index===1;
   write(node,`translate3d(${side*entrance*32}px,${entrance*64-departure*20}px,${(1-entrance)*(center?65:18)}px) rotateX(${entrance*9}deg) rotateY(${-side*entrance*8}deg) scale(${center?1+(1-entrance)*.04:1})`);
  });headings(featured.current,phase);release();
 }
 function updateDiscovery(value:number) {
  const phase=clamp(value),settle=clamp((phase-.08)/.4);
  write(discovery.current?.querySelector<HTMLElement>("[data-home-discovery-pin]"),`translateY(${(1-settle)*-52}px) rotate(${(1-settle)*-12}deg) scale(${.9+settle*.1})`);
  write(discovery.current?.querySelector<HTMLElement>("[data-home-discovery-backdrop]"),`scale(${1+phase*.06})`);
  headings(discovery.current,phase);release();
 }
 useMotionValueEvent(heroProgress,"change",updateHero);
 useMotionValueEvent(featuredProgress,"change",updateFeatured);
 useMotionValueEvent(discoveryProgress,"change",updateDiscovery);
 useEffect(()=>{
  const scroll=container.current;
  const sections=[hero.current,featured.current,discovery.current];
  function measure() {
   if(!scroll)return;
   const viewport=scroll.getBoundingClientRect();
   sections.forEach(section=>section?.querySelectorAll<HTMLElement>("[data-home-heading-line]").forEach(node=>{
    if(measurements.current.has(node))return;
    const bounds=node.getBoundingClientRect();
    measurements.current.set(node,{visible:bounds.top<viewport.bottom&&bounds.bottom>viewport.top});
   }));
  }
  measure();updateHero(heroProgress.get());updateFeatured(featuredProgress.get());updateDiscovery(discoveryProgress.get());
  const observer=new ResizeObserver(measure);if(scroll)observer.observe(scroll);
  sections.forEach(section=>{if(section)observer.observe(section);});
  const nodes=touched.current,geometry=measurements.current;
  return ()=>{
   observer.disconnect();clearTimeout(cleanupTimer.current);
   nodes.forEach(node=>{const style=(node as HTMLElement).style;style.removeProperty("transform");style.removeProperty("opacity");style.removeProperty("will-change");});
   nodes.clear();geometry.clear();
  };
 // Drivers subscribe to stable refs; this effect also initializes newly loaded event cards.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[cardKey,container,hero,featured,discovery,mapPlane,pinPlane,ticketPlane,cards]);
 return null;
}
