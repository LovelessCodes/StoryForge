import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Installation } from "@/stores/installations";
import { InstallationRow, type InstallationRowProps } from "./installation.row";

export type SortableInstallationRowProps = Omit<
	InstallationRowProps,
	"setNodeRef" | "attributes" | "listeners" | "isDragging" | "style"
> & {
	installation: Installation;
};

export function SortableInstallationRow(props: SortableInstallationRowProps) {
	const { installation } = props;
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: installation.id });
	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};
	return (
		<InstallationRow
			{...props}
			attributes={attributes}
			isDragging={isDragging}
			listeners={listeners}
			setNodeRef={setNodeRef}
			style={style}
		/>
	);
}
