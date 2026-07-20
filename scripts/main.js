import { MODULE_ID } from "./constants.js";
import { TomData } from "./data.js";
import { TomOverlay } from "./overlay.js";
import { TheatreManager } from "./manager.js";

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, TomData.PRESETS_KEY, {
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  // Campaign Codex integration (only takes effect when that module is active)
  game.settings.register(MODULE_ID, "codexField", {
    name: "BTOMNG.Settings.CodexField",
    hint: "BTOMNG.Settings.CodexFieldHint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      notes: "BTOMNG.Settings.CodexFieldNotes",
      description: "BTOMNG.Settings.CodexFieldInfo"
    },
    default: "notes"
  });

  game.settings.register(MODULE_ID, "codexSide", {
    name: "BTOMNG.Settings.CodexSide",
    hint: "BTOMNG.Settings.CodexSideHint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      right: "BTOMNG.Settings.CodexSideRight",
      left: "BTOMNG.Settings.CodexSideLeft"
    },
    default: "right"
  });

  game.keybindings.register(MODULE_ID, "toggleTheatre", {
    name: "BTOMNG.Keys.Toggle",
    hint: "BTOMNG.Keys.ToggleHint",
    editable: [{ key: "KeyT", modifiers: ["Alt"] }],
    restricted: true,
    onDown: () => {
      const scene = game.scenes?.active;
      if (scene) TomData.toggle(scene);
      return true;
    }
  });

  game.keybindings.register(MODULE_ID, "openManager", {
    name: "BTOMNG.Keys.Manager",
    hint: "BTOMNG.Keys.ManagerHint",
    editable: [{ key: "KeyM", modifiers: ["Alt"] }],
    restricted: true,
    onDown: () => {
      TheatreManager.toggleOpen();
      return true;
    }
  });

  const module = game.modules.get(MODULE_ID);
  module.api = { TomData, TomOverlay, TheatreManager };
});

Hooks.once("ready", () => TomOverlay.refresh());

Hooks.on("canvasReady", () => TomOverlay.refresh());

Hooks.on("updateScene", (scene, changes) => {
  const touchesUs = foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`);
  const touchesActivation = "active" in changes;
  if (!touchesUs && !touchesActivation) return;
  TomOverlay.refresh();
  TheatreManager.refresh();
});

/* Re-render the overlay when a placed actor changes name or portrait. */
Hooks.on("updateActor", (actor, changes) => {
  if (!("img" in changes) && !("name" in changes)) return;
  const scene = game.scenes?.active;
  if (!scene) return;
  const config = TomData.get(scene);
  if (config.enabled && config.actors.some(a => a.uuid === actor.uuid)) TomOverlay.refresh();
});

Hooks.on("getSceneControlButtons", controls => {
  if (!game.user?.isGM) return;
  const tool = {
    name: "binosTom",
    title: "BTOMNG.Controls.Open",
    icon: "fa-solid fa-masks-theater",
    button: true,
    visible: true,
    order: 100,
    onChange: () => TheatreManager.open(),
    onClick: () => TheatreManager.open()
  };
  // v13+: controls is a record keyed by group name with tools as a record
  const group = controls.tokens ?? controls.token;
  if (group?.tools && !Array.isArray(group.tools)) {
    group.tools.binosTom = tool;
    return;
  }
  // Legacy array shape as fallback
  if (Array.isArray(controls)) {
    controls.find(c => c.name === "token")?.tools?.push(tool);
  }
});
