"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** Browser unload and ordinary navigation links; no history manipulation. */
export function useUnsavedChanges(dirty: boolean) {
  const saved = useRef(false);
  const [destination, setDestination] = useState<string | null>(null);
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => {
      if (saved.current) return;
      event.preventDefault(); event.returnValue = "";
    };
    const click = (event: MouseEvent) => {
      if (saved.current || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const element = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(element instanceof HTMLAnchorElement) || element.hasAttribute("download") || (element.target && element.target !== "_self")) return;
      const url = new URL(element.href, window.location.href);
      if (url.href === window.location.href || (url.pathname === window.location.pathname && url.search === window.location.search && url.hash)) return;
      event.preventDefault(); event.stopPropagation(); setDestination(url.href);
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", click, true); };
  }, [dirty]);
  return {
    markSaved: () => { saved.current = true; },
    dialog: <Dialog open={!!destination} onOpenChange={open => { if (!open) setDestination(null); }}><DialogContent className="z-[120] max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-lg"><DialogTitle>Sair sem salvar?</DialogTitle><DialogDescription>Você tem alterações neste evento. Volte ao formulário e salve um rascunho para não perder seu trabalho.</DialogDescription><DialogFooter className="gap-2"><Button variant="outline" type="button" onClick={() => setDestination(null)}>Continuar editando</Button><Button variant="destructive" type="button" onClick={() => { if (destination) { saved.current = true; window.location.assign(destination); } }}>Sair sem salvar</Button></DialogFooter></DialogContent></Dialog>,
  };
}
