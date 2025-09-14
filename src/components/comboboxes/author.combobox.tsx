import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { clsx } from "clsx";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
	CommandLoading,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";

type AuthorResponse = {
	[key: string]: string;
};

const authorQuery = (search: string) => ({
	keepPreviousData: true,
	queryFn: () => invoke("fetch_authors", { search }) as Promise<AuthorResponse>,
	queryKey: ["authors", search],
	refetchOnWindowFocus: false,
});

export const AuthorCombobox = (
	props: React.InputHTMLAttributes<HTMLInputElement>,
) => {
	const [open, setOpen] = useState(false);
	const [internalValue, setInternalValue] = useState("");
	const [search, setSearch] = useState("");

	const actualValue = props.value || internalValue;

	const handleValueChange = (value: string) => {
		setInternalValue(value);
		props.onChange?.({
			target: { value },
		} as React.ChangeEvent<HTMLInputElement>);
	};

	const { data: authors, isLoading } = useQuery(
		authorQuery(search.toLowerCase()),
	);

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<Button
					aria-expanded={open}
					className="w-[200px] justify-between relative cursor-text"
					role="combobox"
					variant="outline"
				>
					{actualValue ? actualValue : "Select author..."}

					{actualValue ? (
						<Button
							className="absolute right-0 p-4 opacity-50 cursor-pointer hover:opacity-100"
							onClick={() => handleValueChange("")}
							size="xs"
							variant="ghost"
						>
							x
						</Button>
					) : (
						<ChevronsUpDownIcon className="h-4 w-4 shrink-0" />
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[200px] p-0 text-xs">
				<Command>
					<CommandInput onValueChange={setSearch} value={search} />
					<CommandList>
						{authors && !isLoading && Object.entries(authors).length === 0 && (
							<CommandEmpty>No authors found.</CommandEmpty>
						)}
						{isLoading && <CommandLoading>Hang on…</CommandLoading>}
						{authors &&
							Object.entries(authors).map(([key, value]) => (
								<CommandItem
									className={clsx([
										"focus:bg-accent focus:text-accent-foreground w-full justify-between relative py-1.5 pr-8 pl-2",
										actualValue === value && "bg-accent/50",
									])}
									key={key}
									onSelect={(v) =>
										v === actualValue
											? handleValueChange("")
											: handleValueChange(value)
									}
									value={value}
								>
									{value}
									{value === actualValue && (
										<div className="absolute right-2 opacity-50 pointer-events-none size-3.5">
											<CheckIcon className="size-4" />
										</div>
									)}
								</CommandItem>
							))}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
};
