import type { Evento } from "@/types";

type Props = Pick<Evento, "organizerName" | "ageRating" | "accessibilityInfo" | "participationInfo">;

export function EventParticipationDetails({ organizerName, ageRating, accessibilityInfo, participationInfo }: Props) {
  const details = [
    { label: "Organização responsável", value: organizerName },
    { label: "Classificação etária", value: ageRating },
    { label: "Recursos de acessibilidade", value: accessibilityInfo },
    { label: "Condições de participação", value: participationInfo },
  ];
  return <section aria-labelledby="event-participation-details" className="space-y-4 rounded-2xl bg-muted/30 p-5">
    <h2 id="event-participation-details" className="text-xl font-semibold">Antes de participar</h2>
    <p className="text-sm leading-6 text-muted-foreground">Confira as informações fornecidas por quem publicou o evento. Em caso de dúvida, confirme as condições com a organização antes de ir.</p>
    <dl className="grid gap-5 sm:grid-cols-2">
      {details.map(({ label, value }) => <div key={label} className="min-w-0"><dt className="text-sm font-semibold">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{value?.trim() || "Não informado por quem publicou o evento."}</dd></div>)}
    </dl>
  </section>;
}
