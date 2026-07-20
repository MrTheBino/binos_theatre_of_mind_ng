import { MODULE_ID, VIDEO_RX } from "./constants.js";
import { TomData } from "./data.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const WEATHERS = ["none", "rain", "snow", "fog", "embers", "blood"];
const MOODS = ["none", "cold", "sepia", "frenzy", "dream", "hunger", "elysium", "bloodmoon", "sunset", "vampnight"];

/**
 * GM-facing ApplicationV2 to configure the theatre-of-mind setup of the
 * active scene: backdrops, placed actors, layout and border styling.
 * All inputs submit on change and persist straight into the scene flag,
 * so the overlay updates live on every connected client.
 */
export class TheatreManager extends HandlebarsApplicationMixin(ApplicationV2) {
  static #instance;

  static DEFAULT_OPTIONS = {
    id: "tom-manager",
    tag: "form",
    classes: ["tom-manager"],
    window: {
      title: "BTOMNG.Manager.Title",
      icon: "fa-solid fa-masks-theater",
      resizable: true
    },
    position: { width: 560, height: 720 },
    form: {
      handler: TheatreManager.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    },
    actions: {
      toggleEnabled: TheatreManager.#onToggleEnabled,
      addBackdrop: TheatreManager.#onAddBackdrop,
      activateBackdrop: TheatreManager.#onActivateBackdrop,
      deleteBackdrop: TheatreManager.#onDeleteBackdrop,
      addActor: TheatreManager.#onAddActor,
      removeActor: TheatreManager.#onRemoveActor,
      toggleActorHidden: TheatreManager.#onToggleActorHidden,
      moveActor: TheatreManager.#onMoveActor,
      toggleSpeaking: TheatreManager.#onToggleSpeaking,
      toggleExpand: TheatreManager.#onToggleExpand,
      pickActorImage: TheatreManager.#onPickActorImage,
      clearActorImage: TheatreManager.#onClearActorImage,
      addGroup: TheatreManager.#onAddGroup,
      deleteGroup: TheatreManager.#onDeleteGroup,
      moveGroup: TheatreManager.#onMoveGroup,
      savePreset: TheatreManager.#onSavePreset,
      applyPreset: TheatreManager.#onApplyPreset,
      overwritePreset: TheatreManager.#onOverwritePreset,
      exportPreset: TheatreManager.#onExportPreset,
      importPreset: TheatreManager.#onImportPreset,
      deletePreset: TheatreManager.#onDeletePreset,
      copyScene: TheatreManager.#onCopyScene,
      showTitle: TheatreManager.#onShowTitle
    }
  };

  /** Actor ids whose per-actor settings panel is expanded. */
  #expanded = new Set();

  static TABS = {
    primary: {
      tabs: [
        { id: "backdrops", icon: "fa-solid fa-image" },
        { id: "actors", icon: "fa-solid fa-users" },
        { id: "visual", icon: "fa-solid fa-wand-magic-sparkles" },
        { id: "presets", icon: "fa-solid fa-box-archive" }
      ],
      initial: "backdrops",
      labelPrefix: "BTOMNG.Tabs"
    }
  };

  static PARTS = {
    header: {
      template: `modules/${MODULE_ID}/templates/manager-header.hbs`
    },
    tabs: {
      template: "templates/generic/tab-navigation.hbs"
    },
    backdrops: {
      template: `modules/${MODULE_ID}/templates/tab-backdrops.hbs`,
      scrollable: [""]
    },
    actors: {
      template: `modules/${MODULE_ID}/templates/tab-actors.hbs`,
      scrollable: [""]
    },
    visual: {
      template: `modules/${MODULE_ID}/templates/tab-visual.hbs`,
      scrollable: [""]
    },
    presets: {
      template: `modules/${MODULE_ID}/templates/tab-presets.hbs`,
      scrollable: [""]
    }
  };

  /** Open (or focus) the singleton manager window. */
  static open() {
    this.#instance ??= new this();
    this.#instance.render(true);
    return this.#instance;
  }

