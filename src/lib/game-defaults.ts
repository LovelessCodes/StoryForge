/**
 * Shared game defaults: a sanitized snapshot of one profile's client settings
 * (key bindings + game/video settings) merged into profiles on launch.
 * Account/session keys are only present when the capture explicitly opted in
 * (`includesAccount`); per-profile lists never appear here.
 */
export type GameDefaults = {
  capturedAt?: number;
  sourceProfile?: string;
  /** True when the capture included the account session bundle. */
  includesAccount?: boolean;
  keyMapping?: Record<string, unknown>;
  intSettings?: Record<string, unknown>;
  boolSettings?: Record<string, unknown>;
  floatSettings?: Record<string, unknown>;
  stringSettings?: Record<string, unknown>;
};

const SETTINGS_SECTIONS = [
  "intSettings",
  "boolSettings",
  "floatSettings",
  "stringSettings",
] as const;

/** Counts shown on the settings card. */
export function gameDefaultsCounts(defaults: GameDefaults): {
  keyBindings: number;
  settings: number;
} {
  let settings = 0;
  for (const section of SETTINGS_SECTIONS) {
    settings += Object.keys(defaults[section] ?? {}).length;
  }
  return { keyBindings: Object.keys(defaults.keyMapping ?? {}).length, settings };
}
