# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A GNOME Shell extension ("Media Controls") that shows a panel button with the currently playing media (via MPRIS/D-Bus) — title/artist, album art, play/pause/next/previous/loop/shuffle, a seek slider, and a preferences window. Plain JS (JSDoc-typed, no TypeScript compilation step — `@girs` packages + `global.d.ts` provide ambient types for editor/type-checking only). Targets GNOME Shell 46-50.

## Commands

Package manager is pnpm.

- `pnpm install` — install dependencies
- `pnpm build` — clean, copy `src/` into `dist/temp`, compile the GResource bundle from `assets/`, and pack into `dist/builds/mediacontrols@cliffniff.github.com.shell-extension.zip` via `gnome-extensions pack`
- `pnpm run ext:install` / `ext:uninstall` / `ext:enable` / `ext:disable` / `ext:prefs` — manage the built extension via `gnome-extensions`
- `pnpm debug` — run a nested GNOME Shell session (Wayland) with `SHELL_DEBUG=all` for live debugging
- `pnpm run format` — run Prettier on the whole repo
- `pnpm run translations` — extract strings to the `.pot` file and merge into all `.po` files under `assets/locale/`

There is no automated test suite or linter script in this repo — verification is manual (build, install, and exercise the extension in a real or nested GNOME Shell session, plus the preferences window via `ext:prefs`).

There is no separate "watch" mode: after editing `src/`, re-run `pnpm build && pnpm run ext:install`, then reload GNOME Shell (X11: Alt+F2, `r`, Enter; Wayland: log out/in or use `pnpm debug` for a nested session) to pick up changes.

## Architecture

### Two entry points, two runtimes

- `src/extension.js` — the shell-side `Extension` subclass (`MediaControls`). Runs inside `gnome-shell`'s process. Has access to `Shell`, `Meta`, `Main`, `Mpris`, etc.
- `src/prefs.js` — the `ExtensionPreferences` subclass. Runs in a separate `gnome-extensions prefs` process (uses GTK4/Adwaita, not Clutter/St). **Cannot** import anything from `src/utils/shell_only.js` or `src/helpers/shell/*` — those depend on APIs (`Shell`, `St`, `Clutter`, Mpris shell integration) that don't exist in the prefs process.
- `src/utils/common.js` — safe to import from either runtime.
- `src/utils/shell_only.js` — shell-runtime only (D-Bus proxy creation, app lookup, image caching).
- `src/utils/prefs_only.js` — prefs-runtime only.

Both entry points load the same compiled GResource bundle (`org.gnome.shell.extensions.mediacontrols.gresource`, built from `assets/`) for `.ui` templates (prefs widgets) and D-Bus introspection XML (`assets/dbus/*.xml`, used only by `extension.js`).

### Player discovery and lifecycle (extension.js)

1. On `enable()`, `MediaControls` reads all settings from the extension's `Gio.Settings` (GSettings schema in `assets/org.gnome.shell.extensions.mediacontrols.gschema.xml`) into plain instance fields, and wires a `settings.connect("changed::...")` listener per key that updates the field and calls `panelBtn.updateWidgets(WidgetFlags...)` to re-render only the affected pieces.
2. It loads D-Bus interface XML from the GResource bundle and creates a proxy watching `org.freedesktop.DBus` for `NameOwnerChanged` to detect MPRIS players (`org.mpris.MediaPlayer2.*` bus names) appearing/disappearing.
3. Each discovered bus name becomes a `PlayerProxy` (`src/helpers/shell/PlayerProxy.js`), wrapping three D-Bus proxies (`org.mpris.MediaPlayer2`, `...Player`, and `org.freedesktop.DBus.Properties`) plus a change-listener/pub-sub system (`onChanged`/`callOnChangedListeners`) for property changes signaled over `PropertiesChanged`. It also polls briefly after creation because some players don't report initial position/metadata immediately.
4. `MediaControls.setActivePlayer()` picks which player owns the panel button: a pinned player wins; otherwise prefers a currently-playing player over the previously-displayed one over others. Players matching `blacklistedPlayers` (checked via `isPlayerBlacklisted`, which cross-references `Shell.AppSystem`/`Gio.AppInfo` to normalize sandboxed-app identities) are excluded entirely.
5. `PanelButton` (`src/helpers/shell/PanelButton.js`) is the actual `PanelMenu.Button` — created/destroyed as players come and go, and re-pointed at a different `PlayerProxy` via `updateProxy()` without recreating the button when possible.

### Widget update model (PanelButton)

