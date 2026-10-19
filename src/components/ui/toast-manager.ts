import { Toast as ToastPrimitive } from "@base-ui/react/toast";

/**
 * App-wide toast manager. Kept separate from the toast components so the
 * component module stays Fast Refresh-safe; `toast.tsx` and every `notify`
 * caller share this one instance.
 */
export const toast = ToastPrimitive.createToastManager();

export const createToastManager = ToastPrimitive.createToastManager;
export const useToastManager = ToastPrimitive.useToastManager;

type ToastAddOptions = Parameters<typeof toast.add>[0];

/**
 * Upserting toast: calls sharing a `key` update one toast in place and refresh
 * its auto-dismiss timer instead of stacking a duplicate. Use it for repeatable
 * actions (launch, sync, save, queue, per-profile mutations) so repeats stay a
 * single toast.
 */
export function notify(key: string, options: Omit<ToastAddOptions, "id">) {
  return toast.add({ ...options, id: key });
}
