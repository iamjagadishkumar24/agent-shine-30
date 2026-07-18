import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    // Modern browsers: addEventListener; older Safari: addListener fallback.
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
    } else if (typeof (mql as MediaQueryList & { addListener?: (l: () => void) => void }).addListener === "function") {
      (mql as MediaQueryList & { addListener: (l: () => void) => void }).addListener(onChange);
    }
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => {
      if (typeof mql.removeEventListener === "function") {
        mql.removeEventListener("change", onChange);
      } else if (
        typeof (mql as MediaQueryList & { removeListener?: (l: () => void) => void }).removeListener === "function"
      ) {
        (mql as MediaQueryList & { removeListener: (l: () => void) => void }).removeListener(onChange);
      }
    };
  }, []);

  return !!isMobile;
}
