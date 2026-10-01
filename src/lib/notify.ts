import { notify, toast as toastManager } from "@/components/ui/toast";

/**
 * Sonner-compatible toast facade backed by the app's Base UI toast manager.
 *
 * Repeatable actions pass an `id`; calls sharing an id upsert a single toast
 * (Base UI bumps `updateKey`, which replays the pulse animation).
 */
type ToastAction = { label: string; onClick: () => void };

type ToastOptions = {
  id?: string;
  description?: string;
  duration?: number;
  action?: ToastAction;
  /** Extra sonner options are accepted and ignored. */
  [key: string]: unknown;
};

type ToastKind = "success" | "error" | "info" | "warning" | "loading";

function show(kind: ToastKind, message: string, options?: ToastOptions) {
  const id = typeof options?.id === "string" ? options.id : `${kind}-${message}`;
  const duration = options?.duration;
  return notify(id, {
    type: kind,
    title: message,
    description: (options?.description as string | undefined) ?? undefined,
    timeout:
      kind === "loading"
        ? 0
        : typeof duration === "number" && Number.isFinite(duration)
          ? duration
          : 4000,
    actionProps: options?.action
      ? { children: options.action.label, onClick: options.action.onClick }
      : undefined,
  });
}

export const toast = {
  success: (message: string, options?: ToastOptions) => show("success", message, options),
  error: (message: string, options?: ToastOptions) => show("error", message, options),
  info: (message: string, options?: ToastOptions) => show("info", message, options),
  warning: (message: string, options?: ToastOptions) => show("warning", message, options),
  loading: (message: string, options?: ToastOptions) => show("loading", message, options),
  dismiss: (id?: string) => {
    if (id) toastManager.close(id);
  },
};
