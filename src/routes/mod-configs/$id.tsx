import Editor from "@monaco-editor/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { modConfigsQueryKey, useModConfigs } from "@/hooks/use-mod-configs";
import { useInstallations } from "@/stores/installations";

export const Route = createFileRoute("/mod-configs/$id")({
	component: RouteComponent,
});

function RouteComponent() {
	const { id } = Route.useParams();
	const { installations } = useInstallations();
	const [codeEditor, setCodeEditor] = useState<boolean>(false);
	const installation = installations.find((inst) => inst.id === Number(id));
	const { data: modConfigs } = useModConfigs(installation?.id ?? -1, {
		enabled: !!installation,
	});
	const queryClient = useQueryClient();

	const { mutate: save } = useMutation({
		mutationFn: async ({
			file,
			newCode,
		}: {
			file: string;
			newCode: string;
		}) => {
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
			await queryClient.invalidateQueries({
				queryKey: modConfigsQueryKey(installation?.id ?? -1),
			});
		},
	});

	return (
		<div className="w-full h-screen flex flex-col">
			<div className="flex items-center gap-4 px-4 py-2">
				<h1 className="text-2xl font-bold flex-1">
					Mod Configurations for {installation?.name}
				</h1>
				<Button
					onClick={() => setCodeEditor((v) => !v)}
					size="sm"
					variant={codeEditor ? "outline" : "secondary"}
				>
					{codeEditor ? "Switch to Live Editor" : "Switch to Code"}
				</Button>
			</div>
			<Tabs
				className="w-full h-full grid overflow-hidden"
				defaultValue={modConfigs?.[0]?.filename ?? ""}
			>
				<div className="h-full overflow-y-auto">
					<TabsList className="h-fit">
						<Button asChild className="w-fit mb-2 rounded-none w-full">
							<Link to="/installations">&larr; Back to Installations</Link>
						</Button>
						{modConfigs?.map((config) => (
							<TabsTrigger key={config.filename} value={config.filename}>
								{config.filename}
							</TabsTrigger>
						))}
					</TabsList>
				</div>
				{modConfigs?.map((config) => (
					<TabsContent
						className="h-full w-full overflow-hidden relative"
						key={`$${config.filename}-content`}
						value={config.filename}
					>
						{codeEditor ? (
							<CodeBlock
								code={config.content}
								file={config.filename}
								onSave={save}
							/>
						) : (
							<LiveBlock
								code={config.content}
								file={config.filename}
								onSave={save}
							/>
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

function LiveBlock({
	code,
	file,
	onSave,
}: {
	code: string;
	file: string;
	onSave: (params: { file: string; newCode: string }) => void;
}) {
	const [parseError, setParseError] = useState<string | null>(null);
	const [data, setData] = useState<JSONValue>(() =>
		safeInitialParse(code, setParseError),
	);
	const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

	// Debounced auto-save
	useEffect(() => {
		if (parseError) return; // don't save invalid
		if (
			JSON.stringify(data) ===
			JSON.stringify(safeInitialParse(code, setParseError))
		)
			return;
		const id = setTimeout(() => {
			onSave({ file, newCode: JSON.stringify(data, null, 2) });
		}, 600);
		return () => clearTimeout(id);
	}, [data, file, onSave, parseError, code]);

	function pathKey(path: (string | number)[]) {
		return path.join(".");
	}

	function updateAtPath(path: (string | number)[], next: JSONValue) {
		setData((prev) => deepSet(prev, path, next));
	}

	function deepSet(
		current: JSONValue,
		path: (string | number)[],
		next: JSONValue,
	): JSONValue {
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
				[head]: deepSet(
					(current as JSONObject)[head as string] as JSONValue,
					rest,
					next,
				),
			};
		}
		return current; // should not happen for valid paths
	}

	function handlePrimitiveChange(
		path: (string | number)[],
		raw: string,
		original: JSONValue,
	) {
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

	function getAtPath(current: JSONValue, path: (string | number)[]): JSONValue {
		return path.reduce<JSONValue>((acc, key) => {
			if (Array.isArray(acc)) return acc[key as number];
			if (isObject(acc)) return acc[key as string];
			return acc;
		}, current);
	}

	function toggleCollapse(path: (string | number)[]) {
		const k = pathKey(path);
		setCollapsed((c) => ({ ...c, [k]: !c[k] }));
	}

	function renderValue(
		value: JSONValue,
		path: (string | number)[],
		keyLabel?: string | number,
	) {
		const kKey = pathKey(path);
		if (Array.isArray(value)) {
			const isCol = collapsed[kKey];
			return (
				<div className="space-y-2" key={kKey}>
					<div className="flex items-center gap-2">
						<Button
							className="text-xs px-1 h-4 border rounded"
							onClick={() => toggleCollapse(path)}
							size="sm"
							variant="outline"
						>
							{isCol ? "+" : "-"}
						</Button>
						<span className="font-mono text-sm">
							{keyLabel}{" "}
							<span className="text-muted-foreground text-xs">[array]</span>
						</span>
						<Button
							className="text-xs h-5"
							onClick={() => addArrayItem(path)}
							size="sm"
							variant="outline"
						>
							Add
						</Button>
					</div>
					{!isCol && (
						<div className="ml-4 border-l pl-3 space-y-2">
							{value.map((item, idx) => {
								const itemKey = `${kKey}-idx-${idx}`;
								return (
									<div className="flex flex-col gap-1 relative" key={itemKey}>
										{renderValue(item, [...path, idx], idx)}
										<Button
											className="mt-1"
											onClick={() => removeArrayItem(path, idx)}
											size="sm"
											variant="destructive"
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
							className="text-xs px-1 border rounded"
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
						<div className="ml-4 border-l pl-3 space-y-3">
							{Object.entries(value).map(([k, v]) =>
								renderValue(v, [...path, k], k),
							)}
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
						className="w-48 text-xs font-mono text-muted-foreground"
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
						className="w-48 text-xs font-mono text-muted-foreground"
						htmlFor={`num-${kKey}`}
					>
						{keyLabel}
					</label>
					<Input
						className="h-8"
						id={`num-${kKey}`}
						onChange={(e) => handlePrimitiveChange(path, e.target.value, value)}
						type="number"
						value={value}
					/>
				</div>
			);
		}
		// string or null
		return (
			<div className="flex items-center gap-3" key={kKey}>
				<label
					className="w-48 text-xs font-mono text-muted-foreground"
					htmlFor={`str-${kKey}`}
				>
					{keyLabel}
				</label>
				<Input
					className="h-8"
					id={`str-${kKey}`}
					onChange={(e) => handlePrimitiveChange(path, e.target.value, value)}
					value={value === null ? "null" : (value as string)}
				/>
			</div>
		);
	}

	return (
		<div className="h-full w-full overflow-y-auto p-4 space-y-4">
			{parseError && (
				<div className="text-xs text-red-500">Parse error: {parseError}</div>
			)}
			<div className="text-xs text-muted-foreground">Live Editor • {file}</div>
			{isObject(data) ? (
				<form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
					{Object.entries(data).map(([k, v]) => renderValue(v, [k], k))}
					<div className="pt-4 text-right text-xs text-muted-foreground">
						Auto-saved on change
					</div>
				</form>
			) : Array.isArray(data) ? (
				<div className="space-y-2">
					{data.map((v, i) => renderValue(v, [i], i))}
				</div>
			) : (
				<div className="text-xs">
					Root is a primitive value; editing not supported here.
				</div>
			)}
		</div>
	);
}

// Heuristic + tolerant initial parse
function safeInitialParse(
	raw: string,
	setErr: (s: string | null) => void,
): JSONValue {
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
		let attempt = trimmed
			.replace(/\r?\n/g, "\n")
			.replace(/(['"])\s*,\s*([}\]])/g, "$1$2"); // remove trailing commas after values
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

function CodeBlock({
	code,
	file,
	onSave,
}: {
	code: string;
	file: string;
	onSave: (params: { file: string; newCode: string }) => void;
}) {
	const [editableCode, setEditableCode] = useState(
		JSON.stringify(code, null, 2),
	);
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
				theme={
					document.body.classList.contains("dark") ? "vs-dark" : "vs-light"
				}
				value={editableCode}
			/>
			<div className="absolute top-0 flex justify-start gap-4 right-4 text-sm opacity-50">
				{canSave ? "Unsaved changes" : "All changes saved"}
				<Button
					className="disabled:opacity-15 opacity-50 h-5"
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
