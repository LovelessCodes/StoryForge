import type { ErrorComponentProps } from "@tanstack/react-router";

import { Button } from "./button";

export function ErrorComponent({ error, info, reset }: ErrorComponentProps) {
  return (
    <div>
      <h2>Story Forge Error</h2>
      <pre>{error instanceof Error ? error.message : String(error)}</pre>
      {info && <pre>{info.componentStack}</pre>}
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
