import { MODULE_ID, FLAG_KEY } from "./constants.js";

/**
 * Default theatre-of-mind configuration stored per scene.
 * Backdrops: { id, name, src }
 * Actors:    { id, uuid, hidden, speaking, img, color, scale, groupId }
 *            img/color override avatar & accent ring; scale multiplies portrait size;
 *            groupId assigns the actor to a faction group (null = default strip)
 * Groups:    { id, name, y, justify, color, showLabel, scale }
 *            y positions the faction row vertically (0-100% of the stage);
 *            scale multiplies the portrait size for all group members
 */
export const DEFAULTS = {
  enabled: false,
  activeBackdrop: null,
  backdrops: [],
  actors: [],
  groups: [],
  layout: {
    justify: "center",
    align: "end",
    size: 140,
    gap: 16,
    showNames: true,
    nameSize: 18
  },
  border: {
    color: "#d4af37",
    width: 3,
    shape: "circle"
  },
  fx: {
    letterbox: true,
    vignette: true,
    kenburns: true,
    grain: false,
    weather: "none",
    mood: "none",
    parallax: false
  },
  preview: {
    enabled: true,
    delay: 5
  },
  title: {
    text: "",
    showOnActivate: true,
    nonce: null
  }
};

/**
 * Read/write helper around the scene flag that stores the theatre-of-mind
 * configuration. All clients receive flag changes through the normal Scene
 * document update flow, so no custom socket handling is required.
 */
export class TomData {
  /**
   * Get the merged configuration for a scene.
   * @param {Scene} scene
   * @returns {object}
   */
  static get(scene) {
    const stored = scene?.getFlag(MODULE_ID, FLAG_KEY) ?? {};
    const config = foundry.utils.mergeObject(DEFAULTS, stored, { inplace: false });
    // Normalize entries written by older versions
    config.actors = config.actors.map(a =>
      ({ hidden: false, speaking: false, img: null, color: null, scale: 1, groupId: null, ...a }));
    config.groups = config.groups.map(g =>
      ({ y: 50, justify: "center", color: null, showLabel: true, scale: 1, ...g }));
    return config;
  }

  /** A fresh actor entry with all per-actor fields at their defaults. */
  static newActorEntry(uuid) {
    return {
      id: foundry.utils.randomID(), uuid,
      hidden: false, speaking: false, img: null, color: null, scale: 1, groupId: null
    };
  }

  /** A fresh faction group centered in the middle of the stage. */
  static newGroup(name) {
    return { id: foundry.utils.randomID(), name, y: 50, justify: "center", color: null, showLabel: true, scale: 1 };
  }

  /**
   * Merge a partial update into the stored configuration.
   * Arrays (backdrops, actors) are replaced wholesale by Foundry's update logic.
   * @param {Scene} scene
   * @param {object} changes
   */
  static async update(scene, changes) {
    if (!scene) return;
    if (!game.user.isGM) {
      ui.notifications.warn(game.i18n.localize("BTOMNG.Warn.GMOnly"));
      return;
    }
    return scene.setFlag(MODULE_ID, FLAG_KEY, changes);
  }

  /** Convenience: toggle theatre-of-mind mode for a scene. */
  static async toggle(scene) {
    const config = this.get(scene);
    return this.update(scene, { enabled: !config.enabled });
  }

  /* -------------------------------------------- */
  /*  Presets (world setting)                     */
  /* -------------------------------------------- */

  static PRESETS_KEY = "presets";

  /** @returns {Array<{id: string, name: string, config: object}>} */
  static getPresets() {
    return game.settings.get(MODULE_ID, this.PRESETS_KEY) ?? [];
  }

  static async setPresets(presets) {
    return game.settings.set(MODULE_ID, this.PRESETS_KEY, presets);
  }

  /** A scene's full config without its activation state, for storing/copying. */
  static snapshot(scene) {
    const config = foundry.utils.deepClone(this.get(scene));
    delete config.enabled;
    return config;
  }

  /** Save the scene's current setup as a new named preset. */
  static async savePreset(name, scene) {
    const preset = { id: foundry.utils.randomID(), name, config: this.snapshot(scene) };
    await this.setPresets([...this.getPresets(), preset]);
    return preset;
  }

  /** Replace a preset's stored setup with the scene's current one. */
  static async overwritePreset(id, scene) {
    await this.setPresets(this.getPresets().map(p =>
      p.id === id ? { ...p, config: this.snapshot(scene) } : p));
  }

  static async deletePreset(id) {
    await this.setPresets(this.getPresets().filter(p => p.id !== id));
  }

  /** Apply a stored setup to a scene, keeping its current activation state. */
  static async applyConfig(scene, config) {
    const current = this.get(scene);
    return this.update(scene, { ...foundry.utils.deepClone(config), enabled: current.enabled });
  }

  /** Parse exported JSON and add it as a new preset. Throws on invalid data. */
  static async importPreset(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(game.i18n.localize("BTOMNG.Warn.ImportInvalid"));
    }
    if (typeof parsed?.name !== "string" || typeof parsed?.config !== "object" || parsed.config === null) {
      throw new Error(game.i18n.localize("BTOMNG.Warn.ImportInvalid"));
    }
    const preset = { id: foundry.utils.randomID(), name: parsed.name, config: parsed.config };
    await this.setPresets([...this.getPresets(), preset]);
    return preset;
  }

  /** Serialize a preset for file export. */
  static exportData(preset) {
    return JSON.stringify({ module: MODULE_ID, name: preset.name, config: preset.config }, null, 2);
  }
}
