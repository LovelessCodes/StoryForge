import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { modConfigsQueryKey, useModConfigs } from "@/hooks/use-mod-configs";
import { useInstallations } from "@/stores/installations";

export const Route = createFileRoute("/mod-configs/$id")({
	component: RouteComponent,
});

function RouteComponent() {
	const { id } = Route.useParams();
	const { installations } = useInstallations();
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
				<h1 className="text-2xl font-bold">
					Mod Configurations for {installation?.name}
				</h1>
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
						<CodeBlock
							code={config.content}
							file={config.filename}
							onSave={save}
						/>
					</TabsContent>
				))}
			</Tabs>
		</div>
	);
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
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [editableCode, setEditableCode] = useState(
		JSON.stringify(code, null, 2),
	);
	const canSave = useMemo(
		() => editableCode !== JSON.stringify(code, null, 2),
		[editableCode, code],
	);

	return (
		<>
			<textarea
				className="h-full p-2 bg-zinc-900 w-full caret-white outline-none font-mono leading-5"
				onChange={(e) => setEditableCode(e.target.value)}
				ref={textareaRef}
				rows={editableCode.split("\n").length}
				value={editableCode}
			/>
			<Button
				className="absolute top-4 right-4 disabled:opacity-15 opacity-50"
				disabled={!canSave}
				onClick={() => onSave({ file, newCode: editableCode })}
			>
				Save
			</Button>
		</>
	);
}
