# Bino's Theatre Of Mind NG

A system-agnostic Foundry VTT (v13+/v14) module for cinematic theatre-of-mind play,
inspired by the presentation style of Alchemy VTT.

When theatre mode is activated, a cinematic layer is drawn over the active scene:
an image or video backdrop, letterbox bars, vignette, weather and color moods — with
the cast displayed as framed portraits and small-caps name plates on the stage.



## Features

- **Backdrops** — any image or video (webm/mp4); managed as a card grid, renamed inline,
  switched on the fly with a crossfade. The backdrop name doubles as the location title.
- **Title card** — cinematic title fades in on activation and on every backdrop switch
  (plus a "show now" button), synced to all players.
- **Actors** — world actors placed via dropdown or drag & drop from the sidebar; avatar
  portraits in configurable frames (circle / rounded / square / upright 3:4 card), with
  per-actor image, accent color and size overrides.
- **Faction groups** — named rows freely positioned on the Y axis with own alignment,
  color and stage label; assign via dropdown or drag portraits between rows on the stage.
- **Speaking spotlight** — one actor pulses as the speaker while everyone else dims.
- **Hover preview** — dwell on a portrait to open a large framed view; move away to close.
- **Campaign Codex support** — if Campaign Codex is active, the hover preview shows the
  linked NPC entry's Info or Notes text (configurable) beside the portrait; Notes respect
  journal permissions for players.
- **Click to sheet** — clicking a portrait opens the character sheet (permission-gated).
- **Cinematic effects per scene** — letterbox, vignette, Ken Burns drift, film grain,
  mouse parallax; weather layers (rain, snow, fog, embers, blood); color moods
  (cold night, sepia, frenzy, dream, hunger heartbeat, elysium candlelight, blood moon,
  sunset, vampiric night).
- **Presets** — save whole setups as named world presets, apply to any scene, copy from
  another scene, export/import as JSON.
- **Hotkeys** — Alt+T toggles theatre mode, Alt+M the manager (GM only, rebindable).
- **Live sync** — everything is stored in scene flags; every GM change appears instantly
  on all clients. No sockets, no reloads. System agnostic (pure DOM overlay).



## Installation

In Foundry VTT open **Setup → Add-on Modules → Install Module** and paste this
manifest URL:

```
https://github.com/MrTheBino/binos_theatre_of_mind_ng/releases/latest/download/module.json
```

Or install manually: grab `module.zip` from the
[latest release](https://github.com/MrTheBino/binos_theatre_of_mind_ng/releases/latest)
and unpack it into your Foundry `Data/modules/` folder as
`binos_theatre_of_mind_ng`. Requires Foundry VTT v13+ (verified on v14).



## Usage

1. Activate a scene.
2. Click the theatre-masks button in the token scene controls (GM only) or press Alt+M.
3. Add backdrops, place actors, tune visuals — changes save instantly.
4. Hit **Activate Theatre Mode** (or Alt+T). Deactivate to return to the normal scene.

The stage config lives per scene under `flags.binos_theatre_of_mind_ng.config`.
A scripting surface is exposed at `game.modules.get("binos_theatre_of_mind_ng").api`
(`TomData`, `TomOverlay`, `TheatreManager`).



## Development

See [CLAUDE.md](CLAUDE.md) (project guide), [ARCHITECTURE.md](ARCHITECTURE.md)
(data model & subsystems), [TESTING.md](TESTING.md) (live-test workflow) and
[TODO.md](TODO.md) (history & roadmap). Localized in English and German.

Source, issues and releases live at
<https://github.com/MrTheBino/binos_theatre_of_mind_ng>.



## Building & releasing

There is no compile step — the module ships its source directly. A release is
produced entirely by the GitHub Actions workflow
[`.github/workflows/main.yml`](.github/workflows/main.yml), triggered whenever a
**version tag is pushed**. The workflow creates the GitHub release itself.

The workflow:

1. Derives the module version from the pushed tag, stripping an optional leading
   `v` (`v0.1.0` and `0.1.0` both yield version `0.1.0`).
2. Rewrites `version`, `url`, `manifest` and `download` in `module.json` so the
   manifest auto-updates from the *latest* release and the download points at
   this tag's `module.zip`.
3. Bundles `module.json`, `scripts/`, `templates/`, `styles/`, `lang/`, `assets/`
   and `README.md` into `module.zip`.
4. Creates the release for the tag and attaches `module.json` and `module.zip`.

**Cutting a release**

1. Bump `version` in `module.json` (optional — the workflow overwrites it from the
   tag, but keeping it in sync avoids confusion in the repo). Commit and push.
2. Create and push a version tag. The tag **may or may not** start with `v` — both
   `v0.1.0` and `0.1.0` work; the module version and the download URL adapt to
   whichever form you use:

   ```
   git tag 0.1.0
   git push origin 0.1.0
   ```

   The workflow triggers on tags matching `v*` or `[0-9]*`.

3. The push runs the workflow, which packages the assets and publishes the
   release. The install manifest URL (`releases/latest/download/module.json`)
   stays stable across releases.
