import { createFileRoute } from "@tanstack/react-router";

import { ModBrowser } from "@/components/pages/mods-browser";
import { ErrorComponent } from "@/components/ui/error";
import { useInstallationsStore } from "@/stores/installations";

export const Route = createFileRoute("/installations/$id/mods")({
  component: InstallationModsPage,
  errorComponent: ErrorComponent,
  loader: async ({ params }) => {
    const installation = useInstallationsStore
      .getState()
      .installations.find((inst) => inst.id === Number(params.id));
    if (!installation) {
      throw new Error("Installation not found");
    }
    return { installation };
  },
});

function InstallationModsPage() {
  const { installation } = Route.useLoaderData();
  return <ModBrowser modsDirectory={installation.path} />;
}
