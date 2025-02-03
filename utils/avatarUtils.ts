export const defaultAvatarFemale = "https://cdnb.artstation.com/p/assets/images/images/042/809/195/large/mace-tan-mace-kayle-fanart-finaledit.jpg?1635490851";
export const defaultAvatarMale = "https://pbs.twimg.com/media/Dtv9ICMWsAE-tz9.jpg";

export const determineDefaultAvatar = (username?: string | null): string => {
  if (!username || username.length === 0) {
    return defaultAvatarMale; // Retorna um avatar padrão caso o username seja inválido
  }

  const lastChar = username[username.length - 1].toLowerCase();
  const isFemale = ["a", "e", "i", "y"].includes(lastChar);

  return isFemale ? defaultAvatarFemale : defaultAvatarMale;
};
