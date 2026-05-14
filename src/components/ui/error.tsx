import { Button } from "./button";

export function ErrorComponent({
  error,
  info,
  reset,
}: {
  error: Error;
  info?: { componentStack: string };
  reset?: () => void;
}) {
  return (
    <div>
      <h2>Story Forge Error</h2>
      <pre>{error.message}</pre>
      {info && <pre>{info.componentStack}</pre>}
      {reset && <Button onClick={reset}>Try again</Button>}
    </div>
  );
}