  /** Re-render the manager if it is currently open. */
  static refresh() {
    if (this.#instance?.rendered) this.#instance.render();
  }

  /** Open the manager, or close it when already open (keybinding). */
  static toggleOpen() {
    if (this.#instance?.rendered) this.#instance.close();
    else this.open();
  }

  get scene() {
    return game.scenes?.active ?? null;
  }

  get config() {
    return this.scene ? TomData.get(this.scene) : null;
  }

  /** @override */
  async _prepareContext(options) {
    const scene = this.scene;
    const config = this.config;
    const tabs = this._prepareTabs("primary");
    if (!scene || !config) return { scene: null, tabs };

    const backdrops = config.backdrops.map(b => ({
      ...b,
      isVideo: VIDEO_RX.test(b.src),
      isActive: b.id === config.activeBackdrop
    }));

    const groups = config.groups.map((g, i) => ({
      ...g,
      useColor: !!g.color,
      colorVal: g.color ?? config.border.color,
      scaleVal: g.scale ?? 1,
      isFirst: i === 0,
      isLast: i === config.groups.length - 1,
      justifyOptions: this.#options("BTOMNG.Justify",
        ["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"], g.justify)
    }));

    const actors = config.actors.map((a, i) => {
      const actor = fromUuidSync(a.uuid);
      return {
        ...a,
        index: i,
        name: actor?.name ?? game.i18n.localize("BTOMNG.Manager.MissingActor"),
        thumb: a.img || actor?.img || "icons/svg/mystery-man.svg",
        isFirst: i === 0,
        isLast: i === config.actors.length - 1,
        expanded: this.#expanded.has(a.id),
        useColor: !!a.color,
        colorVal: a.color ?? config.border.color,
        scaleVal: a.scale ?? 1,
        groupOptions: config.groups.map(g => ({ id: g.id, name: g.name, selected: g.id === a.groupId }))
      };
    });

    const placed = new Set(config.actors.map(a => a.uuid));
    const worldActors = game.actors
      .filter(a => !placed.has(a.uuid))
      .map(a => ({ uuid: a.uuid, name: a.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const tomScenes = game.scenes
      .filter(s => s.id !== scene.id && s.getFlag(MODULE_ID, "config"))
      .map(s => ({ id: s.id, name: s.name }));

    return {
      scene,
      config,
      tabs,
      backdrops,
      groups,
      actors,
      worldActors,
      presets: TomData.getPresets(),
      tomScenes,
      justifyOptions: this.#options("BTOMNG.Justify", ["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"], config.layout.justify),
      alignOptions: this.#options("BTOMNG.Align", ["start", "center", "end"], config.layout.align),
      shapeOptions: this.#options("BTOMNG.Shape", ["circle", "rounded", "square", "portrait"], config.border.shape),
      weatherOptions: this.#options("BTOMNG.Weather", WEATHERS, config.fx.weather),
      moodOptions: this.#options("BTOMNG.Mood", MOODS, config.fx.mood)
    };
  }

  /** @override */
  async _preparePartContext(partId, context, options) {
    if (context.tabs?.[partId]) context.tab = context.tabs[partId];
    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender?.(context, options);

    // Drop world actors from the sidebar onto the Akteure tab
    const DD = foundry.applications?.ux?.DragDrop?.implementation
      ?? foundry.applications?.ux?.DragDrop
      ?? DragDrop;
    new DD({
      dropSelector: ".tom-actors-config",
      callbacks: { drop: this.#onDrop.bind(this) }
    }).bind(this.element);

    // Live labels next to range sliders while dragging
    for (const range of this.element.querySelectorAll('input[type="range"]')) {
      range.addEventListener("input", () => {
        const label = range.closest(".tom-field, .form-group")?.querySelector(".range-value");
        if (!label) return;
        label.textContent = range.name.endsWith(".scale")
          ? `${Number(range.value).toFixed(2)}×`
          : range.name.endsWith(".y")
            ? `${range.value}%`
            : range.name.endsWith(".delay")
              ? `${range.value}s`
              : `${range.value}px`;
      });
    }
  }

  async #onDrop(event) {
    const TE = foundry.applications?.ux?.TextEditor?.implementation ?? TextEditor;
    const data = TE.getDragEventData(event);
    if (data?.type !== "Actor" || !data.uuid) return;
    const actor = await fromUuid(data.uuid);
    if (!actor) return;
    if (actor.pack) {
      ui.notifications.warn(game.i18n.localize("BTOMNG.Warn.WorldActorsOnly"));
      return;
    }
    const config = this.config;
    if (!config || config.actors.some(a => a.uuid === actor.uuid)) return;
    await TomData.update(this.scene, {
      actors: [...config.actors, TomData.newActorEntry(actor.uuid)]
    });
  }

  #options(prefix, values, selected) {
    return values.map(value => ({
      value,
      label: game.i18n.localize(`${prefix}.${value}`),
      selected: value === selected
    }));
  }

  /* -------------------------------------------- */
  /*  Form + actions                              */
  /* -------------------------------------------- */

  static async #onSubmit(event, form, formData) {
    const scene = this.scene;
    if (!scene) return;
    const config = TomData.get(scene);
    const d = foundry.utils.expandObject(formData.object);
    const update = {};

    // Per-actor fields: the group select is always present, the override
    // inputs only for expanded rows — apply only what was actually submitted.
    if (d.actorCfg) {
      update.actors = config.actors.map(a => {
        const c = d.actorCfg[a.id];
        if (!c) return a;
        return {
          ...a,
          groupId: c.groupId !== undefined ? (c.groupId || null) : a.groupId,
          scale: c.scale !== undefined
            ? Math.min(2.5, Math.max(0.4, Number(c.scale) || 1))
            : a.scale,
          color: c.useColor !== undefined
            ? (c.useColor ? (c.color || a.color || config.border.color) : null)
            : a.color
        };
      });
    }

    // Faction groups
    if (d.groupCfg) {
      update.groups = config.groups.map(g => {
        const c = d.groupCfg[g.id];
        if (!c) return g;
        return {
          ...g,
          name: c.name?.trim() || g.name,
          y: Math.min(100, Math.max(0, Number(c.y) ?? g.y)),
          justify: c.justify ?? g.justify,
          color: c.useColor ? (c.color || g.color || config.border.color) : null,
          showLabel: !!c.showLabel,
          scale: c.scale !== undefined
            ? Math.min(2.5, Math.max(0.4, Number(c.scale) || 1))
            : g.scale
        };
      });
    }

    // Editable preset names (world setting, not scene flag)
    if (d.presetNames) {
      await TomData.setPresets(TomData.getPresets().map(p =>
        ({ ...p, name: d.presetNames[p.id]?.trim() || p.name })));
    }

    // Editable backdrop names
    if (d.backdropNames) {
      update.backdrops = config.backdrops.map(b => ({
        ...b,
        name: d.backdropNames[b.id]?.trim() || b.name
      }));
    }

    await TomData.update(scene, {
      ...update,
      layout: {
        justify: d.layout?.justify ?? "center",
        align: d.layout?.align ?? "end",
        size: Number(d.layout?.size) || 140,
        gap: Number(d.layout?.gap) ?? 16,
        showNames: !!d.layout?.showNames,
        nameSize: Math.min(64, Math.max(8, Number(d.layout?.nameSize) || 18))
      },
      border: {
        color: d.border?.color || "#d4af37",
        width: Number(d.border?.width) || 0,
        shape: d.border?.shape ?? "circle"
      },
      fx: {
        letterbox: !!d.fx?.letterbox,
        vignette: !!d.fx?.vignette,
        kenburns: !!d.fx?.kenburns,
        grain: !!d.fx?.grain,
        weather: WEATHERS.includes(d.fx?.weather) ? d.fx.weather : "none",
        mood: MOODS.includes(d.fx?.mood) ? d.fx.mood : "none",
        parallax: !!d.fx?.parallax
      },
      preview: {
        enabled: !!d.preview?.enabled,
        delay: Math.min(10, Math.max(1, Number(d.preview?.delay) || 5))
      },
      title: {
        text: (d.title?.text ?? "").trim(),
        showOnActivate: !!d.title?.showOnActivate
      }
    });
  }

  static async #onToggleEnabled() {
    await TomData.toggle(this.scene);
  }

  static async #onAddBackdrop() {
    const scene = this.scene;
    const FP = foundry.applications?.apps?.FilePicker?.implementation ?? FilePicker;
    const fp = new FP({
      type: "imagevideo",
      callback: async path => {
        const config = TomData.get(scene);
        // Pretty default name (used by the title card): no extension, no dashes
        const basename = decodeURIComponent(path.split("/").pop() ?? path);
        const backdrop = {
          id: foundry.utils.randomID(),
          name: basename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || basename,
          src: path
        };
        await TomData.update(scene, {
          backdrops: [...config.backdrops, backdrop],
          activeBackdrop: config.activeBackdrop ?? backdrop.id
        });
      }
    });
    fp.render(true);
  }

