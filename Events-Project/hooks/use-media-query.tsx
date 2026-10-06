import { useState, useEffect } from "react";

/**
 * Hook personalizado para detectar media queries.
 * @param query - String da media query (ex: "(min-width: 768px)").
 * @returns `true` se a media query corresponder, `false` caso contrário.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return window.matchMedia(query).matches;
    }
    return false;
  });

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query);

    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    mediaQueryList.addEventListener("change", handleChange);

    // Set inicial e cleanup
    setMatches(mediaQueryList.matches);
    return () => mediaQueryList.removeEventListener("change", handleChange);
  }, [query]);

  return matches;
}