`PanelButton.updateWidgets(flags)` takes a bitmask (`WidgetFlags` in `src/types/enums/common.js`) so callers can request narrow, targeted re-renders instead of a full rebuild — e.g. a `PlaybackStatus` change only touches play/pause icons and scrolling state, while a settings change to `elements-order` passes `PANEL_NO_REPLACE` to force a full rebuild of the panel row in the new order. When adding a new toggle/setting that affects rendering, add a bit to `WidgetFlags` and thread it through the relevant `settings.connect` handler and `updateWidgets` branch rather than unconditionally re-rendering everything.

Panel elements (icon/label/controls) and their order are user-configurable (`elements-order`, `labels-order` GSettings keys, edited via drag-reorderable lists in prefs — `ElementList.js`/`LabelList.js`). The menu (popup) content — art, title/artist labels, seek slider, transport controls — is separate from the panel button's own row and is always shown in a fixed layout inside the popup.

`ScrollingLabel` (`src/helpers/shell/ScrollingLabel.js`) and `MenuSlider` (`src/helpers/shell/MenuSlider.js`) are reusable widgets used both in the panel row and the popup menu.

### GSettings is the source of truth

All persistent configuration lives in the GSettings schema (`assets/org.gnome.shell.extensions.mediacontrols.gschema.xml`). Both `extension.js` and `prefs.js` read/write the same schema independently (no shared runtime state between the two processes — GSettings + D-Bus signals are the only channels). When adding a new setting: add the key to the `.gschema.xml`, read it in `MediaControls.initSettings()`/`destroySettings()`, add a `changed::<key>` handler, and bind it in `prefs.js` (`bindSettings()`/`bindSetting()`), plus a widget in the relevant `assets/ui/*.ui` file.

### Types

No TypeScript build — `.js` files use JSDoc (`@import`, `@typedef`, `@type`) checked against `@girs/*` ambient declarations via `jsconfig.json` (`checkJs: true`). `src/types/dbus.js` and `src/types/enums/*.js` hold shared JSDoc typedefs/enums; `src/types/misc.js` has small generic helper types (e.g. `KeysOf`). Enums (`common.js`) are plain frozen-shape objects, not real JS enums — used with the `Enum<typeof X>` typedef pattern.

### Build output shape

`pnpm build` assembles `dist/temp/` as a flat copy of `src/*` plus the compiled `.gresource` file, then `gnome-extensions pack` zips it with the schema and locale files as extra sources. The `--extra-source` flags in `package.json`'s `build:pack` script must stay in sync with any new top-level directories added under `src/`.

## Pull Request & Issue Labels

**Requirement:** every PR and issue must have at least one primary category label, plus any scope labels that apply. Keep labels accurate as scope changes.

Primary categories (pick exactly one, the one that best describes the bulk of the change):

- `enhancement`
- `bug`
- `documentation`
- `testing`
- `ci`
- `build`
- `chore`

Scope/operational labels (add any that apply):

- `infrastructure`
- `developer-experience`
- `security`
- `release`
- `internal`
- `skip-changelog`
- `accessibility`

Repo-specific scope labels (this extension's own subsystems):

- `shell` — shell-runtime extension code: panel button, player discovery, D-Bus integration (`src/extension.js`, `src/helpers/shell/*`)
- `prefs` — preferences window UI/settings (`src/prefs.js`, `src/helpers/prefs/*`, `assets/ui/*`)
- `mpris` — MPRIS/D-Bus player protocol and `PlayerProxy` behaviour
- `i18n` — translations and locale files (`assets/locale/*`)

When opening a PR or issue (via `gh pr create`/`gh issue create` or their `--label` flags), always attach the labels that apply rather than leaving it unlabeled.

## Writing PR/issue bodies and commit messages with backticks

Prefer `gh pr create --body-file <file>`/`gh issue create --body-file <file>` (write the markdown to a real file first, e.g. under the scratchpad) over inlining the body as a shell argument. If a heredoc is unavoidable, use a **quoted** delimiter (`<<'EOF' ... EOF`) and put backticks/`$` in **completely unescaped** — the quoting already stops the shell from interpreting them, so a literal `` \` `` or `\$` typed inside a quoted heredoc is not "escaped for safety," it's just wrong: that backslash gets sent to GitHub verbatim, breaking every code span in the rendered markdown. Escaping backticks with `` \` `` is only correct inside a **double-quoted** (non-heredoc) shell string, e.g. a single-line `gh api ... -f body="...\`code\`..."` call, where the shell really would otherwise try to run the backticked text as a command. Get this wrong and it doesn't error — it just quietly renders broken in a PR body, an issue, or a commit message, which is worse. Before trusting any PR/issue body or commit message that contains inline code spans, grep the actual posted/committed content for a literal backslash-backtick (`` grep -F '\`' ``) to confirm it rendered clean.
