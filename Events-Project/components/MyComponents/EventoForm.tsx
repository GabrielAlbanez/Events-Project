"use client";

import React, { useEffect, useRef, useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { maximumUploadImageBytes, uploadMultipartFits, uploadMultipartLimitMessage } from "@/lib/uploadLimits";
import { toast } from "react-toastify";
import { useRouter } from "next/navigation";
import MercadoPagoConnectCard, { useMercadoPagoConnect } from "@/components/MyComponents/tickets/MercadoPagoConnectCard";
import { TICKET_FEE_PERCENT, TICKET_MAX_CENTS, TICKET_MIN_CENTS, formatTicketAmount, isValidTicketPrice, ticketNetCents } from "@/lib/tickets";
import { DateRangePicker } from "@heroui/react";
import { getLocalTimeZone, parseDate, today } from "@internationalized/date";
import { AlertTriangle, Check, ImagePlus, Info, MapPin, Sparkles, X } from "lucide-react";
import { atualizarEvento, salvarEvento, salvarRascunho } from "@/app/(actions)/eventos/actions";
import { sensitiveEventChanges, sensitiveFieldLabels, type SensitiveChange } from "@/lib/eventScheduleChanges";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { criarSerieRecorrente } from "@/app/(actions)/eventos/recurrence";
import type { Evento } from "@/types";
import { eventCategories } from "@/types/features";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useEventDraftRecovery } from "@/hooks/useEventDraftRecovery";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { useSocket } from "@/context/SocketContext";
import { useGoogleMaps } from "./GoogleMapsLoader";
import { PlaceSearchCombobox } from "./PlaceAutocomplete";
import { eventTimeError, normalizeEventTime } from "@/schemas/eventInput";
import { GoogleMapsPreference } from "./GoogleMapsPreference";
import { eventTipsAction } from "@/app/(actions)/ai/action";
import type { EventDraftSuggestion } from "@/types/ai";
import { EventAiDraftDialog, type DraftField } from "./ai/EventAiDraftDialog";
import { EventAiTipsDialog } from "./ai/EventAiTipsDialog";

type EventoFormData = {
  nome: string;
  descricao: string;
  organizerName: string;
  ageRating: string;
  accessibilityInfo: string;
  participationInfo: string;
  LinkParaCompraIngresso: string;
  endereco: string;
  category: string;
  price: string;
  capacity: string;
  isFree: boolean;
  ticketsEnabled: boolean;
  ticketCapacity: string;
  requiresApproval: boolean;
  startTime: string;
  endTime: string;
};

type EventDate = ReturnType<typeof parseDate>;
type EventDateRange = { start: EventDate; end: EventDate };

const sectionClass = "rounded-[22px] border border-border bg-card p-5 sm:p-7 shadow-[var(--em-shadow-card)]";
const descriptionOutline = "O que vai acontecer:\n\nPara quem é o evento:\n\nProgramação e atrações:\n\nInformações de entrada:";
const hasUsefulDescription = (value: string) =>
  value.replace(/O que vai acontecer:|Para quem é o evento:|Programação e atrações:|Informações de entrada:/gi, "").trim().length >= 10;
const priceCentsOf = (values: Pick<EventoFormData, "isFree" | "price">) => values.isFree ? 0 : Math.round(Number(values.price.replace(",", ".")) * 100);

/** Same rule as the server (lib/services/events.ts): which edits send a published event back to review. */
function publishedReviewReasons(initialEvent: Evento | undefined, values: EventoFormData, dateRange: EventDateRange | null, coordinates: { lat: number; lng: number } | null, newBanner: boolean): SensitiveChange[] {
  if (initialEvent?.status !== "PUBLISHED") return [];
  const coverChange: SensitiveChange[] = newBanner ? [sensitiveFieldLabels.banner] : [];
  return [...sensitiveEventChanges(
    { nome: initialEvent.nome, dataInicio: initialEvent.dataInicio, dataFim: initialEvent.dataFim, startTime: initialEvent.startTime ?? null, endTime: initialEvent.endTime ?? null, endereco: initialEvent.endereco, lat: initialEvent.lat ?? null, lng: initialEvent.lng ?? null, linkParaCompra: initialEvent.linkParaCompra, isFree: initialEvent.isFree ?? true, priceCents: initialEvent.priceCents ?? 0, capacity: initialEvent.capacity ?? null, organizerName: initialEvent.organizerName ?? "" },
    { nome: values.nome.trim(), dataInicio: dateRange?.start.toString() ?? "", dataFim: dateRange?.end.toString() ?? "", startTime: values.startTime, endTime: values.endTime, endereco: values.endereco.trim(), lat: coordinates?.lat ?? null, lng: coordinates?.lng ?? null, linkParaCompra: values.LinkParaCompraIngresso.trim(), isFree: values.isFree, priceCents: priceCentsOf(values), capacity: values.capacity.trim() === "" ? null : Number(values.capacity.trim()), organizerName: values.organizerName.trim() },
  ), ...coverChange];
}

type EventoFormProps = React.ComponentPropsWithoutRef<"form"> & { initialEvent?: Evento };

