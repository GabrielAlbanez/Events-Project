"use client";

import { memo, useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
import type { EventChatMessage } from "@/types/eventChat";
import { MessageBubble, chatDate } from "./MessageBubble";
import { messageWindow } from "./messageWindow";

const WINDOW_THRESHOLD = 200;
export const MessageList = memo(function MessageList({ messages, viewport, following, privateMode, deliveredThrough, readThrough, failed, retry, onImageLoad, onRangeRendered }: { messages: EventChatMessage[]; viewport: RefObject<HTMLDivElement>; following?: MutableRefObject<boolean>; privateMode: boolean; deliveredThrough: number; readThrough: number; failed: boolean; retry: () => void; onImageLoad: () => void; onRangeRendered?: () => void }) {
  const list = useRef<HTMLOListElement>(null);
  const measured = useRef(new Map<string, number>());
  const preserveBottom = useRef(false);
  const [frame, setFrame] = useState({ top: 0, height: 600, revision: 0 });
  const windowed = messages.length > WINDOW_THRESHOLD;
  useEffect(() => {
    const element = viewport.current;
    if (!element || !windowed) return;
    let request = 0;
    const changed = () => { cancelAnimationFrame(request); request = requestAnimationFrame(() => setFrame(previous => ({ ...previous, top: element.scrollTop, height: element.clientHeight }))); };
    changed(); element.addEventListener("scroll", changed, { passive: true });
    const observer = new ResizeObserver(changed); observer.observe(element);
    return () => { cancelAnimationFrame(request); observer.disconnect(); element.removeEventListener("scroll", changed); };
  }, [viewport, windowed]);
  const heights = messages.map(message => measured.current.get(message.clientId) ?? (message.image ? 280 : 76));
  const range = windowed ? messageWindow(heights, frame.top, frame.height) : { start: 0, end: messages.length, before: 0, after: 0 };
  useEffect(() => {
    if (!windowed || !list.current) return;
    const container = viewport.current;
    const measure = () => {
      let changed = false, adjustment = 0;
      for (const node of Array.from(list.current?.querySelectorAll<HTMLElement>("[data-window-key]") ?? [])) {
        const key = node.dataset.windowKey;
        if (!key) continue;
        const height = node.getBoundingClientRect().height;
        const old = measured.current.get(key) ?? (messages.find(message => message.clientId === key)?.image ? 280 : 76);
        if (height > 0 && Math.abs(old - height) > .5) {
          if (container && node.getBoundingClientRect().bottom < container.getBoundingClientRect().top) adjustment += height - old;
          measured.current.set(key, height); changed = true;
        }
      }
      if (changed) {
        preserveBottom.current = following ? following.current : !!container && container.scrollHeight - container.scrollTop - container.clientHeight < 90;
        if (container && adjustment) container.scrollTop += adjustment;
        setFrame(previous => ({ ...previous, top: container?.scrollTop ?? previous.top, revision: previous.revision + 1 }));
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const node of Array.from(list.current.children)) observer.observe(node);
    return () => observer.disconnect();
  }, [windowed, messages, range.start, range.end, viewport, following]);
  useEffect(() => {
    const element = viewport.current;
    if (!windowed || !element || (following ? !following.current : !preserveBottom.current && element.scrollHeight - element.scrollTop - element.clientHeight >= 90)) return;
    preserveBottom.current = false;
    // Wait for spacer heights and image measurements to reach the next layout frame.
    const request = requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight;
      setFrame(previous => previous.top === element.scrollTop ? previous : { ...previous, top: element.scrollTop });
      onRangeRendered?.();
    });
    return () => cancelAnimationFrame(request);
  }, [windowed, frame.revision, range.start, range.end, viewport, onRangeRendered, following]);
  // A virtualized latest bubble can mount after the history's initial read observer.
  useEffect(() => { onRangeRendered?.(); }, [range.start, range.end, frame.revision, messages, onRangeRendered]);
  return <ol ref={list} aria-label="Mensagens" style={{ overflowAnchor: "none" }}>{range.before > 0 && <li aria-hidden="true" style={{ height: range.before }} />}{messages.slice(range.start, range.end).map((message, offset) => {
    const index = range.start + offset, previous = messages[index - 1];
    const dateChanged = !previous || new Date(message.createdAt).toDateString() !== new Date(previous.createdAt).toDateString();
    const first = dateChanged || previous?.author.id !== message.author.id || new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() > 5 * 60 * 1000;
    return <MessageBubble key={message.clientId} message={message} first={first} date={dateChanged ? chatDate(message.createdAt) : undefined} privateMode={privateMode} deliveredThrough={deliveredThrough} readThrough={readThrough} failed={failed && message.id < 0} retry={retry} onImageLoad={onImageLoad} windowKey={message.clientId} />;
  })}{range.after > 0 && <li aria-hidden="true" style={{ height: range.after }} />}</ol>;
});
