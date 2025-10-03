import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "motion/react";
import type { Installation } from "@/stores/installations";
import { InstallationRow, type InstallationRowProps } from "./installation.row";

export type SortableInstallationRowProps = Omit<
	InstallationRowProps,
	"setNodeRef" | "attributes" | "listeners" | "isDragging" | "style"
> & {
	installation: Installation;
	/** zero-based index in the current visible list (used for staggered entrance) */
	index?: number;
};

const itemVariants = {
	exit: { opacity: 0, transition: { duration: 0.15 }, y: -4 },
	hidden: { opacity: 0, y: 8 },
	show: (i: number) => ({
		opacity: 1,
		transition: {
			damping: 32,
			delay: i * 0.05, // 50ms incremental stagger based on current index
			stiffness: 420,
			type: "spring" as const,
		},
		y: 0,
	}),
};

export function SortableInstallationRow(props: SortableInstallationRowProps) {
	const { installation, index = 0 } = props;
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: installation.id });

	// Merge DnD transform with motion animations (motion will interpolate style updates).
	const style: React.CSSProperties = {
		cursor: isDragging ? "grabbing" : undefined,
		transform: CSS.Transform.toString(transform),
		transition,
	};

	return (
		<motion.div
			animate="show"
			className="not-last:border-b"
			custom={index}
			exit="exit"
			initial="hidden"
			layout="position"
			ref={setNodeRef}
			style={style}
			variants={itemVariants}
			whileHover={{
				backgroundColor: "hsl(var(--muted))",
				transition: { duration: 0.15 },
			}}
		>
			<InstallationRow
				{...props}
				// These are now handled by the wrapping motion.div so omit passing them down
				attributes={attributes}
				isDragging={isDragging}
				listeners={listeners}
				setNodeRef={undefined}
				style={undefined}
			/>
		</motion.div>
	);
}
