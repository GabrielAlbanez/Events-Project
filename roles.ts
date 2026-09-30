export const roles = { ADMIN: "ADMIN", BASIC: "BASIC", PROMOTER: "PROMOTER", GUEST: "GUEST" } as const;
export const roleRoutes: Record<string, string[]> = {
 ADMIN: ["/admin", "/Profile", "/", "/CriarEvento", "/myEvents", "/resultados", "/salvos", "/notificacoes"],
 BASIC: ["/Profile", "/", "/salvos", "/notificacoes"],
 PROMOTER: ["/Profile", "/", "/CriarEvento", "/myEvents", "/resultados", "/salvos", "/notificacoes"],
 GUEST: ["/", "/login", "/register"],
};
export const publicRoutes = ["/", "/EventsCreated"];