export function EventoForm({ className, initialEvent, ...props }: EventoFormProps) {
  const socket = useSocket();
  const { isLoaded: mapsLoaded } = useGoogleMaps();
  const form = useForm<EventoFormData>({
    mode: "onChange",
    defaultValues: { nome: initialEvent?.nome ?? "", descricao: initialEvent?.descricao ?? "", organizerName: initialEvent?.organizerName ?? "", ageRating: initialEvent?.ageRating ?? "", accessibilityInfo: initialEvent?.accessibilityInfo ?? "", participationInfo: initialEvent?.participationInfo ?? "", LinkParaCompraIngresso: initialEvent?.linkParaCompra ?? "", endereco: initialEvent?.endereco ?? "", category: initialEvent?.category ?? "", price: initialEvent?.priceCents != null ? (initialEvent.priceCents / 100).toFixed(2) : "", capacity: initialEvent?.capacity != null ? String(initialEvent.capacity) : "", isFree: initialEvent?.isFree ?? true, startTime: normalizeEventTime(initialEvent?.startTime), endTime: normalizeEventTime(initialEvent?.endTime), ticketsEnabled: initialEvent?.ticketsEnabled ?? false, ticketCapacity: initialEvent?.ticketCapacity != null ? String(initialEvent.ticketCapacity) : "", requiresApproval: initialEvent?.requiresApproval ?? true },
  });
  // Selling through EventMap needs payments configured and the organizer's Mercado Pago connected (re-checked on the server).
  const mercadoPago = useMercadoPagoConnect(() => {
    // Only the sale switch changes; every other field stays exactly as typed.
    if (form.getValues("isFree")) return;
    form.setValue("ticketsEnabled", true, { shouldDirty: true });
    form.clearErrors("LinkParaCompraIngresso");
    if (form.getValues("price").trim()) void form.trigger("price");
  });
  const sellerStatus = mercadoPago.status;
  const { data } = useCurrentUser();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const bannerUrlRef = useRef<string | null>(null);
  const galleryUrlsRef = useRef<string[]>([]);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [banner, setBanner] = useState<File | null>(null);
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [dateRange, setDateRange] = useState<EventDateRange | null>(() => {
    try {
      return initialEvent?.dataInicio && initialEvent?.dataFim ? { start: parseDate(initialEvent.dataInicio.slice(0, 10)), end: parseDate(initialEvent.dataFim.slice(0, 10)) } : null;
    } catch { return null; }
  });
  const [dateError, setDateError] = useState("");
  const [recurrence, setRecurrence] = useState<"none" | "WEEKLY" | "MONTHLY">("none");
  const [repeatEvery, setRepeatEvery] = useState(1);
  const [occurrences, setOccurrences] = useState(4);
  const [addressMode, setAddressMode] = useState<"search" | "manual">("search");
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(initialEvent?.lat != null && initialEvent?.lng != null ? { lat: initialEvent.lat, lng: initialEvent.lng } : null);
  // Text edited in the search after a pick has no matching coordinates until a suggestion is chosen again.
  const [addressNeedsPick, setAddressNeedsPick] = useState(false);
  const saveMode = useRef<"draft" | "submit">("submit");
  const [reviewPrompt, setReviewPrompt] = useState<EventoFormData | null>(null);
  // "Dicas antes de enviar": shown before the submission; never blocks it.
  const [tipsReview, setTipsReview] = useState<{ values: EventoFormData; reviewConfirmed: boolean; loading: boolean; tips: string[]; aiUsed: boolean } | null>(null);
  const tipsRequest = useRef(0);
  const allValues = form.watch();
  const isPublishedEdit = initialEvent?.status === "PUBLISHED";
  const reviewReasons = publishedReviewReasons(initialEvent, allValues, dateRange, coordinates, !!banner);
  const fingerprint = JSON.stringify({ values: allValues, dates: dateRange && [dateRange.start.toString(), dateRange.end.toString()], coordinates, recurrence, repeatEvery, occurrences });
  const initialFingerprint = useRef(fingerprint);
  const unsaved = useUnsavedChanges(fingerprint !== initialFingerprint.current || !!banner || galleryFiles.length > 0);

  const draftRecovery = useEventDraftRecovery(data?.id, initialEvent?.id, fingerprint, initialFingerprint.current, fingerprint !== initialFingerprint.current);
  const restoreDraft = () => {
    const draft = draftRecovery.recover();
    if (!draft) return;
    form.reset(draft.values);
    try { setDateRange(draft.dates ? { start: parseDate(draft.dates[0]), end: parseDate(draft.dates[1]) } : null); } catch { setDateRange(null); }
    setCoordinates(draft.coordinates); setRecurrence(draft.recurrence); setRepeatEvery(draft.repeatEvery); setOccurrences(draft.occurrences); setAddressMode("manual"); setAddressNeedsPick(false);
    toast.info("Rascunho recuperado. Se necessário, selecione novamente as imagens.");
  };

  const nome = form.watch("nome");
  const descricao = form.watch("descricao");
  const endereco = form.watch("endereco");
  const link = form.watch("LinkParaCompraIngresso");
  const isFree = form.watch("isFree");
  const ticketsOn = !isFree && form.watch("ticketsEnabled");
  const ticketPriceCents = priceCentsOf({ isFree, price: form.watch("price") });
  const canSellTickets = Boolean(sellerStatus?.configured && sellerStatus.connected);
  // Imported events always keep the direct registration flow (the server ignores the switch for them).
  const importedEvent = Boolean(initialEvent?.aiImport);
  // On edit, the stored value must be loaded; otherwise only an explicit change is sent so the server keeps what it has.
  const approvalLoaded = !initialEvent || typeof initialEvent.requiresApproval === "boolean";
  const approvalTouched = useRef(false);
  const category = form.watch("category");
  const checklist = [
    { label: "Nome e descrição", ready: nome.trim().length >= 3 && hasUsefulDescription(descricao) },
    { label: "Data e local", ready: Boolean(dateRange?.start && dateRange?.end && endereco.trim().length >= 3) },
    { label: "Ingresso e banner", ready: (ticketsOn || /^https?:\/\/[^\s]+\.[^\s]+$/i.test(link.trim())) && Boolean(banner || initialEvent?.banner) && Boolean(category) },
  ];
  const completeCount = checklist.filter((item) => item.ready).length;

  useEffect(() => () => {
    if (bannerUrlRef.current) URL.revokeObjectURL(bannerUrlRef.current);
    galleryUrlsRef.current.forEach(URL.revokeObjectURL);
  }, []);

  const removeBanner = () => {
    if (bannerUrlRef.current) URL.revokeObjectURL(bannerUrlRef.current);
    bannerUrlRef.current = null;
    setBannerUrl(null);
    setBanner(null);
    if (bannerInputRef.current) bannerInputRef.current.value = "";
  };

  const removeGalleryImage = (index: number) => {
    const url = galleryUrlsRef.current[index];
    if (url) URL.revokeObjectURL(url);
    galleryUrlsRef.current = galleryUrlsRef.current.filter((_, imageIndex) => imageIndex !== index);
    setGalleryUrls([...galleryUrlsRef.current]);
    setGalleryFiles((files) => files.filter((_, imageIndex) => imageIndex !== index));
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  };

  // Events stored with only an end time stay editable while that value is kept.
  const storedEndOnlyTime = !initialEvent?.startTime && initialEvent?.endTime ? normalizeEventTime(initialEvent.endTime) : "";
  const timeErrorFor = (startTime: string, endTime: string) => eventTimeError(
    { dataInicio: dateRange?.start.toString(), dataFim: dateRange?.end.toString(), startTime, endTime },
    Boolean(storedEndOnlyTime) && endTime === storedEndOnlyTime,
  );
  const startValue = form.watch("startTime");
  const endValue = form.watch("endTime");
  const scheduleKey = dateRange ? `${dateRange.start.toString()}/${dateRange.end.toString()}` : "";
  useEffect(() => {
    // Start and dates also decide whether the end time is valid.
    if (form.getValues("endTime")) void form.trigger("endTime");
  }, [startValue, scheduleKey, form]);

  const showBannerFile = (file: File) => {
    if (bannerUrlRef.current) URL.revokeObjectURL(bannerUrlRef.current);
    const url = URL.createObjectURL(file);
    bannerUrlRef.current = url;
    setBannerUrl(url);
    setBanner(file);
  };

  /** "Escrever com IA": only the areas the organizer kept checked are written; coordinates are never invented. */
  const applyAiDraft = (suggestion: EventDraftSuggestion, fields: DraftField[], poster: File | null) => {
    const set = (name: keyof EventoFormData, value: string | boolean) => form.setValue(name, value, { shouldDirty: true, shouldValidate: true });
    let addressApplied = false;
    for (const field of fields) {
      switch (field) {
        case "datas": {
          if (!suggestion.dataInicio) break;
          try {
            const start = parseDate(suggestion.dataInicio);
            const end = suggestion.dataFim ? parseDate(suggestion.dataFim) : start;
            setDateRange(start.compare(end) <= 0 ? { start, end } : { start, end: start });
            setDateError("");
          } catch { /* invalid date from the AI: keep the current period */ }
          break;
        }
        case "preco":
          if (suggestion.isFree === true) set("isFree", true);
          else if (suggestion.price) { set("isFree", false); set("price", suggestion.price); }
          break;
        case "endereco":
          if (!suggestion.endereco?.trim()) break;
          set("endereco", suggestion.endereco.trim().slice(0, 300));
          setCoordinates(null);
          // With the map search on, the text still needs a suggestion picked to confirm the place.
          setAddressNeedsPick(mapsLoaded && addressMode === "search");
          addressApplied = true;
          break;
        case "startTime":
        case "endTime": {
          const value = normalizeEventTime(suggestion[field]);
          if (value) set(field, value);
          break;
        }
        case "category":
          if (suggestion.category && (eventCategories as readonly string[]).includes(suggestion.category)) set("category", suggestion.category);
          break;
        case "nome":
          if (suggestion.nome?.trim()) set("nome", suggestion.nome.trim().slice(0, 100));
          break;
        case "descricao":
          if (suggestion.descricao?.trim()) set("descricao", suggestion.descricao.trim().slice(0, 3000));
          break;
        case "organizerName":
          if (suggestion.organizerName?.trim()) set("organizerName", suggestion.organizerName.trim().slice(0, 160));
          break;
        case "ageRating":
          if (suggestion.ageRating?.trim()) set("ageRating", suggestion.ageRating.trim().slice(0, 80));
          break;
        case "LinkParaCompraIngresso":
          if (suggestion.LinkParaCompraIngresso?.trim()) set("LinkParaCompraIngresso", suggestion.LinkParaCompraIngresso.trim());
          break;
      }
    }
    if (poster && !banner && !initialEvent?.banner && poster.size <= maximumUploadImageBytes) showBannerFile(poster);
    toast.info(addressApplied ? "Sugestões aplicadas. Confirme o endereço no mapa e confira tudo antes de enviar." : "Sugestões aplicadas. Confira tudo antes de enviar.");
  };

  const aiFilled: Record<DraftField, boolean> = {
    nome: Boolean(allValues.nome.trim()),
    descricao: hasUsefulDescription(allValues.descricao),
    category: Boolean(allValues.category),
    datas: Boolean(dateRange),
    startTime: Boolean(allValues.startTime),
    endTime: Boolean(allValues.endTime),
    endereco: Boolean(allValues.endereco.trim()),
    preco: !allValues.isFree || Boolean(initialEvent),
    organizerName: Boolean(allValues.organizerName.trim()),
    ageRating: Boolean(allValues.ageRating.trim()),
    LinkParaCompraIngresso: Boolean(allValues.LinkParaCompraIngresso.trim()),
  };

  const continueAfterTips = (values: EventoFormData, reviewConfirmed: boolean) => {
    tipsRequest.current++;
    setTipsReview(null);
    saveMode.current = "submit";
    onSubmit(values, reviewConfirmed, true);
  };

  /** Asks for tips; with none (or if the AI fails) the submission simply continues. */
  const reviewWithAi = (values: EventoFormData, reviewConfirmed: boolean) => {
    const current = ++tipsRequest.current;
    setTipsReview({ values, reviewConfirmed, loading: true, tips: [], aiUsed: false });
    const payload = new FormData();
    payload.append("nome", values.nome.trim());
    payload.append("descricao", values.descricao.trim());
    payload.append("category", values.category);
    payload.append("dataInicio", dateRange?.start.toString() ?? "");
    payload.append("dataFim", dateRange?.end.toString() ?? "");
    payload.append("endereco", values.endereco.trim());
    payload.append("lat", coordinates ? String(coordinates.lat) : "");
    payload.append("lng", coordinates ? String(coordinates.lng) : "");
    payload.append("isFree", String(values.isFree));
    payload.append("price", values.isFree ? "" : values.price.trim());
    payload.append("ticketsEnabled", String(!values.isFree && values.ticketsEnabled));
    payload.append("LinkParaCompraIngresso", values.LinkParaCompraIngresso.trim());
    if (banner) {
      payload.append("banner", banner);
      if (!uploadMultipartFits(payload)) payload.delete("banner");
    } else if (initialEvent?.banner?.startsWith("/uploads/")) payload.append("bannerUrl", initialEvent.banner);
    const unavailable = () => {
      if (current !== tipsRequest.current) return;
      toast.info("Não foi possível revisar com IA agora. Enviando normalmente.", { toastId: "ai-tips-unavailable" });
      continueAfterTips(values, reviewConfirmed);
    };
    eventTipsAction(payload).then((result) => {
      if (current !== tipsRequest.current) return;
      if (!result.ok) { unavailable(); return; }
      if (result.data.tips.length === 0) { continueAfterTips(values, reviewConfirmed); return; }
      setTipsReview({ values, reviewConfirmed, loading: false, tips: result.data.tips, aiUsed: result.data.aiUsed });
    }).catch(unavailable);
  };

  const onSubmit = (values: EventoFormData, reviewConfirmed = false, tipsReviewed = false) => {
    const draft = saveMode.current === "draft";
    const timeError = timeErrorFor(values.startTime, values.endTime);
    if (timeError) {
      form.setError("endTime", { type: "validate", message: timeError }, { shouldFocus: true });
      return;
    }
    if (!draft && addressNeedsPick) {
      form.setError("endereco", { type: "validate", message: "Selecione uma sugestão da lista para confirmar o local, ou use “Não encontrou? Digite o endereço”." }, { shouldFocus: true });
      return;
    }
    if (!draft && (!dateRange?.start || !dateRange.end || dateRange.start.compare(dateRange.end) > 0)) {
      setDateError("Escolha uma data de início e uma data de fim válidas.");
      return;
    }
    if (!initialEvent && recurrence !== "none") {
      if (!dateRange?.start || !dateRange.end || dateRange.start.compare(dateRange.end) > 0) {
        setDateError("Escolha as datas do primeiro evento para criar a série.");
        return;
      }
      if (!Number.isInteger(repeatEvery) || repeatEvery < 1 || repeatEvery > 4 || !Number.isInteger(occurrences) || occurrences < 2 || occurrences > 52) {
        toast.error("Escolha entre 2 e 52 edições e um intervalo de 1 a 4.");
        return;
      }
      const totalMonths = recurrence === "MONTHLY" ? repeatEvery * (occurrences - 1) : 0;
      const totalDays = recurrence === "WEEKLY" ? repeatEvery * 7 * (occurrences - 1) : 0;
      if (totalMonths > 12 || totalDays > 365) {
        toast.error("A série deve terminar dentro de um ano. Reduza o intervalo ou o número de edições.");
        return;
      }
    }
    if (!draft && !banner && !initialEvent?.banner) {
      toast.error("Adicione o banner principal antes de enviar.");
      bannerInputRef.current?.focus();
      return;
    }
    if (!data?.id) {
      toast.error("Entre na sua conta para criar um evento.");
      return;
    }
    if (!draft && !tipsReviewed) {
      reviewWithAi(values, reviewConfirmed);
      return;
    }
    // OPP-01: warn before a sensitive edit takes a published event offline for review.
    if (!draft && !reviewConfirmed && publishedReviewReasons(initialEvent, values, dateRange, coordinates, !!banner).length > 0) {
      setReviewPrompt(values);
      return;
    }

    startTransition(async () => {
      try {
        const payload = new FormData();
        payload.append("nome", values.nome.trim());
        payload.append("descricao", values.descricao.trim());
        payload.append("organizerName", values.organizerName.trim());
        payload.append("ageRating", values.ageRating.trim());
        payload.append("accessibilityInfo", values.accessibilityInfo.trim());
        payload.append("participationInfo", values.participationInfo.trim());
        payload.append("dataInicio", dateRange?.start.toString() ?? "");
        payload.append("dataFim", dateRange?.end.toString() ?? "");
        payload.append("LinkParaCompraIngresso", values.LinkParaCompraIngresso.trim());
        payload.append("endereco", values.endereco.trim());
        payload.append("category", values.category);
        payload.append("isFree", String(values.isFree));
        payload.append("priceCents", String(priceCentsOf(values)));
        payload.append("capacity", values.capacity.trim());
        payload.append("ticketsEnabled", String(!values.isFree && values.ticketsEnabled));
        payload.append("ticketCapacity", !values.isFree && values.ticketsEnabled ? values.ticketCapacity.trim() : "");
        // Recovered drafts saved before this field existed have no value: treat as the default (on).
        if (approvalLoaded || approvalTouched.current) payload.append("requiresApproval", String(values.requiresApproval !== false));
        payload.append("startTime", values.startTime);
        payload.append("endTime", values.endTime);
        if (storedEndOnlyTime && values.endTime === storedEndOnlyTime) payload.append("keepStoredEndOnlyTime", storedEndOnlyTime);
        if (coordinates) {
          payload.append("lat", String(coordinates.lat));
          payload.append("lng", String(coordinates.lng));
        }
        if (banner) payload.append("banner", banner);
        galleryFiles.forEach((file) => payload.append("carrossel", file));

        if (!uploadMultipartFits(payload)) {
          toast.error(uploadMultipartLimitMessage);
          return;
        }

        const result = initialEvent
          ? await atualizarEvento(initialEvent.id, payload, !draft)
          : draft ? await salvarRascunho(payload, data.id) : await salvarEvento(payload, data.id);
        if (!result.success) {
          toast.error(result.message || "Não foi possível salvar o evento. Tente novamente.");
          return;
        }
        unsaved.markSaved();
        draftRecovery.clearSaved();
        if (!initialEvent && recurrence !== "none") {
          if (!result.evento?.id) {
            toast.error("O evento foi salvo, mas não foi possível criar a série. Consulte Meus eventos.");
            router.push("/myEvents");
            return;
          }
          const series = await criarSerieRecorrente(result.evento.id, {
            frequency: recurrence,
            interval: repeatEvery,
            count: occurrences,
          });
          if (!series.success) {
            toast.error(`O primeiro evento foi salvo, mas as repetições não foram criadas: ${series.message}`);
            router.push("/myEvents");
            return;
          }
          toast.success(`${occurrences} eventos ${draft ? "salvos como rascunho" : "enviados"}.`);
        } else if (!draft && result.triage?.applied === "published" && result.evento?.id) {
          // Automatic triage published it: show the public page right away.
          toast.success(result.message || "Evento publicado!");
          socket.emit("create-event");
          router.push(`/eventos/${encodeURIComponent(result.evento.id)}`);
          return;
        } else if (!draft && result.triage?.applied === "changes" && result.evento?.id) {
          // Sent back for correction: the edit page shows the review note on top of the form.
          toast.warning(result.message || "O evento precisa de ajustes antes de publicar.", { autoClose: 10000 });
          router.push(`/eventos/${encodeURIComponent(result.evento.id)}/editar`);
          router.refresh();
          return;
        } else if (isPublishedEdit) {
          // The server decides whether the event stayed online; its message says which.
          toast.success(result.message || "Alterações salvas.");
        } else {
          toast.success(draft ? "Rascunho salvo com sucesso!" : result.message || "Evento enviado para revisão.");
        }
        socket.emit("create-event");
        router.push("/myEvents");
      } catch {
        toast.error("Não foi possível salvar o evento. Tente novamente.");
      }
    });
  };

  const handleDraft = () => {
    saveMode.current = "draft";
    onSubmit(form.getValues());
  };

  return (
    <FormProvider {...form}>
      {unsaved.dialog}
      <Dialog open={reviewPrompt !== null} onOpenChange={(open) => { if (!open) setReviewPrompt(null); }}>
        <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-6 leading-snug"><AlertTriangle aria-hidden="true" className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />Enviar para nova revisão?</DialogTitle>
            <DialogDescription>Isso enviará o evento para nova revisão e ele sairá do ar até a aprovação.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>Alterações que exigem revisão: <strong>{reviewPrompt ? publishedReviewReasons(initialEvent, reviewPrompt, dateRange, coordinates, !!banner).join(", ") : ""}</strong>.</p>
            <p className="text-muted-foreground">Inscritos e pessoas que salvaram o evento serão avisados. Para manter o evento no ar, desfaça essas alterações e salve apenas descrição, imagens ou informações práticas.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setReviewPrompt(null)}>Voltar e revisar</Button>
            <Button type="button" variant="cta" disabled={isPending} onClick={() => { const values = reviewPrompt; setReviewPrompt(null); if (values) { saveMode.current = "submit"; onSubmit(values, true, true); } }}>Salvar e enviar para revisão</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <EventAiTipsDialog open={tipsReview !== null} loading={tipsReview?.loading ?? false} tips={tipsReview?.tips ?? []} aiUsed={tipsReview?.aiUsed ?? false} sending={isPending} onAdjust={() => { tipsRequest.current++; setTipsReview(null); }} onSendAnyway={() => { if (tipsReview) continueAfterTips(tipsReview.values, tipsReview.reviewConfirmed); }} />
      <form onSubmit={form.handleSubmit((values) => { saveMode.current = "submit"; onSubmit(values); })} className={`grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] ${className ?? ""}`} {...props}>
        <div className="min-w-0 space-y-6">
          {draftRecovery.recovery && <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5" aria-label="Recuperar rascunho local"><h2 className="font-semibold">Você tem um rascunho neste navegador</h2><p className="mt-2 text-sm text-muted-foreground">Salvo em {new Date(draftRecovery.recovery.savedAt).toLocaleString("pt-BR")}. As imagens precisam ser selecionadas novamente. {draftRecovery.conflict ? "O evento foi atualizado desde este rascunho: recuperar substituirá os campos atuais. Confira antes de salvar." : "Recupere suas alterações ou descarte para continuar."}</p><div className="mt-4 flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={restoreDraft} disabled={fingerprint !== initialFingerprint.current || isPending}>Recuperar rascunho</Button><Button type="button" variant="ghost" onClick={draftRecovery.discard}>Descartar rascunho</Button></div>{fingerprint !== initialFingerprint.current && <p className="mt-2 text-xs text-muted-foreground">Você já editou o formulário. O rascunho anterior não substituirá essas alterações.</p>}</section>}
          {initialEvent?.status === "CHANGES_REQUESTED" && initialEvent.reviewNote && <section role="alert" aria-labelledby="event-review-note-title" className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5"><h2 id="event-review-note-title" className="flex items-center gap-2 font-semibold"><AlertTriangle aria-hidden="true" className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />Ajustes necessários antes de publicar</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground">{initialEvent.reviewNote}</p><p className="mt-2 text-xs text-muted-foreground">Corrija os pontos acima e envie o evento novamente.</p></section>}
          {draftRecovery.message && <p role="status" className="text-xs text-muted-foreground">{draftRecovery.message} · Alterações ainda não enviadas. Expira após 7 dias.</p>}
          <EventAiDraftDialog filled={aiFilled} hasBanner={Boolean(banner || initialEvent?.banner)} categories={eventCategories} disabled={isPending} onApply={applyAiDraft} />
          <section className={sectionClass} aria-labelledby="event-details-title">
            <SectionHeading number="01" title="Apresente o evento" description="Ajude as pessoas a entender o que vai acontecer e por que participar." id="event-details-title" />
            <div className="space-y-5">
              <FormField name="nome" rules={{ required: "Informe o nome do evento.", validate: (value) => value.trim().length >= 3 || "Use pelo menos 3 caracteres no nome." }} render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do evento <Required /></FormLabel>
                  <FormControl><Input placeholder="Ex.: Festival de música no parque" maxLength={100} {...field} /></FormControl>
                  <FormDescription>Use um nome curto e reconhecível. Evite escrever tudo em maiúsculas.</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField name="descricao" rules={{ required: "Descreva o evento.", validate: (value) => hasUsefulDescription(value) || "Preencha o roteiro com pelo menos 10 caracteres sobre o evento." }} render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição <Required /></FormLabel>
                  <FormControl><Textarea placeholder="Conte o que o público vai encontrar, para quem é o evento e informações importantes de acesso." className="min-h-32 resize-y" maxLength={3000} {...field} /></FormControl>
                  <FormDescription>Inclua atrações, programação e orientações de entrada. {field.value.length}/3000 caracteres.</FormDescription>
                  {!field.value.trim() && <button type="button" className="inline-flex min-h-11 items-center rounded-full text-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => field.onChange(descriptionOutline)}>
                    Usar roteiro para a descrição
                  </button>}
                  <FormMessage />
                </FormItem>
              )} />
              <FormField name="category" rules={{ required: "Escolha uma categoria." }} render={({ field }) => (
                <FormItem><FormLabel>Categoria <Required /></FormLabel><FormControl><select {...field} className="flex h-11 w-full rounded-2xl border border-input bg-card px-3 text-base transition-colors motion-reduce:transition-none hover:border-ring/40 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:text-sm"><option value="">Selecione uma categoria</option>{eventCategories.map((option) => <option key={option} value={option}>{option}</option>)}</select></FormControl><FormMessage /></FormItem>
              )} />
            </div>
          </section>

          <section className={sectionClass} aria-labelledby="event-when-title">
            <SectionHeading number="02" title="Quando e onde" description="Essas informações ajudam o público a planejar a visita e localizar o evento." id="event-when-title" />
            <div className="space-y-5">
              <div>
                <DateRangePicker
                  label="Período do evento"
                  isRequired
                  className="w-full max-w-md" classNames={{ inputWrapper: "min-h-14 rounded-xl border border-input bg-background shadow-sm", selectorButton: "min-h-11 min-w-11" }}
                  minValue={today(getLocalTimeZone()) as unknown as React.ComponentProps<typeof DateRangePicker>["minValue"]}
                  value={dateRange as unknown as React.ComponentProps<typeof DateRangePicker>["value"]}
                  onChange={(value) => {
                    setDateRange(value as EventDateRange | null);
                    setDateError("");
                  }}
                />
                <p className="mt-2 text-sm text-muted-foreground">Para um evento de um dia, selecione a mesma data no início e no fim.</p>
                {dateError && <p role="alert" className="mt-2 text-sm text-destructive">{dateError}</p>}
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-[repeat(2,minmax(0,1fr))]">
                <FormField name="startTime" rules={{ validate: (value: string) => !value || !eventTimeError({ startTime: value, endTime: "" }) || "Horário de início inválido. Use o formato HH:mm." }} render={({ field }) => <FormItem className="min-w-0"><div className="flex min-h-6 items-center justify-between gap-2"><FormLabel>Horário de início</FormLabel>{field.value && <ClearTimeButton label="Limpar horário de início" onClear={() => field.onChange("")} />}</div><FormControl><Input type="time" step={60} className={timeInputClass} {...field} onChange={(event) => field.onChange(normalizeEventTime(event.target.value))} /></FormControl><FormMessage /></FormItem>} />
                <FormField name="endTime" rules={{ validate: (value: string) => timeErrorFor(form.getValues("startTime"), value) ?? true }} render={({ field }) => <FormItem className="min-w-0"><div className="flex min-h-6 items-center justify-between gap-2"><FormLabel>Horário de término</FormLabel>{field.value && <ClearTimeButton label="Limpar horário de término" onClear={() => field.onChange("")} />}</div><FormControl><Input type="time" step={60} className={timeInputClass} {...field} onChange={(event) => field.onChange(normalizeEventTime(event.target.value))} /></FormControl><FormMessage /></FormItem>} />
              </div>
              {endValue && !startValue && storedEndOnlyTime === endValue && <p className="text-sm text-muted-foreground">Este evento tem apenas horário de término. Você pode mantê-lo ou informar também o início.</p>}
              {!initialEvent && <fieldset className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
                <legend className="px-1 text-sm font-semibold">Repetir este evento</legend>
                <p className="text-sm text-muted-foreground">Crie outras datas com o mesmo local, horário e informações. Cada edição poderá ser revisada separadamente.</p>
                <label htmlFor="event-recurrence" className="block text-sm font-medium">Frequência</label>
                <select id="event-recurrence" value={recurrence} onChange={(event) => setRecurrence(event.target.value as typeof recurrence)} className="h-11 w-full rounded-2xl border border-input bg-card px-3 text-base transition-colors motion-reduce:transition-none hover:border-ring/40 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:text-sm">
                  <option value="none">Não repetir</option>
                  <option value="WEEKLY">Toda semana</option>
                  <option value="MONTHLY">Todo mês</option>
                </select>
                {recurrence !== "none" && <div className="grid gap-4 sm:grid-cols-2">
                  <label htmlFor="event-repeat-every" className="grid gap-2 text-sm font-medium">Repetir a cada
                    <select id="event-repeat-every" value={repeatEvery} onChange={(event) => setRepeatEvery(Number(event.target.value))} className="h-11 w-full rounded-2xl border border-input bg-card px-3 text-base transition-colors motion-reduce:transition-none hover:border-ring/40 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:text-sm">
                      {[1, 2, 3, 4].map((interval) => <option key={interval} value={interval}>{interval} {recurrence === "WEEKLY" ? interval === 1 ? "semana" : "semanas" : interval === 1 ? "mês" : "meses"}</option>)}
                    </select>
                  </label>
                  <label htmlFor="event-occurrences" className="grid gap-2 text-sm font-medium">Número de edições
                    <input id="event-occurrences" type="number" min={2} max={52} step={1} value={occurrences} onChange={(event) => setOccurrences(Number(event.target.value))} className="h-11 w-full rounded-2xl border border-input bg-card px-3 text-base transition-colors motion-reduce:transition-none hover:border-ring/40 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:text-sm" />
                  </label>
                  <p className="text-xs leading-5 text-muted-foreground sm:col-span-2">Inclui o primeiro evento. Até 52 edições dentro de um ano.</p>
                </div>}
              </fieldset>}
              <GoogleMapsPreference compact />
              <FormField name="endereco" rules={{ required: "Informe o endereço do evento.", validate: (value) => value.trim().length >= 3 || "Use pelo menos 3 caracteres no endereço." }} render={({ field }) => (
                <FormItem>
                  <FormLabel>Endereço <Required /></FormLabel>
                    <div className="min-w-0 space-y-2">
                      <FormControl>
                        {mapsLoaded && addressMode === "search" ? (
                          <PlaceSearchCombobox
                            inputRef={field.ref}
                            value={field.value}
                            placeholder="Busque o endereço ou nome do local"
                            ariaLabel="Buscar endereço do evento"
                            onBlur={field.onBlur}
                            onTextChange={(text) => { field.onChange(text); setCoordinates(null); setAddressNeedsPick(text.trim().length > 0); }}
                            onPlaceSelect={({ address, lat, lng }) => { field.onChange(address); setCoordinates({ lat, lng }); setAddressNeedsPick(false); form.clearErrors("endereco"); }}
                            onUseManual={() => { setAddressMode("manual"); setAddressNeedsPick(false); form.clearErrors("endereco"); }}
                          />
                        ) : (
                          <Input aria-label="Endereço do evento" placeholder="Rua, número, bairro, cidade e estado" {...field} onChange={(event) => { field.onChange(event); setCoordinates(null); }} />
                        )}
                      </FormControl>
                      {mapsLoaded && (
                        <button type="button" className="inline-flex min-h-11 items-center rounded-full text-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { setAddressMode(addressMode === "search" ? "manual" : "search"); setAddressNeedsPick(false); form.clearErrors("endereco"); }}>
                          {addressMode === "search" ? "Não encontrou? Digite o endereço" : "Buscar endereço no mapa"}
                        </button>
                      )}
                    </div>
                  {addressNeedsPick && mapsLoaded && addressMode === "search"
                    ? <p role="status" className="flex items-start gap-1.5 text-sm text-amber-800 dark:text-amber-300"><AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />Selecione uma sugestão para confirmar o local no mapa.</p>
                    : field.value && <p className="flex min-w-0 items-start gap-1.5 break-words text-sm text-brand"><MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /><span className="min-w-0">{field.value}{coordinates ? " · local confirmado no mapa" : ""}</span></p>}
                  <FormDescription>Confira número e cidade. Você também pode digitar o endereço se a busca não estiver disponível.</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          </section>

          <section className={sectionClass} aria-labelledby="event-practical-title">
            <h2 id="event-practical-title" className="text-xl font-semibold tracking-tight">Antes de participar</h2>
            <p className="mt-1 text-sm text-muted-foreground">Informações opcionais para o público planejar a visita. Preencha apenas o que foi confirmado pela organização.</p>
            <div className="mt-6 space-y-5">
              <FormField name="organizerName" rules={{ maxLength: { value: 160, message: "Use até 160 caracteres." } }} render={({ field }) => (
                <FormItem><FormLabel>Organização responsável <span className="font-normal text-muted-foreground">(opcional)</span></FormLabel><FormControl><Input maxLength={160} placeholder="Nome oficial de quem realiza o evento" {...field} /></FormControl><FormDescription>Informe somente a organização confirmada. Este dado é diferente da conta que publica no EventMap.</FormDescription><FormMessage /></FormItem>
              )} />
              <FormField name="ageRating" rules={{ maxLength: { value: 80, message: "Use até 80 caracteres." } }} render={({ field }) => (
                <FormItem><FormLabel>Classificação etária</FormLabel><FormControl><Input placeholder="Ex.: Livre ou 18 anos" maxLength={80} {...field} /></FormControl><FormDescription>Informe restrições de idade e, se aplicável, a necessidade de acompanhante.</FormDescription><FormMessage /></FormItem>
              )} />
              <FormField name="accessibilityInfo" rules={{ maxLength: { value: 2000, message: "Use até 2000 caracteres." } }} render={({ field }) => (
                <FormItem><FormLabel>Recursos de acessibilidade</FormLabel><FormControl><Textarea placeholder="Descreva os recursos disponíveis e como solicitar apoio." maxLength={2000} className="min-h-24 resize-y" {...field} /></FormControl><FormDescription>Detalhe recursos confirmados, limitações do espaço e contato para dúvidas. Evite prometer acessibilidade sem verificar.</FormDescription><FormMessage /></FormItem>
              )} />
              <FormField name="participationInfo" rules={{ maxLength: { value: 2000, message: "Use até 2000 caracteres." } }} render={({ field }) => (
                <FormItem><FormLabel>Condições de participação</FormLabel><FormControl><Textarea placeholder="Ex.: documento obrigatório, inscrição prévia ou itens permitidos." maxLength={2000} className="min-h-24 resize-y" {...field} /></FormControl><FormDescription>Explique os requisitos de entrada e orientações que o público precisa conhecer.</FormDescription><FormMessage /></FormItem>
              )} />
            </div>
          </section>

          <section className={sectionClass} aria-labelledby="event-tickets-title">
            <SectionHeading number="03" title="Ingresso e imagens" description="Indique para onde o visitante deve ir e escolha uma imagem que represente o evento." id="event-tickets-title" />
            <div className="space-y-6">
              <FormField name="capacity" rules={{ validate: (value) => !value.trim() || (/^[1-9]\d*$/.test(value.trim()) && Number(value) <= 1000000) || "Informe uma capacidade inteira positiva de até 1 milhão." }} render={({ field }) => <FormItem><FormLabel>Vagas para confirmação <span className="font-normal text-muted-foreground">(opcional)</span></FormLabel><FormControl><Input type="number" min={1} max={1000000} step={1} inputMode="numeric" placeholder="Sem limite" {...field} /></FormControl><FormDescription>Ao preencher todas as vagas, novas pessoas entram na lista de espera. Deixe vazio para aceitar confirmações sem limite.</FormDescription><FormMessage /></FormItem>} />
              <FormField name="requiresApproval" render={({ field }) => <FormItem>
                <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-muted/30 p-4">
                  <div className="min-w-0">
                    <label htmlFor="event-approval" className="cursor-pointer text-sm font-medium">Aprovar inscrições manualmente</label>
                    <p id="event-approval-help" className="mt-1 text-sm leading-6 text-muted-foreground">{importedEvent ? "Eventos importados mantêm a inscrição direta, sem aprovação." : "Cada pessoa pede para participar e você aprova ou recusa. Em eventos pagos, a compra só é liberada depois da aprovação."}</p>
                    {!importedEvent && !approvalLoaded && <p className="mt-1 text-xs text-muted-foreground">A configuração atual deste evento será mantida, a menos que você a altere aqui.</p>}
                  </div>
                  <Switch id="event-approval" checked={!importedEvent && field.value !== false} disabled={importedEvent} aria-describedby="event-approval-help" onCheckedChange={(checked) => { approvalTouched.current = true; field.onChange(checked); }} className="mt-0.5" />
                </div>
              </FormItem>} />
              <FormField name="isFree" render={({ field }) => <FormItem><div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-4"><input id="event-free" type="checkbox" checked={field.value} onChange={(event) => field.onChange(event.target.checked)} className="h-5 w-5 accent-primary" /><label htmlFor="event-free" className="cursor-pointer text-sm font-medium">Evento gratuito</label></div><FormDescription>Desmarque para informar o preço inicial do ingresso.</FormDescription></FormItem>} />
              {!isFree && <FormField name="price" rules={{ required: "Informe o preço do ingresso.", validate: (value) => !(Number.isFinite(Number(value.replace(",", "."))) && Number(value.replace(",", ".")) >= 0) ? "Informe um preço válido." : form.getValues("ticketsEnabled") && !isValidTicketPrice(Math.round(Number(value.replace(",", ".")) * 100)) ? `Para vender pelo EventMap, use um preço entre ${formatTicketAmount(TICKET_MIN_CENTS)} e ${formatTicketAmount(TICKET_MAX_CENTS)}.` : true }} render={({ field }) => <FormItem><FormLabel>Preço inicial (R$) <Required /></FormLabel><FormControl><Input inputMode="decimal" placeholder="Ex.: 25,00" {...field} /></FormControl><FormMessage /></FormItem>} />}
              {!isFree && <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
                <FormField name="ticketsEnabled" render={({ field }) => <FormItem>
                  <div className="flex items-start gap-3">
                    <input id="event-tickets" type="checkbox" checked={field.value} disabled={!field.value && !canSellTickets} aria-describedby="event-tickets-help" onChange={(event) => { field.onChange(event.target.checked); void form.trigger(["price", "LinkParaCompraIngresso"]); }} className="mt-0.5 h-5 w-5 shrink-0 accent-primary disabled:cursor-not-allowed disabled:opacity-50" />
                    <div className="min-w-0">
                      <label htmlFor="event-tickets" className="cursor-pointer text-sm font-medium">Vender ingressos pelo EventMap</label>
                      <p id="event-tickets-help" className="mt-1 text-sm text-muted-foreground">Pix com confirmação automática. O valor vai direto para a sua conta do Mercado Pago e o ingresso vira o QR Code de entrada.</p>
                    </div>
                  </div>
                </FormItem>} />
                <MercadoPagoConnectCard connection={mercadoPago} />
                {ticketsOn && <>
                  <p role="status" className="rounded-lg bg-background px-3 py-2 text-sm">{isValidTicketPrice(ticketPriceCents) ? <>Você recebe <strong className="tabular-nums">{formatTicketAmount(ticketNetCents(ticketPriceCents))}</strong> por ingresso (taxa de {TICKET_FEE_PERCENT}% do EventMap). O Mercado Pago também desconta a tarifa do Pix.</> : `Preço entre ${formatTicketAmount(TICKET_MIN_CENTS)} e ${formatTicketAmount(TICKET_MAX_CENTS)} para vender pelo EventMap.`}</p>
                  <FormField name="ticketCapacity" rules={{ validate: (value) => !value.trim() || (/^[1-9]\d*$/.test(value.trim()) && Number(value) <= 1000000) || "Informe uma lotação inteira positiva de até 1 milhão." }} render={({ field }) => <FormItem><FormLabel>Ingressos à venda <span className="font-normal text-muted-foreground">(opcional)</span></FormLabel><FormControl><Input type="number" min={1} max={1000000} step={1} inputMode="numeric" placeholder="Sem limite" {...field} /></FormControl><FormDescription>Pix aguardando pagamento reservam a vaga por até 30 minutos. Deixe vazio para vender sem limite.</FormDescription><FormMessage /></FormItem>} />
                </>}
              </div>}
              <FormField name="LinkParaCompraIngresso" rules={{ required: ticketsOn ? false : "Informe o link de ingressos.", pattern: { value: /^https?:\/\/[^\s]+\.[^\s]+$/i, message: "Use um link completo e válido começando com https://." } }} render={({ field }) => (
                <FormItem>
                  <FormLabel>Link de ingressos {ticketsOn ? <span className="font-normal text-muted-foreground">(opcional)</span> : <Required />}</FormLabel>
                  <FormControl><Input type="url" inputMode="url" placeholder="https://exemplo.com/ingressos" {...field} /></FormControl>
                  <FormDescription>{ticketsOn ? "Com a venda pelo EventMap, o link externo não aparece para o público. Pode deixar vazio." : "Use a página oficial de compra ou inscrição, mesmo para eventos gratuitos."}</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <div>
                <label htmlFor="event-banner" className="mb-2 block text-sm font-medium">Banner principal <Required /></label>
                <Input id="event-banner" ref={bannerInputRef} type="file" accept="image/*" aria-describedby="event-banner-help" onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (file.size > maximumUploadImageBytes) {
                    event.currentTarget.value = "";
                    toast.error("Escolha um banner de até 4 MB.");
                    return;
                  }
                  if (bannerUrlRef.current) URL.revokeObjectURL(bannerUrlRef.current);
                  const url = URL.createObjectURL(file);
                  bannerUrlRef.current = url;
                  setBannerUrl(url);
                  setBanner(file);
                }} />
                <p id="event-banner-help" className="mt-2 text-sm text-muted-foreground">Escolha uma imagem horizontal e nítida de até 4 MB.</p>
                {(bannerUrl || initialEvent?.banner) && <div className="relative mt-3 overflow-hidden rounded-xl border border-border"><img src={bannerUrl || initialEvent?.banner} alt="Prévia do banner selecionado" className="aspect-[16/9] w-full object-cover" />{bannerUrl && <button type="button" onClick={removeBanner} aria-label="Remover banner" className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-background p-2 text-foreground shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="h-4 w-4" /></button>}</div>}
              </div>
              <div>
                <label htmlFor="event-gallery" className="mb-2 block text-sm font-medium">Mais fotos <span className="font-normal text-muted-foreground">(opcional)</span></label>
                <Input id="event-gallery" ref={galleryInputRef} type="file" accept="image/*" multiple aria-describedby="event-gallery-help" onChange={(event) => {
                  const selected = Array.from(event.target.files ?? []);
                  const files = selected.filter(file => file.size <= maximumUploadImageBytes);
                  event.currentTarget.value = "";
                  if (files.length < selected.length) {
                    toast.error("As fotos acima de 4 MB não foram adicionadas.");
                  }
                  if (!files.length) return;
                  const urls = files.map(URL.createObjectURL);
                  galleryUrlsRef.current = [...galleryUrlsRef.current, ...urls];
                  setGalleryUrls([...galleryUrlsRef.current]);
                  setGalleryFiles((previous) => [...previous, ...files]);
                }} />
                <p id="event-gallery-help" className="mt-2 text-sm text-muted-foreground">Adicione fotos do espaço, atrações ou edições anteriores. Até 4 MB por foto, com limite de 4,4 MB para o envio completo.</p>
                {galleryUrls.length > 0 && <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">{galleryUrls.map((url, index) => <div key={url} className="relative overflow-hidden rounded-lg border border-border"><img src={url} alt={`Prévia da foto ${index + 1}`} className="aspect-[4/3] w-full object-cover" /><button type="button" onClick={() => removeGalleryImage(index)} aria-label={`Remover foto ${index + 1}`} className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-background p-2 shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="h-4 w-4" /></button></div>)}</div>}
              </div>
            </div>
          </section>

          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:p-6">
            {isPublishedEdit ? <div className="flex items-start gap-3" aria-live="polite">{reviewReasons.length ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" /> : <Info className="mt-0.5 h-5 w-5 shrink-0 text-brand" />}<div className="space-y-1 text-sm text-foreground">{reviewReasons.length ? <><p className="font-semibold">Estas alterações exigem nova revisão: {reviewReasons.join(", ")}.</p><p className="text-muted-foreground">Ao salvar, o evento sairá do ar até a aprovação. Inscritos e quem salvou o evento serão avisados.</p></> : <><p className="font-semibold">O evento continua no ar.</p><p className="text-muted-foreground">Descrição, imagens, categoria, informações práticas e aumento de vagas são publicados na hora. Nome, data, horário, local, link de ingressos, preço e redução de vagas passam por nova revisão.</p></>}</div></div> : <div className="flex items-start gap-3"><Info className="mt-0.5 h-5 w-5 shrink-0 text-brand" /><div className="space-y-1 text-sm text-foreground"><p className="font-semibold">Ao enviar, o evento passa por uma triagem automática.</p><p className="text-muted-foreground">Se estiver tudo certo, ele é publicado na hora. Se faltar algo, você recebe o que ajustar. Alguns eventos, como o primeiro de cada organizador, são conferidos pela equipe antes de aparecer no mapa.</p></div></div>}
            <div className="mt-5 flex flex-wrap gap-3">{initialEvent?.status !== "PUBLISHED" && <Button type="button" variant="outline" disabled={isPending} onClick={handleDraft}>{isPending ? "Salvando..." : "Salvar rascunho"}</Button>}<Button type="submit" variant="cta" onClick={() => { saveMode.current = "submit"; }} disabled={isPending} className="w-full sm:w-auto sm:min-w-52">{isPending ? (isPublishedEdit ? "Salvando alterações..." : "Enviando evento...") : isPublishedEdit ? (reviewReasons.length ? "Salvar e enviar para revisão" : "Publicar alterações") : "Enviar evento"}</Button></div>
          </div>
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start" aria-label="Ajuda para criar evento">
          <div className="rounded-[22px] border border-border bg-card p-5 shadow-[var(--em-shadow-card)]">
            <div className="flex items-center gap-2 text-brand"><Sparkles className="h-5 w-5" /><h2 className="font-semibold">Seu evento, passo a passo</h2></div>
            <p className="mt-2 text-sm text-muted-foreground">Acompanhe o que falta para enviar.</p>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={completeCount} aria-valuemin={0} aria-valuemax={3} aria-label="Etapas preenchidas"><div className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${(completeCount / 3) * 100}%` }} /></div>
            <p className="mt-2 text-xs text-muted-foreground">{completeCount} de 3 etapas preenchidas</p>
            <ul className="mt-5 space-y-3">{checklist.map((item) => <li key={item.label} className="flex items-center gap-3 text-sm"><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${item.ready ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{item.ready ? <Check className="h-4 w-4" /> : <span className="h-2 w-2 rounded-full bg-current" />}</span>{item.label}</li>)}</ul>
          </div>
          <div className="mt-4 rounded-2xl border border-accent bg-accent/40 p-5"><div className="flex items-center gap-2 font-semibold text-accent-foreground"><ImagePlus className="h-5 w-5" /> Dica de divulgação</div><p className="mt-2 text-sm text-foreground">Um título claro, uma descrição objetiva e um banner legível ajudam o público a reconhecer seu evento.</p></div>
          {(nome.trim() || endereco.trim() || bannerUrl) && <div className="mt-4 overflow-hidden rounded-[22px] border border-border bg-card shadow-[var(--em-shadow-card)]" aria-label="Prévia das informações do evento">
            {bannerUrl && <img src={bannerUrl} alt="" className="aspect-[16/9] w-full object-cover" />}
            <div className="p-4"><p className="em-eyebrow">Prévia do evento</p><h3 className="mt-2 break-words font-semibold">{nome.trim() || "Nome do evento"}</h3><p className="mt-1 break-words text-sm text-muted-foreground">{endereco.trim() || "O endereço aparecerá aqui"}</p></div>
          </div>}
        </aside>
      </form>
    </FormProvider>
  );
}

const timeInputClass = "block w-full min-w-0 max-w-full appearance-none text-left text-base leading-6 tabular-nums md:text-base [&::-webkit-date-and-time-value]:min-h-6 [&::-webkit-date-and-time-value]:text-left [&::-webkit-datetime-edit]:p-0";

function ClearTimeButton({ label, onClear }: { label: string; onClear: () => void }) {
  return <button type="button" aria-label={label} onClick={onClear} className="-my-2.5 inline-flex min-h-11 items-center rounded-full px-2 text-xs font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Limpar</button>;
}

function Required() { return <span aria-label="obrigatório" className="text-destructive">*</span>; }

function SectionHeading({ number, title, description, id }: { number: string; title: string; description: string; id: string }) {
  return <div className="mb-6 flex items-start gap-3"><span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-brand">{number}</span><div><h2 id={id} className="text-xl font-semibold tracking-tight">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div></div>;
}
