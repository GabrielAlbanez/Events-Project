"use client";

import { useEffect } from "react";
import { toast, type TypeOptions } from "react-toastify";

/**
 * Shows a toast whenever a feedback message produced elsewhere (a hook or server action) becomes non-empty.
 * The toastId is keyed by type and text, so re-renders and React strict mode never stack duplicates.
 */
export function useToastMessage(message: string | null | undefined, type: TypeOptions = "info") {
  useEffect(() => {
    if (!message) return;
    toast(message, { type, toastId: `${type}:${message}` });
  }, [message, type]);
}
