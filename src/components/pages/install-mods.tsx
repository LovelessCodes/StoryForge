import { useLoaderData } from "@tanstack/react-router";

import { ModBrowser } from "@/components/pages/mods-browser";

export type OutputMod = {
  modid: number;
  name: string;
  authors: string[];
  version: string;
  path: string;
};

export function InstallModsPage() {
  const { installation } = useLoaderData({ from: "/install-mods/$id" });

  return <ModBrowser modsDirectory={installation.path} />;
}
