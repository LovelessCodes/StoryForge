import { MenuGroup, MenuItem } from "@/components/ui/menu";
import { type Installation } from "@/stores/installations";

import { InstallationActions } from "./installation-actions";

export const InstallationMenu = ({ installation }: { installation: Installation }) => {
  return (
    <MenuGroup>
      <InstallationActions installation={installation} item={MenuItem} />
    </MenuGroup>
  );
};
