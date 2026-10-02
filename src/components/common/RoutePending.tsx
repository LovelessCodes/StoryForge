import { LoaderCircle } from "lucide-react";

export default function RoutePending() {
  return (
    <div className="flex h-full min-h-40 items-center justify-center">
      <LoaderCircle className="text-muted-foreground size-5 animate-spin" />
    </div>
  );
}
