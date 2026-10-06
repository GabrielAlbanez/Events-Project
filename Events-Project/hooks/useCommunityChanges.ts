"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { diffCommunityEvent, type CommunitySection, type EventLiveChanges } from "@/lib/community/liveChanges";
import type { CommunityEventSnapshot } from "@/types/community";

type Notice = EventLiveChanges["notices"][number];
type Options = { data: CommunityEventSnapshot | null; identity: string; revision: number; source: "own" | "remote"; selected: CommunitySection; panel: RefObject<HTMLDivElement> };

export function useCommunityChanges({ data, identity, revision, source, selected, panel }: Options) {
  const previous = useRef<{ identity: string; data: CommunityEventSnapshot | null; revision: number }>({ identity, data: null, revision: 0 });
  const [state, setState] = useState<{ identity: string; counts: Partial<Record<CommunitySection, number>>; notices: Notice[] }>({ identity, counts: {}, notices: [] });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const permissionsChanged = !!data && !!previous.current.data && JSON.stringify(previous.current.data.permissions) !== JSON.stringify(data.permissions);
    if (previous.current.identity !== identity || !data || permissionsChanged) {
      previous.current = { identity, data: null, revision: 0 };
      setState({ identity, counts: {}, notices: [] });
    }
    if (!data || previous.current.revision === revision) return;
    const changes = diffCommunityEvent(source === "own" ? null : previous.current.data, data);
    previous.current = { identity, data, revision };
    const notices = changes.notices;
    setState(current => {
      const counts = current.identity === identity ? { ...current.counts } : {};
      for (const key of Object.keys(changes.sections) as CommunitySection[]) counts[key] = Math.min(9, (counts[key] ?? 0) + (changes.sections[key] ?? 0));
      const existing = current.identity === identity ? current.notices.filter(item => !notices.some(notice => notice.kind === item.kind && notice.id === item.id)) : [];
      return { identity, counts, notices: [...existing, ...notices].slice(-4) };
    });
  }, [data, identity, revision, source]);

  useEffect(() => {
    const element = panel.current;
    if (!element || !data) { setVisible(false); return; }
    let inViewport = typeof IntersectionObserver === "undefined";
    const update = () => setVisible(inViewport && document.visibilityState === "visible");
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => { inViewport = entries.some(entry => entry.isIntersecting); update(); });
    observer?.observe(element); document.addEventListener("visibilitychange", update); update();
    return () => { observer?.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, [panel, identity, selected, !!data]);

  useEffect(() => {
    if (!visible || document.visibilityState !== "visible") return;
    setState(current => current.identity === identity && current.counts[selected] ? { ...current, counts: { ...current.counts, [selected]: 0 } } : current);
  }, [visible, identity, selected, revision]);

  const current: { counts: Partial<Record<CommunitySection, number>>; notices: Notice[] } = state.identity === identity ? state : { counts: {}, notices: [] };
  function dismiss(notice: Notice) {
    setState(value => ({ ...value, notices: value.notices.filter(item => item.kind !== notice.kind || item.id !== notice.id) }));
  }
  return { counts: current.counts, notices: current.notices, dismiss };
}
