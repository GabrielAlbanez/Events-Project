export const roles = {
    ADMIN: "ADMIN",
    BASIC: "BASIC",
    PROMOTER: "PROMOTER",
    GUEST: "GUEST",
  };
  
  export const roleRoutes = {
    [roles.ADMIN]: ["/admin", "/Profile", "/", "/CriarEvento", "/EditEvent", "/DashBoard", "/myEvents"],
    [roles.BASIC]: ["/Profile", "/"],
    [roles.PROMOTER]: ["/Profile", "/", "/CriarEvento", "/myEvents"],
    [roles.GUEST]: ["/", "/login", "/register"],
  };
  
  export const publicRoutes = ["/", "/EventsCreated"];