import { AnimatePresence } from "motion/react";
import { WorldItem } from "@/components/items/world.item";
import type { World } from "@/lib/types";
import { itemVariants } from "@/lib/utils";
import { MotionWorldContextMenu } from "../context-menus/world.context-menu";

export function WorldList({ worlds }: { worlds: World[] }) {
	return (
		<div className="flex flex-col w-full bg-card p-2 rounded shadow border relative overflow-y-auto">
			<AnimatePresence>
				{worlds
					.sort((a, b) => {
						const aLastPlayed = a.data.last_played
							? new Date(a.data.last_played).getTime()
							: 0;
						const bLastPlayed = b.data.last_played
							? new Date(b.data.last_played).getTime()
							: 0;
						return bLastPlayed - aLastPlayed;
					})
					.map((world, index) => (
						<MotionWorldContextMenu
							animate="show"
							className="not-last:border-b p-2 flex gap-2 w-full"
							custom={index}
							exit="exit"
							initial="hidden"
							key={world.data.world_name + world.installation_name}
							layout="position"
							variants={itemVariants}
							world={world}
						>
							<WorldItem
								key={world.data.world_name + world.installation_name}
								world={world}
							/>
						</MotionWorldContextMenu>
					))}
				{worlds.length === 0 && (
					<p className="p-4 text-sm text-muted-foreground select-none">
						No worlds found yet. Create a world in-game to get started.
					</p>
				)}
			</AnimatePresence>
		</div>
	);
}
