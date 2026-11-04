const assert = require("node:assert/strict");
const load = require("./ai-events-test-loader.cjs")();
const { canonicalSourceUrl, isPublicSourceAddress, parseOfficialEvent, parsePublicEvent, publicCatalogUrl, createAiEventProvider } = load("lib/aiEvents/provider.ts");
const now = new Date("2030-01-01T00:00:00Z"), url = "https://www.sympla.com.br/evento/teste/123";
const fixture = () => ({"@type":"MusicEvent",name:"Concerto de teste",url,startDate:"2030-02-02T19:30:00-03:00",endDate:"2030-02-02T22:00:00-03:00",location:{name:"Teatro",address:{streetAddress:"Rua Exemplo, 100",addressLocality:"São Paulo",addressRegion:"SP",addressCountry:"BR"}},offers:{price:"25.50",priceCurrency:"BRL"}});
const parse = node => parseOfficialEvent(JSON.stringify(node),url,"São Paulo",now);
async function run() {
  for (const bad of ["http://sympla.com.br/x","https://sympla.com.br.evil.test/x","https://user:pass@sympla.com.br/x","https://localhost/x","https://sympla.com.br:444/x","https://sympla.com.br\\@evil.test/x"]) assert.throws(()=>canonicalSourceUrl(bad));
  assert.equal(canonicalSourceUrl(url+"?utm_source=tracking#fragment"),url);
  for (const ip of ["127.0.0.1","10.0.0.1","169.254.169.254","172.16.2.3","192.168.1.1","100.64.0.1","::1","::ffff:127.0.0.1","fc00::1","fe80::1"]) assert.equal(isPublicSourceAddress(ip),false,ip);
  assert.equal(isPublicSourceAddress("8.8.8.8"),true);
  const valid = parse(fixture()); assert.equal(valid.event.priceCents,2550); assert.equal(valid.event.startTime,"19:30"); assert.equal(valid.event.timezone,"America/Sao_Paulo"); assert.equal(valid.event.banner,"/branding/eventmap-event-placeholder.svg");
  for (const mutation of [n=>delete n.endDate,n=>n.startDate="2030-02-30T19:30:00-03:00",n=>n.startDate="2020-01-01T00:00:00Z",n=>n.endDate=n.startDate,n=>n.eventStatus="https://schema.org/EventCancelled",n=>n.location.address.addressLocality="Campinas",n=>n.startDate="2030-02-02",n=>n.location.address.addressCountry="US"]) { const n=fixture(); mutation(n); assert.throws(()=>parse(n)); }
  const changed=fixture(); changed.name="Outro concerto"; assert.notEqual(parse(changed).sourceHash,valid.sourceHash);
  const event = {
    id: 123, newUrl: url, name: "Concerto de teste", published: true,
    paymentEventType: "paid", detail: "<p>Ingresso: <b>R$115</b></p>",
    startDateMultiFormat: { ISO8601: fixture().startDate },
    endDateMultiFormat: { ISO8601: fixture().endDate },
    eventsAddress: { address: "Rua Exemplo", addressNum: "100", city: "São Paulo", state: "SP" },
  };
  const html = () => '<script id="__NEXT_DATA__" type="application/json">' +
    JSON.stringify({ props: { pageProps: { hydrationData: { eventHydration: { event } } } } }) + '</script>';
  assert.equal(parsePublicEvent(html(), url, "São Paulo", now).event.priceCents, 11500);
  event.detail = "Ingresso: R$ 1.250,50";
  assert.equal(parsePublicEvent(html(), url, "São Paulo", now).event.priceCents, 125050);
  event.detail += " Entrada: R$ 70";
  assert.throws(() => parsePublicEvent(html(), url, "São Paulo", now), /preço/);
  event.detail = "Estacionamento: R$ 50";
  assert.throws(() => parsePublicEvent(html(), url, "São Paulo", now), /preço/);
  event.paymentEventType = "unpaid";
  assert.equal(parsePublicEvent(html(), url, "São Paulo", now).event.isFree, true);
  const catalog = publicCatalogUrl("São Paulo");
  const provider = createAiEventProvider({
    now: () => now,
    readSource: async source => ({
      url: source,
      body: source === catalog ? '<a href="' + url + '?utm_source=test">Evento</a>' : html(),
    }),
  });
  assert.equal(provider.aiConfigured(), true);
  assert.deepEqual(await provider.discoverEventSources("São Paulo", 3), [url]);
  console.log("PASS public event catalog, explicit ticket price, ambiguous price rejection and free admission.");
}
run().catch(error=>{console.error(error);process.exitCode=1;});
