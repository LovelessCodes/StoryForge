import { lazy, Suspense, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import "@/lib/monaco";
import type { JSONValue } from "@/lib/types";

const Editor = lazy(() => import("@monaco-editor/react"));

type SaveParams = { file: string; newCode: string };

/**
 * Monaco-based raw JSON editor with an explicit save and unsaved indicator.
 * Ported from the legacy CodeBlock.
 */
export default function CodeEditor({
  code,
  file,
  onSave,
}: {
  code: JSONValue;
  file: string;
  onSave: (params: SaveParams) => void;
}) {
  const { t } = useTranslation();
  const [editableCode, setEditableCode] = useState(() => JSON.stringify(code, null, 2));
  const savedCode = useMemo(() => JSON.stringify(code, null, 2), [code]);
  const canSave = editableCode !== savedCode;
  const isDark = document.documentElement.classList.contains("dark");

  return (
    <div className="relative h-full">
      <Suspense
        fallback={<p className="text-muted-foreground p-4 text-xs">{t("config.code.loading")}</p>}
      >
        <Editor
          height="100%"
          language="json"
          onChange={(value) => setEditableCode(value ?? "")}
          options={{
            fontSize: 13,
            lineNumbers: "off",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
          }}
          theme={isDark ? "vs-dark" : "vs-light"}
          value={editableCode}
        />
      </Suspense>

      <div className="bg-background/90 absolute top-2 right-3 z-10 flex items-center gap-3 border px-2 py-1 text-[11px]">
        <span className={canSave ? "text-[var(--color-warning)]" : "text-muted-foreground"}>
          {canSave ? t("config.code.unsaved") : t("config.code.saved")}
        </span>
        <Button
          disabled={!canSave}
          onClick={() => onSave({ file, newCode: editableCode })}
          size="xs"
        >
          {t("common.actions.save")}
        </Button>
      </div>
    </div>
  );
}
