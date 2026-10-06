"use client";

import React, { useEffect, useRef, useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "react-toastify";
import { useRouter } from "next/navigation";
import { DateRangePicker } from "@heroui/react";
import { getLocalTimeZone, parseDate, today } from "@internationalized/date";
import { Check, ImagePlus, Info, MapPin, Sparkles, X } from "lucide-react";
import { atualizarEvento, salvarEvento, salvarRascunho } from "@/app/(actions)/eventos/actions";
import { criarSerieRecorrente } from "@/app/(actions)/eventos/recurrence";
import type { Evento } from "@/types";
import { eventCategories } from "@/types/features";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useEventDraftRecovery } from "@/hooks/useEventDraftRecovery";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { useSocket } from "@/context/SocketContext";
import { useGoogleMaps } from "./GoogleMapsLoader";
import { PlaceAutocomplete } from "./PlaceAutocomplete";

type EventoFormData = {
  nome: string;
  descricao: string;
  LinkParaCompraIngresso: string;
  endereco: string;
  category: string;
  price: string;
  capacity: string;
  isFree: boolean;
  startTime: string;
  endTime: string;
};

type EventDate = ReturnType<typeof parseDate>;
type EventDateRange = { start: EventDate; end: EventDate };

const sectionClass = "rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7";
const descriptionOutline = "O que vai acontecer:\n\nPara quem é o evento:\n\nProgramação e atrações:\n\nInformações de entrada:";
const hasUsefulDescription = (value: string) =>
  value.replace(/O que vai acontecer:|Para quem é o evento:|Programação e atrações:|Informações de entrada:/gi, "").trim().length >= 10;

type EventoFormProps = React.ComponentPropsWithoutRef<"form"> & { initialEvent?: Evento };

