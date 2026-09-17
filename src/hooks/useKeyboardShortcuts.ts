"use client";

import { useEffect, useCallback } from "react";

interface ShortcutHandlers {
  onReply?: () => void;
  onViewImages?: () => void;
  onViewThreads?: () => void;
  onCloseModal?: () => void;
  onSubmit?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const isInput = target.tagName === "INPUT" || 
                    target.tagName === "TEXTAREA" || 
                    target.isContentEditable;

    if (isInput) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handlers.onSubmit?.();
        return;
      }
      return;
    }

    switch (e.key.toLowerCase()) {
      case "r":
        e.preventDefault();
        handlers.onReply?.();
        break;
      case "g":
        e.preventDefault();
        handlers.onViewImages?.();
        break;
      case "t":
        e.preventDefault();
        handlers.onViewThreads?.();
        break;
      case "escape":
        e.preventDefault();
        handlers.onCloseModal?.();
        break;
    }
  }, [handlers]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
