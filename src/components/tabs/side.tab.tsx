import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";

export default function SideToggleGroup({
  side,
  onSideChange,
  hideInstalled,
}: {
  side: string;
  onSideChange: (value: string) => void;
  hideInstalled?: boolean;
}) {
  return (
    <Tabs onValueChange={onSideChange} value={side}>
      <TabsList className="border-input h-9 border shadow-xs/5 outline-none">
        <TabsTab aria-label="Any" value="any">
          Any
        </TabsTab>
        <TabsTab aria-label="Client" value="client">
          Client
        </TabsTab>
        <TabsTab aria-label="Server" value="server">
          Server
        </TabsTab>
        <TabsTab aria-label="Both" value="both">
          Both
        </TabsTab>
        {!hideInstalled && (
          <TabsTab aria-label="Installed" value="installed">
            Installed
          </TabsTab>
        )}
        <span className="text-muted-foreground bg-background pointer-events-none absolute start-1 top-0 z-10 block inline-flex -translate-y-1/2 px-2 text-xs">
          Side
        </span>
      </TabsList>
    </Tabs>
  );
}
