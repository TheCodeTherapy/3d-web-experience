import { useEffect, useLayoutEffect, useRef } from "react";

type ClickAwayCallback = (event: MouseEvent | TouchEvent) => void;

export function useClickOutside(cb: ClickAwayCallback) {
  const ref = useRef<HTMLDivElement>(null);
  const refCb = useRef<ClickAwayCallback>(cb);

  useLayoutEffect(() => {
    refCb.current = cb;
  });

  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      const element = ref.current;
      if (element && !element.contains(e.target as Node)) {
        refCb.current(e);
      }
    };

    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);

    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, []);

  return ref;
}
