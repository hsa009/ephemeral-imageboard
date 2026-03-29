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
    // Don't fire if user is typing in an input/textarea
    const target = e.target as HTMLElement;
    const isInput = target.tagName === "INPUT" || 
                    target.tagName === "TEXTAREA" || 
                    target.isContentEditable;

    if (isInput) {
      // Allow Cmd/Ctrl + Enter for submit even in inputs
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handlers.onSubmit?.();
        return;
      }
      return;
    }

    // Global shortcuts (not in inputs)
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
