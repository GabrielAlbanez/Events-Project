export const roles = { ADMIN: "ADMIN", BASIC: "BASIC", PROMOTER: "PROMOTER", GUEST: "GUEST" } as const;
export const roleRoutes: Record<string, string[]> = {
 ADMIN: ["/admin", "/Profile", "/perfil-conexoes", "/", "/CriarEvento", "/myEvents", "/resultados", "/salvos", "/notificacoes"],
 BASIC: ["/Profile", "/perfil-conexoes", "/", "/salvos", "/notificacoes"],
 PROMOTER: ["/Profile", "/perfil-conexoes", "/", "/CriarEvento", "/myEvents", "/resultados", "/salvos", "/notificacoes"],
 GUEST: ["/", "/login", "/register"],
};
export const publicRoutes = ["/", "/EventsCreated", "/demonstracao", "/privacidade", "/privacidade/solicitacoes"];
