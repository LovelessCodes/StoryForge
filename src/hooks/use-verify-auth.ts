import { type UseMutationOptions, useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export const useVerifyAuth = (
  props?: UseMutationOptions<
    {
      /** `u8` on the Rust side: 0 = invalid, non-zero = valid. */
      valid: number;
      entitlements: string | null;
      mptoken: string | null;
      hasgameserver: boolean;
      reason: string | null;
    },
    Error,
    { uid: string; sessionkey: string }
  >,
) =>
  useMutation({
    mutationFn: async ({ uid, sessionkey }) => invoke("verify", { sessionkey, uid }),
    ...props,
  });
