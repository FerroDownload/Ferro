import { useEffect, useRef } from "react";

export type ShortcutHandlers = {
  onNewDownload?: () => void;
  onPasteUrl?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onRemove?: () => void;
  onFocusSearch?: () => void;
};

const hasPrimaryModifier = (event: KeyboardEvent) =>
  event.ctrlKey || event.metaKey;

const isEditableShortcutTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
};

export const createShortcutHandler =
  (handlers: ShortcutHandlers) => (event: KeyboardEvent) => {
    if (event.defaultPrevented) {
      return;
    }

    if (isEditableShortcutTarget(event.target)) {
      return;
    }

    const key = event.key.toLowerCase();

    if (hasPrimaryModifier(event) && key === "n") {
      event.preventDefault();
      handlers.onNewDownload?.();
      return;
    }

    if (hasPrimaryModifier(event) && key === "v") {
      event.preventDefault();
      handlers.onPasteUrl?.();
      return;
    }

    if (hasPrimaryModifier(event) && key === "p") {
      event.preventDefault();
      handlers.onPause?.();
      return;
    }

    if (hasPrimaryModifier(event) && key === "r") {
      event.preventDefault();
      handlers.onResume?.();
      return;
    }

    if (hasPrimaryModifier(event) && key === "f") {
      event.preventDefault();
      handlers.onFocusSearch?.();
      return;
    }

    if (key === "delete") {
      event.preventDefault();
      handlers.onRemove?.();
    }
  };

export const registerShortcuts = (handlers: ShortcutHandlers) => {
  const handler = createShortcutHandler(handlers);
  window.addEventListener("keydown", handler);

  return () => window.removeEventListener("keydown", handler);
};

export const useAppShortcuts = (handlers: ShortcutHandlers) => {
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(
    () =>
      registerShortcuts({
        onNewDownload: () => handlersRef.current.onNewDownload?.(),
        onPasteUrl: () => handlersRef.current.onPasteUrl?.(),
        onPause: () => handlersRef.current.onPause?.(),
        onResume: () => handlersRef.current.onResume?.(),
        onRemove: () => handlersRef.current.onRemove?.(),
        onFocusSearch: () => handlersRef.current.onFocusSearch?.(),
      }),
    [],
  );
};
