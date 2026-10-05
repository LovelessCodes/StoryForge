import { ChevronDownIcon, ChevronRightIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "@/components/ui/number-field";
import { Switch } from "@/components/ui/switch";
import type { JSONArray, JSONValue } from "@/lib/types";

import { deepSet, getAtPath, isObject, pathKey, safeInitialParse } from "./json-utils";

type SaveParams = { file: string; newCode: string };

/**
 * Recursive live JSON editor with debounced auto-save. Ported from the legacy
 * LiveBlock: edits are tracked locally and only marked dirty by user input, so
 * a query refetch cannot schedule a save with stale content.
 */
export default function LiveEditor({
  code,
  file,
  onSave,
}: {
  code: JSONValue;
  file: string;
  onSave: (params: SaveParams) => void;
}) {
  const { t } = useTranslation();
  const [parseError, setParseError] = useState<string | null>(null);
  const [data, setData] = useState<JSONValue>(() => safeInitialParse(code, setParseError));
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);
  const onSaveRef = useRef(onSave);

  // Keep the callback ref current without writing it during render.
  useEffect(() => {
    onSaveRef.current = onSave;
  });

  // Debounced auto-save of user edits.
  useEffect(() => {
    if (!dirty || parseError) return; // don't save invalid JSON
    const id = setTimeout(() => {
      onSaveRef.current({ file, newCode: JSON.stringify(data, null, 2) });
      setDirty(false);
    }, 600);
    return () => clearTimeout(id);
  }, [data, dirty, file, parseError]);

  /** State updater for user edits; marks the block as dirty. */
  function updateData(updater: (prev: JSONValue) => JSONValue) {
    setData(updater);
    setDirty(true);
  }

  function updateAtPath(path: (string | number)[], next: JSONValue) {
    updateData((prev) => deepSet(prev, path, next));
  }

  function handlePrimitiveChange(path: (string | number)[], raw: string, original: JSONValue) {
    let value: JSONValue = raw;
    if (typeof original === "number") {
      const num = Number(raw);
      value = Number.isNaN(num) ? 0 : num;
    } else if (typeof original === "boolean") {
      value = raw === "true";
    } else if (original === null) {
      // Keep as string unless the user types special tokens.
      if (raw === "null") value = null;
      else if (raw === "true") value = true;
      else if (raw === "false") value = false;
      else if (!Number.isNaN(Number(raw))) value = Number(raw);
    }
    updateAtPath(path, value);
  }

  /**
   * React key of an array row. The editor addresses items by path index and
   * never reorders them, so the position is the row's identity; the values are
   * rendered from state, so reusing a row's DOM after a removal is safe.
   */
  function arrayItemKey(path: (string | number)[], index: number): string {
    return `${pathKey(path)}:${index}`;
  }

  function addArrayItem(path: (string | number)[]) {
    updateData((prev) => {
      const arr = getAtPath(prev, path);
      if (!Array.isArray(arr)) return prev;
      const nextArr = [...arr, ""] as JSONArray;
      return deepSet(prev, path, nextArr);
    });
  }

  function removeArrayItem(path: (string | number)[], index: number) {
    updateData((prev) => {
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
        <div className="grid gap-2" key={kKey}>
          <div className="flex items-center gap-2">
            <Button
              aria-expanded={!isCol}
              aria-label={isCol ? t("config.live.expandArray") : t("config.live.collapseArray")}
              onClick={() => toggleCollapse(path)}
              size="icon-xs"
              variant="outline"
            >
              {isCol ? <ChevronRightIcon /> : <ChevronDownIcon />}
            </Button>
            <span className="truncate font-mono text-xs">{keyLabel}</span>
            <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
              [array]
            </span>
            <Button
              className="ml-auto"
              onClick={() => addArrayItem(path)}
              size="xs"
              variant="outline"
            >
              <PlusIcon /> {t("common.actions.add")}
            </Button>
          </div>
          {!isCol && (
            <div className="ml-3 grid gap-2 border-l pl-3">
              {value.map((item, idx) => (
                <div className="flex items-start gap-2" key={arrayItemKey(path, idx)}>
                  <div className="min-w-0 flex-1">{renderValue(item, [...path, idx], idx)}</div>
                  <Button
                    aria-label={t("config.live.removeItem", { index: idx })}
                    onClick={() => removeArrayItem(path, idx)}
                    size="icon-xs"
                    variant="destructive"
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              ))}
              {value.length === 0 && (
                <p className="text-muted-foreground text-[11px]">{t("config.live.emptyArray")}</p>
              )}
            </div>
          )}
        </div>
      );
    }

    if (isObject(value)) {
      const isCol = collapsed[kKey];
      return (
        <div className="grid gap-2" key={kKey}>
          <div className="flex items-center gap-2">
            <Button
              aria-expanded={!isCol}
              aria-label={isCol ? t("config.live.expandObject") : t("config.live.collapseObject")}
              onClick={() => toggleCollapse(path)}
              size="icon-xs"
              variant="outline"
            >
              {isCol ? <ChevronRightIcon /> : <ChevronDownIcon />}
            </Button>
            <span className="truncate font-mono text-xs">{keyLabel}</span>
            <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
              {"{ }"}
            </span>
          </div>
          {!isCol && (
            <div className="ml-3 grid gap-2 border-l pl-3">
              {Object.entries(value).map(([k, v]) => renderValue(v, [...path, k], k))}
            </div>
          )}
        </div>
      );
    }

    if (typeof value === "boolean") {
      return (
        <div className="flex items-center gap-3" key={kKey}>
          <label
            className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-xs"
            htmlFor={`bool-${kKey}`}
          >
            {keyLabel}
          </label>
          <Switch
            checked={value}
            id={`bool-${kKey}`}
            onCheckedChange={(checked) => updateAtPath(path, checked)}
          />
        </div>
      );
    }

    if (typeof value === "number") {
      return (
        <div className="flex items-center gap-3" key={kKey}>
          <label
            className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-xs"
            htmlFor={`num-${kKey}`}
          >
            {keyLabel}
          </label>
          <NumberField
            className="w-40 shrink-0"
            id={`num-${kKey}`}
            onValueChange={(next) => handlePrimitiveChange(path, next?.toString() ?? "0", value)}
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
          className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-xs"
          htmlFor={`str-${kKey}`}
        >
          {keyLabel}
        </label>
        <Input
          className="h-7 w-40 shrink-0 font-mono text-xs"
          id={`str-${kKey}`}
          onChange={(event) => handlePrimitiveChange(path, event.target.value, value)}
          value={value === null ? "null" : value}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-4 p-4">
      {parseError && (
        <div className="border-destructive/40 bg-destructive/10 text-destructive border p-2 text-[11px]">
          Parse error: {parseError}
        </div>
      )}

      <p className="text-muted-foreground text-[10px] font-medium tracking-widest uppercase">
        Live editor · {file}
      </p>

      {isObject(data) ? (
        <form className="grid gap-3" onSubmit={(event) => event.preventDefault()}>
          {Object.entries(data).map(([k, v]) => renderValue(v, [k], k))}
        </form>
      ) : Array.isArray(data) ? (
        <div className="grid gap-2">{data.map((v, i) => renderValue(v, [i], i))}</div>
      ) : (
        <p className="text-muted-foreground text-xs">{t("config.live.primitiveRoot")}</p>
      )}

      <p className="text-muted-foreground text-right text-[11px]">{t("config.live.autoSaved")}</p>
    </div>
  );
}