  static async #onActivateBackdrop(event, target) {
    await TomData.update(this.scene, { activeBackdrop: target.dataset.id });
  }

  static async #onDeleteBackdrop(event, target) {
    const config = this.config;
    const backdrops = config.backdrops.filter(b => b.id !== target.dataset.id);
    const activeBackdrop = config.activeBackdrop === target.dataset.id
      ? (backdrops[0]?.id ?? null)
      : config.activeBackdrop;
    await TomData.update(this.scene, { backdrops, activeBackdrop });
  }

  static async #onAddActor() {
    const uuid = this.element.querySelector('[name="_actorToAdd"]')?.value;
    if (!uuid) return;
    const config = this.config;
    if (config.actors.some(a => a.uuid === uuid)) return;
    const actors = [...config.actors, TomData.newActorEntry(uuid)];
    await TomData.update(this.scene, { actors });
  }

  /** Mark an actor as the current speaker (radio behavior, click again to clear). */
  static async #onToggleSpeaking(event, target) {
    const actors = this.config.actors.map(a =>
      ({ ...a, speaking: a.id === target.dataset.id ? !a.speaking : false }));
    await TomData.update(this.scene, { actors });
  }

  static #onToggleExpand(event, target) {
    const id = target.dataset.id;
    if (this.#expanded.has(id)) this.#expanded.delete(id);
    else this.#expanded.add(id);
    this.render();
  }

  static async #onPickActorImage(event, target) {
    const scene = this.scene;
    const id = target.dataset.id;
    const FP = foundry.applications?.apps?.FilePicker?.implementation ?? FilePicker;
    new FP({
      type: "image",
      callback: async path => {
        const actors = TomData.get(scene).actors.map(a =>
          a.id === id ? { ...a, img: path } : a);
        await TomData.update(scene, { actors });
      }
    }).render(true);
  }

  static async #onClearActorImage(event, target) {
    const actors = this.config.actors.map(a =>
      a.id === target.dataset.id ? { ...a, img: null } : a);
    await TomData.update(this.scene, { actors });
  }

  static async #onAddGroup() {
    const config = this.config;
    const name = game.i18n.format("BTOMNG.Manager.NewGroupName", { n: config.groups.length + 1 });
    await TomData.update(this.scene, { groups: [...config.groups, TomData.newGroup(name)] });
  }

  /* -------------------------------------------- */
  /*  Presets                                     */
  /* -------------------------------------------- */

  static async #confirm(titleKey, contentKey, data = {}) {
    return foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize(titleKey) },
      content: `<p>${game.i18n.format(contentKey, data)}</p>`,
      rejectClose: false,
      modal: true
    });
  }

  static async #onSavePreset() {
    const input = this.element.querySelector('[name="_presetName"]');
    const name = input?.value.trim();
    if (!name) return input?.focus();
    await TomData.savePreset(name, this.scene);
    ui.notifications.info(game.i18n.format("BTOMNG.Info.PresetSaved", { name }));
    this.render();
  }

  static async #onApplyPreset(event, target) {
    const preset = TomData.getPresets().find(p => p.id === target.dataset.id);
    if (!preset) return;
    const ok = await TheatreManager.#confirm(
      "BTOMNG.Manager.ApplyPreset", "BTOMNG.Confirm.ApplyPreset", { name: preset.name });
    if (!ok) return;
    await TomData.applyConfig(this.scene, preset.config);
    ui.notifications.info(game.i18n.format("BTOMNG.Info.PresetApplied", { name: preset.name }));
  }

  static async #onOverwritePreset(event, target) {
    const preset = TomData.getPresets().find(p => p.id === target.dataset.id);
    if (!preset) return;
    const ok = await TheatreManager.#confirm(
      "BTOMNG.Manager.OverwritePreset", "BTOMNG.Confirm.OverwritePreset", { name: preset.name });
    if (!ok) return;
    await TomData.overwritePreset(preset.id, this.scene);
    ui.notifications.info(game.i18n.format("BTOMNG.Info.PresetSaved", { name: preset.name }));
    this.render();
  }

  static async #onDeletePreset(event, target) {
    const preset = TomData.getPresets().find(p => p.id === target.dataset.id);
    if (!preset) return;
    const ok = await TheatreManager.#confirm(
      "BTOMNG.Manager.DeletePreset", "BTOMNG.Confirm.DeletePreset", { name: preset.name });
    if (!ok) return;
    await TomData.deletePreset(preset.id);
    this.render();
  }

  static #onExportPreset(event, target) {
    const preset = TomData.getPresets().find(p => p.id === target.dataset.id);
    if (!preset) return;
    const save = foundry.utils.saveDataToFile ?? globalThis.saveDataToFile;
    const slug = preset.name.slugify?.() ?? preset.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    save(TomData.exportData(preset), "application/json", `tom-preset-${slug}.json`);
  }

  static #onImportPreset() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const preset = await TomData.importPreset(await file.text());
        ui.notifications.info(game.i18n.format("BTOMNG.Info.PresetImported", { name: preset.name }));
        this.render();
      } catch (e) {
        ui.notifications.error(e.message);
      }
    });
    input.click();
  }

  static async #onCopyScene() {
    const sceneId = this.element.querySelector('[name="_copyScene"]')?.value;
    const source = game.scenes.get(sceneId);
    if (!source) return;
    const ok = await TheatreManager.#confirm(
      "BTOMNG.Manager.CopyFromScene", "BTOMNG.Confirm.CopyScene", { name: source.name });
    if (!ok) return;
    await TomData.applyConfig(this.scene, TomData.snapshot(source));
    ui.notifications.info(game.i18n.format("BTOMNG.Info.SceneCopied", { name: source.name }));
  }

  /** Broadcast the cinematic title card to all clients (bumps the nonce). */
  static async #onShowTitle() {
    if (!this.config?.enabled) {
      ui.notifications.warn(game.i18n.localize("BTOMNG.Warn.TitleNeedsTheatre"));
      return;
    }
    await TomData.update(this.scene, { title: { nonce: foundry.utils.randomID() } });
  }

  static async #onMoveGroup(event, target) {
    const dir = target.dataset.dir === "up" ? -1 : 1;
    const groups = [...this.config.groups];
    const from = groups.findIndex(g => g.id === target.dataset.id);
    const to = from + dir;
    if (from < 0 || to < 0 || to >= groups.length) return;
    [groups[from], groups[to]] = [groups[to], groups[from]];
    await TomData.update(this.scene, { groups });
  }

  static async #onDeleteGroup(event, target) {
    const id = target.dataset.id;
    const config = this.config;
    await TomData.update(this.scene, {
      groups: config.groups.filter(g => g.id !== id),
      actors: config.actors.map(a => a.groupId === id ? { ...a, groupId: null } : a)
    });
  }

  static async #onRemoveActor(event, target) {
    const actors = this.config.actors.filter(a => a.id !== target.dataset.id);
    await TomData.update(this.scene, { actors });
  }

  static async #onToggleActorHidden(event, target) {
    const actors = this.config.actors.map(a =>
      a.id === target.dataset.id ? { ...a, hidden: !a.hidden } : a
    );
    await TomData.update(this.scene, { actors });
  }

  static async #onMoveActor(event, target) {
    const dir = target.dataset.dir === "up" ? -1 : 1;
    const actors = [...this.config.actors];
    const from = actors.findIndex(a => a.id === target.dataset.id);
    const to = from + dir;
    if (from < 0 || to < 0 || to >= actors.length) return;
    [actors[from], actors[to]] = [actors[to], actors[from]];
    await TomData.update(this.scene, { actors });
  }
}
