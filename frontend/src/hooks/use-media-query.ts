import { useEffect, useState } from "react";

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const on = () => setMatches(mql.matches);
    on();
    mql.addEventListener("change", on);
    return () => mql.removeEventListener("change", on);
  }, [query]);
  return matches;
}

/** "phone" < 640px, "tablet" 640–1023px, "desktop" ≥ 1024px */
export function useBreakpoint(): "phone" | "tablet" | "desktop" {
  const sm = useMediaQuery("(min-width: 640px)");
  const lg = useMediaQuery("(min-width: 1024px)");
  return lg ? "desktop" : sm ? "tablet" : "phone";
}
