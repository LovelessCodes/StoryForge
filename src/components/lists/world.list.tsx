import { AnimatePresence } from "motion/react";

import { MotionWorldContextMenu } from "@/components/context-menus/world.context-menu";
import { WorldItem } from "@/components/items/world.item";
import type { World } from "@/lib/types";
import { itemVariants } from "@/lib/utils";

export function WorldList({ worlds }: { worlds: World[] }) {
  return (
    <AnimatePresence>
      {worlds
        .sort((a, b) => {
          const aLastPlayed = a.data.last_played ? new Date(a.data.last_played).getTime() : 0;
          const bLastPlayed = b.data.last_played ? new Date(b.data.last_played).getTime() : 0;
          return bLastPlayed - aLastPlayed;
        })
        .map((world, index) => (
          <MotionWorldContextMenu
            animate="show"
            className="flex w-full gap-2 p-2 not-last:border-b"
            custom={index}
            exit="exit"
            initial="hidden"
            key={world.data.world_name + world.installation_name}
            layout="position"
            variants={itemVariants}
            world={world}
          >
            <WorldItem key={world.data.world_name + world.installation_name} world={world} />
          </MotionWorldContextMenu>
        ))}
      {worlds.length === 0 && (
        <p className="text-muted-foreground p-4 text-sm select-none">
          No worlds found yet. Create a world in-game to get started.
        </p>
      )}
    </AnimatePresence>
  );
}
