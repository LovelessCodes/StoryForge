import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { lazy, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "@/components/ui/number-field";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { modConfigsQueryKey, useModConfigs } from "@/hooks/use-mod-configs";
import { useInstallations } from "@/stores/installations";

const Editor = lazy(() => import("@monaco-editor/react"));

export function ModConfigsPage() {
  const { id } = useParams({ from: "/mod-configs/$id" });
  const { installations } = useInstallations();
  const [codeEditor, setCodeEditor] = useState<boolean>(false);
  const installation = installations.find((inst) => inst.id === Number(id));
  const { data: modConfigs } = useModConfigs(installation?.id ?? -1, {
    enabled: !!installation,
  });
  const queryClient = useQueryClient();

  const { mutate: save } = useMutation({
    mutationFn: async ({ file, newCode }: { file: string; newCode: string }) => {
      JSON.parse(newCode);
      return await invoke("save_mod_config", {
        file,
        installationId: installation?.id,
        newCode: newCode,
      });
    },
    onError: (error) => {
      toast.error(`Failed to save: ${error}`, { id: "save-mod-config" });
    },
    onMutate: () => {
      toast.loading("Saving...", { id: "save-mod-config" });
    },
    onSuccess: async () => {
      toast.success("Saved!", { id: "save-mod-config" });
      void queryClient.invalidateQueries({
        queryKey: modConfigsQueryKey(installation?.id ?? -1),
      });
    },
  });

  return (
    <div className="grid size-full grid-rows-[min-content_1fr] flex-col">
      <div className="flex items-center gap-4 px-4 py-2">
        <h1 className="flex-1 text-2xl font-bold">Mod Configurations for {installation?.name}</h1>
        <Button
          onClick={() => setCodeEditor((v) => !v)}
          size="sm"
          variant={codeEditor ? "outline" : "secondary"}
        >
          {codeEditor ? "Switch to Live Editor" : "Switch to Code"}
        </Button>
      </div>
      <Tabs
        className="flex h-full w-full overflow-hidden"
        defaultValue={modConfigs?.[0]?.filename ?? ""}
        orientation="vertical"
      >
        <ScrollArea className="h-full max-w-48">
          <TabsList className="w-full">
            {modConfigs?.map((config) => (
              <TabsTrigger key={config.filename} value={config.filename}>
                <p className="truncate">{config.filename}</p>
              </TabsTrigger>
            ))}
          </TabsList>
        </ScrollArea>
        {modConfigs?.map((config) => (
          <TabsContent
            className="relative h-full w-full"
            key={`$${config.filename}-content`}
            value={config.filename}
          >
            {codeEditor ? (
              <CodeBlock code={config.content} file={config.filename} onSave={save} />
            ) : (
              <ScrollArea className="h-full" scrollFade>
                <LiveBlock code={config.content} file={config.filename} onSave={save} />
              </ScrollArea>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

// --- Live JSON Editor ---
type JSONPrimitive = string | number | boolean | null;
type JSONValue = JSONPrimitive | JSONObject | JSONArray;
interface JSONObject {
  [k: string]: JSONValue;
}
interface JSONArray extends Array<JSONValue> {}

function isObject(val: JSONValue): val is JSONObject {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

function pathKey(path: (string | number)[]) {
  return path.join(".");
}

function deepSet(current: JSONValue, path: (string | number)[], next: JSONValue): JSONValue {
  if (path.length === 0) return next;
  const [head, ...rest] = path;
  if (Array.isArray(current)) {
    const clone = [...current];
    const idx = head as number;
    clone[idx] = deepSet(clone[idx], rest, next);
    return clone;
  } else if (isObject(current)) {
    return {
      ...current,
      [head]: deepSet((current as JSONObject)[head as string] as JSONValue, rest, next),
    };
  }
  return current;
}

function getAtPath(current: JSONValue, path: (string | number)[]): JSONValue {
  return path.reduce<JSONValue>((acc, key) => {
    if (Array.isArray(acc)) return acc[key as number];
    if (isObject(acc)) return acc[key as string];
    return acc;
  }, current);
}

export function LiveBlock({
  code,
  file,
  onSave,
}: {
  code: string;
  file: string;
  onSave: (params: { file: string; newCode: string }) => void;
}) {
  const [parseError, setParseError] = useState<string | null>(null);
  const [data, setData] = useState<JSONValue>(() => safeInitialParse(code, setParseError));
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // Debounced auto-save
  useEffect(() => {
    if (parseError) return; // don't save invalid
    if (JSON.stringify(data) === JSON.stringify(safeInitialParse(code, setParseError))) return;
    const id = setTimeout(() => {
      onSaveRef.current({ file, newCode: JSON.stringify(data, null, 2) });
    }, 600);
    return () => clearTimeout(id);
  }, [data, file, parseError, code]);

  function updateAtPath(path: (string | number)[], next: JSONValue) {
    setData((prev) => deepSet(prev, path, next));
  }

  function handlePrimitiveChange(path: (string | number)[], raw: string, original: JSONValue) {
    let value: JSONValue = raw;
    if (typeof original === "number") {
      const num = Number(raw);
      value = Number.isNaN(num) ? 0 : num;
    } else if (typeof original === "boolean") {
      value = raw === "true";
    } else if (original === null) {
      // Keep as string unless user types special tokens
      if (raw === "null") value = null;
      else if (raw === "true") value = true;
      else if (raw === "false") value = false;
      else if (!Number.isNaN(Number(raw))) value = Number(raw);
    }
    updateAtPath(path, value);
  }

  function addArrayItem(path: (string | number)[]) {
    setData((prev) => {
      const arr = getAtPath(prev, path);
      if (!Array.isArray(arr)) return prev;
      const nextArr = [...arr, ""] as JSONArray;
      return deepSet(prev, path, nextArr);
    });
  }

  function removeArrayItem(path: (string | number)[], index: number) {
    setData((prev) => {
      const arr = getAtPath(prev, path);
      if (!Array.isArray(arr)) return prev;
      const nextArr = arr.filter((_, i) => i !== index) as JSONArray;
      return deepSet(prev, path, nextArr);
    });
  }

  function toggleCollapse(path: (string | number)[]) {
    const k = pathKey(path);
    setCollapsed((c) => ({ ...c, [k]: !c[k] }));
  }

  function renderValue(value: JSONValue, path: (string | number)[], keyLabel?: string | number) {
    const kKey = pathKey(path);
    if (Array.isArray(value)) {
      const isCol = collapsed[kKey];
      return (
        <div className="space-y-2" key={kKey}>
          <div className="flex items-center gap-2">
            <Button
              className="h-4 rounded border px-1 text-xs"
              onClick={() => toggleCollapse(path)}
              size="sm"
              variant="outline"
            >
              {isCol ? "+" : "-"}
            </Button>
            <span className="font-mono text-sm">
              {keyLabel} <span className="text-muted-foreground text-xs">[array]</span>
            </span>
            <Button
              className="h-5 text-xs"
              onClick={() => addArrayItem(path)}
              size="sm"
              variant="outline"
            >
              Add
            </Button>
          </div>
          {!isCol && (
            <div className="ml-4 space-y-2 border-l pl-3">
              {value.map((item, idx) => {
                const itemKey = `${kKey}-idx-${idx}`;
                return (
                  <div className="relative flex flex-col gap-1" key={itemKey}>
                    {renderValue(item, [...path, idx], idx)}
                    <Button
                      className="mt-1"
                      onClick={() => removeArrayItem(path, idx)}
                      size="sm"
                      variant="destructive-outline"
                    >
                      Remove
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }
    if (isObject(value)) {
      const isCol = collapsed[kKey];
      return (
        <div className="space-y-2" key={kKey}>
          <div className="flex items-center gap-2">
            <button
              className="rounded border px-1 text-xs"
              onClick={() => toggleCollapse(path)}
              type="button"
            >
              {isCol ? "+" : "-"}
            </button>
            <span className="font-mono text-sm">
              {keyLabel}{" "}
              <span className="text-muted-foreground text-xs">
                {"{"}object{"}"}
              </span>
            </span>
          </div>
          {!isCol && (
            <div className="ml-4 space-y-3 border-l pl-3">
              {Object.entries(value).map(([k, v]) => renderValue(v, [...path, k], k))}
            </div>
          )}
        </div>
      );
    }
    // primitive
    if (typeof value === "boolean") {
      return (
        <div className="flex items-center gap-3" key={kKey}>
          <label
            className="text-muted-foreground w-48 flex-1 font-mono text-xs"
            htmlFor={`bool-${kKey}`}
          >
            {keyLabel}
          </label>
          <Switch
            checked={value}
            id={`bool-${kKey}`}
            onCheckedChange={(val) => updateAtPath(path, val)}
          />
        </div>
      );
    }
    if (typeof value === "number") {
      return (
        <div className="flex items-center gap-3" key={kKey}>
          <label
            className="text-muted-foreground w-48 flex-1 font-mono text-xs"
            htmlFor={`num-${kKey}`}
          >
            {keyLabel}
          </label>
          <NumberField
            className="w-44"
            id={`num-${kKey}`}
            onValueChange={(v) => handlePrimitiveChange(path, v?.toString() ?? "0", value)}
            size="sm"
            value={value}
          >
            <NumberFieldGroup>
              <NumberFieldDecrement />
              <NumberFieldInput />
              <NumberFieldIncrement />
            </NumberFieldGroup>
          </NumberField>
        </div>
      );
    }
    // string or null
    return (
      <div className="flex items-center gap-3" key={kKey}>
        <label
          className="text-muted-foreground w-48 flex-1 font-mono text-xs"
          htmlFor={`str-${kKey}`}
        >
          {keyLabel}
        </label>
        <Input
          className="h-8 w-fit"
          id={`str-${kKey}`}
          onChange={(e) => handlePrimitiveChange(path, e.target.value, value)}
          value={value === null ? "null" : (value as string)}
        />
      </div>
    );
  }

  return (
    <div className="h-full w-full space-y-4 overflow-y-auto p-4">
      {parseError && <div className="text-xs text-red-500">Parse error: {parseError}</div>}
      <div className="text-muted-foreground text-xs">Live Editor • {file}</div>
      {isObject(data) ? (
        <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
          {Object.entries(data).map(([k, v]) => renderValue(v, [k], k))}
          <div className="text-muted-foreground pt-4 text-right text-xs">Auto-saved on change</div>
        </form>
      ) : Array.isArray(data) ? (
        <div className="space-y-2">{data.map((v, i) => renderValue(v, [i], i))}</div>
      ) : (
        <div className="text-xs">Root is a primitive value; editing not supported here.</div>
      )}
    </div>
  );
}

// Heuristic + tolerant initial parse
function safeInitialParse(raw: string, setErr: (s: string | null) => void): JSONValue {
  if (typeof raw !== "string") return raw as unknown as JSONValue;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return {};
  const looksJson =
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"));
  if (!looksJson) {
    // Sometimes backend already parsed and then stringified with Object.toString -> "[object Object]"
    if (trimmed === "[object Object]") {
      setErr(
        'Received a non-serialized object placeholder ("[object Object]"). Ensure the backend sends JSON text.',
      );
      return {};
    }
    // Try to recover common issues (single quotes, trailing commas)
    let attempt = trimmed.replace(/\r?\n/g, "\n").replace(/(['"])\s*,\s*([}\]])/g, "$1$2"); // remove trailing commas after values
    // Replace single quotes with double quotes cautiously (only outside already double quoted)
    if (attempt.includes("':") || attempt.match(/:'[^']+'/)) {
      attempt = attempt.replace(/'([^']*)'/g, '"$1"');
    }
    try {
      return JSON.parse(attempt);
    } catch (e) {
      setErr(
        `Not recognized as JSON (startsWith token: ${trimmed.slice(0, 12)}). ${(e as Error).message}`,
      );
      return {};
    }
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    // Retry with minor sanitation (remove trailing commas)
    const attempt = trimmed.replace(/,\s*([}\]])/g, "$1");
    try {
      return JSON.parse(attempt);
    } catch (e2) {
      setErr((e2 as Error).message);
      return {};
    }
  }
}

export function CodeBlock({
  code,
  file,
  onSave,
}: {
  code: string;
  file: string;
  onSave: (params: { file: string; newCode: string }) => void;
}) {
  const [editableCode, setEditableCode] = useState(() => JSON.stringify(code, null, 2));
  const canSave = useMemo(
    () => editableCode !== JSON.stringify(code, null, 2),
    [editableCode, code],
  );

  return (
    <>
      <Editor
        language="json"
        onChange={(v) => setEditableCode(v ?? "")}
        options={{
          fontSize: 14,
          lineNumbers: "off",
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
        }}
        theme={document.body.classList.contains("dark") ? "vs-dark" : "vs-light"}
        value={editableCode}
      />
      <div className="absolute top-0 right-4 flex justify-start gap-4 text-sm opacity-50">
        {canSave ? "Unsaved changes" : "All changes saved"}
        <Button
          className="h-5 opacity-50 disabled:opacity-15"
          disabled={!canSave}
          onClick={() => onSave({ file, newCode: editableCode })}
          size="sm"
        >
          Save
        </Button>
      </div>
    </>
  );
}
