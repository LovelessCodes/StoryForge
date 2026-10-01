import { useNavigate, useSearch } from "@tanstack/react-router";
import { HardDrive, Search, Server } from "lucide-react";
import { useState } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useServerStatusListener } from "@/hooks/queries/server-hosting";

import HostingTab from "./HostingTab";
import MyServersTab from "./MyServersTab";
import PublicServersTab from "./PublicServersTab";

const TABS = [
  { value: "mine", label: "My Servers", icon: Server },
  { value: "public", label: "Public", icon: Search },
  { value: "hosting", label: "Hosting", icon: HardDrive },
] as const;

type ServersTab = (typeof TABS)[number]["value"];

function parseTab(value: unknown): ServersTab | null {
  return value === "mine" || value === "public" || value === "hosting" ? value : null;
}

export default function ServersPage() {
  // Live hosted-server status events. This page owns the listener for the
  // whole hosting area; the detail page mounts the same hook while it is the
  // active route (the two routes never render at the same time).
  useServerStatusListener();

  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const [localTab, setLocalTab] = useState<ServersTab>(() => parseTab(search.tab) ?? "mine");
  // The servers route has no search schema, so `?tab=` is read loosely; when
  // it is present it wins, which also keeps browser back/forward in sync.
  const tab = parseTab(search.tab) ?? localTab;

  function selectTab(next: ServersTab) {
    setLocalTab(next);
    void navigate({
      to: "/servers",
      // The route has no search schema, so keep the existing params loosely.
      search: ((prev: Record<string, unknown>) => ({ ...prev, tab: next })) as never,
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <div className="flex shrink-0 items-center justify-end gap-2">
        <ToggleGroup
          aria-label="Server view"
          onValueChange={(value) => value[0] && selectTab(parseTab(value[0]) ?? "mine")}
          size="sm"
          value={[tab]}
          variant="outline"
        >
          {TABS.map((item) => {
            const Icon = item.icon;
            return (
              <ToggleGroupItem key={item.value} value={item.value}>
                <Icon />
                {item.label}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
      </div>

      <div className="min-h-0 flex-1">
        {tab === "mine" && <MyServersTab />}
        {tab === "public" && <PublicServersTab />}
        {tab === "hosting" && <HostingTab />}
      </div>
    </div>
  );
}