export function EventoForm({ className, initialEvent, ...props }: EventoFormProps) {
  const socket = useSocket();
  const { isLoaded: mapsLoaded } = useGoogleMaps();
  const form = useForm<EventoFormData>({
    mode: "onChange",
    defaultValues: { nome: initialEvent?.nome ?? "", descricao: initialEvent?.descricao ?? "", LinkParaCompraIngresso: initialEvent?.linkParaCompra ?? "", endereco: initialEvent?.endereco ?? "", category: initialEvent?.category ?? "", price: initialEvent?.priceCents != null ? (initialEvent.priceCents / 100).toFixed(2) : "", capacity: initialEvent?.capacity != null ? String(initialEvent.capacity) : "", isFree: initialEvent?.isFree ?? true, startTime: initialEvent?.startTime ?? "", endTime: initialEvent?.endTime ?? "" },
  });
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
  const saveMode = useRef<"draft" | "submit">("submit");
  const allValues = form.watch();
  const fingerprint = JSON.stringify({ values: allValues, dates: dateRange && [dateRange.start.toString(), dateRange.end.toString()], coordinates, recurrence, repeatEvery, occurrences });
  const initialFingerprint = useRef(fingerprint);
  const unsaved = useUnsavedChanges(fingerprint !== initialFingerprint.current || !!banner || galleryFiles.length > 0);

  const draftRecovery = useEventDraftRecovery(data?.id, initialEvent?.id, fingerprint, initialFingerprint.current, fingerprint !== initialFingerprint.current);
  const restoreDraft = () => {
    const draft = draftRecovery.recover();
    if (!draft) return;
    form.reset(draft.values);
    try { setDateRange(draft.dates ? { start: parseDate(draft.dates[0]), end: parseDate(draft.dates[1]) } : null); } catch { setDateRange(null); }
    setCoordinates(draft.coordinates); setRecurrence(draft.recurrence); setRepeatEvery(draft.repeatEvery); setOccurrences(draft.occurrences); setAddressMode("manual");
    toast.info("Rascunho recuperado. Se necessário, selecione novamente as imagens.");
  };

  const nome = form.watch("nome");
  const descricao = form.watch("descricao");
  const endereco = form.watch("endereco");
  const link = form.watch("LinkParaCompraIngresso");
  const isFree = form.watch("isFree");
  const category = form.watch("category");
  const checklist = [
    { label: "Nome e descrição", ready: nome.trim().length >= 3 && hasUsefulDescription(descricao) },
    { label: "Data e local", ready: Boolean(dateRange?.start && dateRange?.end && endereco.trim().length >= 3) },
    { label: "Ingresso e banner", ready: /^https?:\/\/[^\s]+\.[^\s]+$/i.test(link.trim()) && Boolean(banner || initialEvent?.banner) && Boolean(category) },
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

  const onSubmit = (values: EventoFormData) => {
    const draft = saveMode.current === "draft";
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

    startTransition(async () => {
      try {
        const payload = new FormData();
        payload.append("nome", values.nome.trim());
        payload.append("descricao", values.descricao.trim());
        payload.append("dataInicio", dateRange?.start.toString() ?? "");
        payload.append("dataFim", dateRange?.end.toString() ?? "");
        payload.append("LinkParaCompraIngresso", values.LinkParaCompraIngresso.trim());
        payload.append("endereco", values.endereco.trim());
        payload.append("category", values.category);
        payload.append("isFree", String(values.isFree));
        payload.append("priceCents", values.isFree ? "0" : String(Math.round(Number(values.price.replace(",", ".")) * 100)));
        payload.append("capacity", values.capacity.trim());
        payload.append("startTime", values.startTime);
        payload.append("endTime", values.endTime);
        if (coordinates) {
          payload.append("lat", String(coordinates.lat));
          payload.append("lng", String(coordinates.lng));
        }
        if (banner) payload.append("banner", banner);
        galleryFiles.forEach((file) => payload.append("carrossel", file));

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
          toast.success(`${occurrences} eventos ${draft ? "salvos como rascunho" : "enviados para análise"}.`);
        } else {
          toast.success(draft ? "Rascunho salvo com sucesso!" : "Evento enviado para análise!");
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
      <form onSubmit={form.handleSubmit((values) => { saveMode.current = "submit"; onSubmit(values); })} className={`grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] ${className ?? ""}`} {...props}>
        <div className="min-w-0 space-y-6">
          {draftRecovery.recovery && <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5" aria-label="Recuperar rascunho local"><h2 className="font-semibold">Você tem um rascunho neste navegador</h2><p className="mt-2 text-sm text-muted-foreground">Salvo em {new Date(draftRecovery.recovery.savedAt).toLocaleString("pt-BR")}. As imagens precisam ser selecionadas novamente. {draftRecovery.conflict ? "O evento foi atualizado desde este rascunho: recuperar substituirá os campos atuais. Confira antes de salvar." : "Recupere suas alterações ou descarte para continuar."}</p><div className="mt-4 flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={restoreDraft} disabled={fingerprint !== initialFingerprint.current || isPending}>Recuperar rascunho</Button><Button type="button" variant="ghost" onClick={draftRecovery.discard}>Descartar rascunho</Button></div>{fingerprint !== initialFingerprint.current && <p className="mt-2 text-xs text-muted-foreground">Você já editou o formulário. O rascunho anterior não substituirá essas alterações.</p>}</section>}
          {draftRecovery.message && <p role="status" className="text-xs text-muted-foreground">{draftRecovery.message} · Alterações ainda não enviadas. Expira após 7 dias.</p>}
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
                  {!field.value.trim() && <button type="button" className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => field.onChange(descriptionOutline)}>
                    Usar roteiro para a descrição
                  </button>}
                  <FormMessage />
                </FormItem>
              )} />
              <FormField name="category" rules={{ required: "Escolha uma categoria." }} render={({ field }) => (
                <FormItem><FormLabel>Categoria <Required /></FormLabel><FormControl><select {...field} className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="">Selecione uma categoria</option>{eventCategories.map((option) => <option key={option} value={option}>{option}</option>)}</select></FormControl><FormMessage /></FormItem>
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
                  className="w-full max-w-md"
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
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField name="startTime" render={({ field }) => <FormItem><FormLabel>Horário de início</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>} />
                <FormField name="endTime" render={({ field }) => <FormItem><FormLabel>Horário de término</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>} />
              </div>
              {!initialEvent && <fieldset className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
                <legend className="px-1 text-sm font-semibold">Repetir este evento</legend>
                <p className="text-sm text-muted-foreground">Crie outras datas com o mesmo local, horário e informações. Cada edição poderá ser revisada separadamente.</p>
                <label htmlFor="event-recurrence" className="block text-sm font-medium">Frequência</label>
                <select id="event-recurrence" value={recurrence} onChange={(event) => setRecurrence(event.target.value as typeof recurrence)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <option value="none">Não repetir</option>
                  <option value="WEEKLY">Toda semana</option>
                  <option value="MONTHLY">Todo mês</option>
                </select>
                {recurrence !== "none" && <div className="grid gap-4 sm:grid-cols-2">
                  <label htmlFor="event-repeat-every" className="grid gap-2 text-sm font-medium">Repetir a cada
                    <select id="event-repeat-every" value={repeatEvery} onChange={(event) => setRepeatEvery(Number(event.target.value))} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {[1, 2, 3, 4].map((interval) => <option key={interval} value={interval}>{interval} {recurrence === "WEEKLY" ? interval === 1 ? "semana" : "semanas" : interval === 1 ? "mês" : "meses"}</option>)}
                    </select>
                  </label>
                  <label htmlFor="event-occurrences" className="grid gap-2 text-sm font-medium">Número de edições
                    <input id="event-occurrences" type="number" min={2} max={52} step={1} value={occurrences} onChange={(event) => setOccurrences(Number(event.target.value))} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                  </label>
                  <p className="text-xs leading-5 text-muted-foreground sm:col-span-2">Inclui o primeiro evento. Até 52 edições dentro de um ano.</p>
                </div>}
              </fieldset>}
              <FormField name="endereco" rules={{ required: "Informe o endereço do evento.", validate: (value) => value.trim().length >= 3 || "Use pelo menos 3 caracteres no endereço." }} render={({ field }) => (
                <FormItem>
                  <span className="block text-sm font-medium">Endereço <Required /></span>
                    <div className="space-y-2">
                      {mapsLoaded && addressMode === "search" ? (
                        <PlaceAutocomplete
                          className="w-full overflow-visible rounded-xl border border-input bg-background"
                          placeholder="Busque o endereço ou nome do local"
                          ariaLabel="Buscar endereço do evento"
                          onPlaceSelect={({ address, lat, lng }) => { field.onChange(address); setCoordinates({ lat, lng }); }}
                        />
                      ) : (
                        <Input aria-label="Endereço do evento" placeholder="Rua, número, bairro, cidade e estado" {...field} onChange={(event) => { field.onChange(event); setCoordinates(null); }} />
                      )}
                      {mapsLoaded && (
                        <button type="button" className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setAddressMode(addressMode === "search" ? "manual" : "search")}>
                          {addressMode === "search" ? "Não encontrou? Digite o endereço" : "Buscar endereço no mapa"}
                        </button>
                      )}
                    </div>
                  {field.value && <p className="flex items-center gap-1 text-sm text-primary"><MapPin className="h-4 w-4" /> {field.value}</p>}
                  <FormDescription>Confira número e cidade. Você também pode digitar o endereço se a busca não estiver disponível.</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          </section>

          <section className={sectionClass} aria-labelledby="event-tickets-title">
            <SectionHeading number="03" title="Ingresso e imagens" description="Indique para onde o visitante deve ir e escolha uma imagem que represente o evento." id="event-tickets-title" />
            <div className="space-y-6">
              <FormField name="capacity" rules={{ validate: (value) => !value.trim() || (/^[1-9]\d*$/.test(value.trim()) && Number(value) <= 1000000) || "Informe uma capacidade inteira positiva de até 1 milhão." }} render={({ field }) => <FormItem><FormLabel>Vagas para confirmação <span className="font-normal text-muted-foreground">(opcional)</span></FormLabel><FormControl><Input type="number" min={1} max={1000000} step={1} inputMode="numeric" placeholder="Sem limite" {...field} /></FormControl><FormDescription>Ao preencher todas as vagas, novas pessoas entram na lista de espera. Deixe vazio para aceitar confirmações sem limite.</FormDescription><FormMessage /></FormItem>} />
              <FormField name="isFree" render={({ field }) => <FormItem><div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-4"><input id="event-free" type="checkbox" checked={field.value} onChange={(event) => field.onChange(event.target.checked)} className="h-5 w-5 accent-primary" /><label htmlFor="event-free" className="cursor-pointer text-sm font-medium">Evento gratuito</label></div><FormDescription>Desmarque para informar o preço inicial do ingresso.</FormDescription></FormItem>} />
              {!isFree && <FormField name="price" rules={{ required: "Informe o preço do ingresso.", validate: (value) => Number.isFinite(Number(value.replace(",", "."))) && Number(value.replace(",", ".")) >= 0 || "Informe um preço válido." }} render={({ field }) => <FormItem><FormLabel>Preço inicial (R$) <Required /></FormLabel><FormControl><Input inputMode="decimal" placeholder="Ex.: 25,00" {...field} /></FormControl><FormMessage /></FormItem>} />}
              <FormField name="LinkParaCompraIngresso" rules={{ required: "Informe o link de ingressos.", pattern: { value: /^https?:\/\/[^\s]+\.[^\s]+$/i, message: "Use um link completo e válido começando com https://." } }} render={({ field }) => (
                <FormItem>
                  <FormLabel>Link de ingressos <Required /></FormLabel>
                  <FormControl><Input type="url" inputMode="url" placeholder="https://exemplo.com/ingressos" {...field} /></FormControl>
                  <FormDescription>Use a página oficial de compra ou inscrição, mesmo para eventos gratuitos.</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <div>
                <label htmlFor="event-banner" className="mb-2 block text-sm font-medium">Banner principal <Required /></label>
                <Input id="event-banner" ref={bannerInputRef} type="file" accept="image/*" aria-describedby="event-banner-help" onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (bannerUrlRef.current) URL.revokeObjectURL(bannerUrlRef.current);
                  const url = URL.createObjectURL(file);
                  bannerUrlRef.current = url;
                  setBannerUrl(url);
                  setBanner(file);
                }} />
                <p id="event-banner-help" className="mt-2 text-sm text-muted-foreground">Escolha uma imagem horizontal, nítida e com o assunto principal visível.</p>
                {(bannerUrl || initialEvent?.banner) && <div className="relative mt-3 overflow-hidden rounded-xl border border-border"><img src={bannerUrl || initialEvent?.banner} alt="Prévia do banner selecionado" className="aspect-[16/9] w-full object-cover" />{bannerUrl && <button type="button" onClick={removeBanner} aria-label="Remover banner" className="absolute right-3 top-3 rounded-full bg-background p-2 text-foreground shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="h-4 w-4" /></button>}</div>}
              </div>
              <div>
                <label htmlFor="event-gallery" className="mb-2 block text-sm font-medium">Mais fotos <span className="font-normal text-muted-foreground">(opcional)</span></label>
                <Input id="event-gallery" ref={galleryInputRef} type="file" accept="image/*" multiple aria-describedby="event-gallery-help" onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  const urls = files.map(URL.createObjectURL);
                  galleryUrlsRef.current = [...galleryUrlsRef.current, ...urls];
                  setGalleryUrls([...galleryUrlsRef.current]);
                  setGalleryFiles((previous) => [...previous, ...files]);
                  event.target.value = "";
                }} />
                <p id="event-gallery-help" className="mt-2 text-sm text-muted-foreground">Adicione fotos do espaço, atrações ou edições anteriores.</p>
                {galleryUrls.length > 0 && <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">{galleryUrls.map((url, index) => <div key={url} className="relative overflow-hidden rounded-lg border border-border"><img src={url} alt={`Prévia da foto ${index + 1}`} className="aspect-[4/3] w-full object-cover" /><button type="button" onClick={() => removeGalleryImage(index)} aria-label={`Remover foto ${index + 1}`} className="absolute right-2 top-2 rounded-full bg-background p-1.5 shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="h-4 w-4" /></button></div>)}</div>}
              </div>
            </div>
          </section>

          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:p-6">
            <div className="flex items-start gap-3"><Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><p className="text-sm text-foreground">Após o envio, o evento passa por validação antes de aparecer na busca e no mapa.</p></div>
            <div className="mt-5 flex flex-wrap gap-3">{initialEvent?.status !== "PUBLISHED" && <Button type="button" variant="outline" disabled={isPending} onClick={handleDraft}>{isPending ? "Salvando..." : "Salvar rascunho"}</Button>}<Button type="submit" onClick={() => { saveMode.current = "submit"; }} disabled={isPending} className="w-full sm:w-auto sm:min-w-52">{isPending ? "Enviando evento..." : "Enviar para análise"}</Button></div>
          </div>
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start" aria-label="Ajuda para criar evento">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 text-primary"><Sparkles className="h-5 w-5" /><h2 className="font-semibold">Seu evento, passo a passo</h2></div>
            <p className="mt-2 text-sm text-muted-foreground">Acompanhe o que falta para enviar.</p>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={completeCount} aria-valuemin={0} aria-valuemax={3} aria-label="Etapas preenchidas"><div className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${(completeCount / 3) * 100}%` }} /></div>
            <p className="mt-2 text-xs text-muted-foreground">{completeCount} de 3 etapas preenchidas</p>
            <ul className="mt-5 space-y-3">{checklist.map((item) => <li key={item.label} className="flex items-center gap-3 text-sm"><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${item.ready ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{item.ready ? <Check className="h-4 w-4" /> : <span className="h-2 w-2 rounded-full bg-current" />}</span>{item.label}</li>)}</ul>
          </div>
          <div className="mt-4 rounded-2xl border border-accent bg-accent/40 p-5"><div className="flex items-center gap-2 font-semibold text-accent-foreground"><ImagePlus className="h-5 w-5" /> Dica de divulgação</div><p className="mt-2 text-sm text-foreground">Um título claro, uma descrição objetiva e um banner legível ajudam o público a reconhecer seu evento.</p></div>
          {(nome.trim() || endereco.trim() || bannerUrl) && <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-sm" aria-label="Prévia das informações do evento">
            {bannerUrl && <img src={bannerUrl} alt="" className="aspect-[16/9] w-full object-cover" />}
            <div className="p-4"><p className="text-xs font-semibold uppercase tracking-wide text-primary">Prévia do evento</p><h3 className="mt-2 break-words font-semibold">{nome.trim() || "Nome do evento"}</h3><p className="mt-1 break-words text-sm text-muted-foreground">{endereco.trim() || "O endereço aparecerá aqui"}</p></div>
          </div>}
        </aside>
      </form>
    </FormProvider>
  );
}

function Required() { return <span aria-label="obrigatório" className="text-destructive">*</span>; }

function SectionHeading({ number, title, description, id }: { number: string; title: string; description: string; id: string }) {
  return <div className="mb-6 flex items-start gap-3"><span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">{number}</span><div><h2 id={id} className="text-xl font-semibold tracking-tight">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div></div>;
}
