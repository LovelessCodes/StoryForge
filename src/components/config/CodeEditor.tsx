import { Suspense, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { MonacoEditor } from "@/components/common/MonacoEditor";
import { Button } from "@/components/ui/button";
import { scalePixels } from "@/lib/text-scale";
import type { JSONValue } from "@/lib/types";
import { useSettingsStore } from "@/stores/settings";

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
  const textScale = useSettingsStore((s) => s.textScale);
  const [editableCode, setEditableCode] = useState(() => JSON.stringify(code, null, 2));
  const savedCode = useMemo(() => JSON.stringify(code, null, 2), [code]);
  const canSave = editableCode !== savedCode;
  const isDark = document.documentElement.classList.contains("dark");

  return (
    <div className="relative h-full">
      <Suspense
        fallback={<p className="text-muted-foreground p-4 text-xs">{t("config.code.loading")}</p>}
      >
        <MonacoEditor
          height="100%"
          language="json"
          onChange={(value) => setEditableCode(value ?? "")}
          options={{
            fontSize: Math.round(scalePixels(13, textScale)),
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
