# Translations

The UI ships in seven languages. English (`locales/en/`) is the source of
truth; every other locale mirrors its tree. A missing key falls back to
English automatically, so partial locales are safe.

## Files

```
locales/
  <language>/
    common.json    shared verbs and words (Cancel, Save, Retry…)
    layout.json    sidebar, titlebar, command palette, route fallbacks
    profiles.json  profiles, banners, dialogs, backups  (+ every launcher import)
    mods.json      mod browser, add/update/remove sheets, dependency banner
    versions.json  version list, downloads of game builds, link versions
    worlds.json    saves, edit/delete dialogs, world map
    servers.json   saved/public servers, server form, connect sheet
    hosting.json   dedicated hosting pages, console, whitelist, settings
    modpacks.json  modpack browser/detail/forms, modpack mods list
    news.json      news page
    config.json    mod config page and editors
    downloads.json downloads sheet and download rows
    settings.json  settings page, data folders, logs, account card
    auth.json      sign-in page, account menu, add-account sheet
```

`locales/index.ts` lists every file explicitly (i18next needs static imports).
Add a line there when adding a language or an area.

## Using it

Components:

```tsx
import { useTranslation } from "react-i18next";

function Example({ name }: { name: string }) {
  const { t } = useTranslation();
  return <Button title={t("profiles.row.edit")}>{t("common.edit", { name })}</Button>;
}
```

Outside React (stores, mutation handlers) use the live helper so the current
language applies:

```ts
import { t } from "@/lib/i18n";
toast.error(t("mods.install.failed", { name }));
```

Dates: call `useDateLocale()` from `@/lib/i18n/date-locale` and pass it to
date-fns (`formatDistanceToNow(date, { addSuffix: true, locale })`).

## Rules

- Keys are `area.section.thing` in camelCase, defined in the area's file. Use
  `common.*` for shared verbs (the existing list is the vocabulary — prefer it
  over near-duplicates).
- Interpolate with `{{name}}`; never build sentences by concatenation:
  `t("mods.installed", { count })`, not `t("…") + " " + name`.
- Count-dependent strings use i18next plurals: `count_one`, `count_other`
  (Russian adds `_few`/`_many`, Chinese only `_other`).
- Translate: labels, headings, buttons, placeholders, `aria-label`s, titles,
  toasts, empty states, confirmations.
- Do **not** translate: product names (Story Forge, Vintage Story, ModDB,
  Macheim), launcher names, file names and paths, version strings
  (`1.21.5`, `v1.2.3`), URLs, keyboard keys, enum values used in logic,
  `console`/log messages.
- Keep the rendered result identical in structure: same punctuation style per
  language, same interpolated values, same keyboard hints (`Ctrl+K` stays
  `Ctrl+K` — it is composed from `modifierLabel`).
- When a string is only shown conditionally, still translate the whole string
  (move the condition outside the string).
