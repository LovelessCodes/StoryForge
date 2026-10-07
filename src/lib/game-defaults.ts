/**
 * Live source profile for the shared game defaults: its current key bindings,
 * game and video settings are applied to every other profile on launch.
 */
export type GameDefaultsPreview = {
  sourceProfile: string;
  keyBindings: number;
  settings: number;
  /** The source opted in and actually carries a session value. */
  includesAccount: boolean;
};
