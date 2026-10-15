/**
 * Path-keyed per-profile records: mod pins, presets and groups live in the
 * settings store under the profile's folder path. Renaming a profile moves the
 * folder, so the records have to move with it — otherwise the rename silently
 * drops them and a later profile reusing the folder inherits them.
 */

/**
 * Moves one path-keyed record to a new key.
 *
 * A rename target cannot exist as a profile, so any record already under
 * `newPath` belongs to an abandoned folder and is replaced by the live
 * profile's data.
 */
export function relocateRecord<T>(
  record: Record<string, T>,
  oldPath: string,
  newPath: string,
): Record<string, T> {
  if (oldPath === newPath || !(oldPath in record)) return record;
  const { [oldPath]: entry, ...rest } = record;
  return { ...rest, [newPath]: entry };
}
