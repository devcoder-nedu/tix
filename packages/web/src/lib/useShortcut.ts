import { useEffect, useRef } from "react";

/** True when focus is somewhere the user types, so single-key shortcuts must not fire. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/** Run `handler` when `key` is pressed on its own (no Cmd/Ctrl/Alt), outside text fields. */
export function useShortcut(key: string, handler: () => void) {
  // Keep the latest handler without re-adding the listener on every render.
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== key || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      e.preventDefault(); // stop "/" or "c" from also being typed somewhere
      handlerRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [key]);
}
