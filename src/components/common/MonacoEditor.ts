import { lazy } from "react";

import { setupMonaco } from "@/lib/monaco";

/**
 * Code editor, loaded on demand. The bundled Monaco setup runs first so the
 * loader is configured before the editor module mounts.
 */
export const MonacoEditor = lazy(async () => {
  await setupMonaco();
  return import("@monaco-editor/react");
});
