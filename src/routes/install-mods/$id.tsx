import { createFileRoute } from "@tanstack/react-router";

import { InstallModsPage } from "@/components/pages/install-mods";
import { ErrorComponent } from "@/components/ui/error";
import { useInstallationsStore } from "@/stores/installations";

export const Route = createFileRoute("/install-mods/$id")({
  component: InstallModsPage,
  errorComponent: ErrorComponent,
  loader: async ({ params }) => {
    // Find the installation by ID in the store
    const installation = useInstallationsStore
      .getState()
      .installations.find((inst) => inst.id === Number(params.id));
    if (!installation) {
      throw new Error("Installation not found");
    }
    return { installation };
  },
});
