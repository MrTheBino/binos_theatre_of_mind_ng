import { MODULE_ID, VIDEO_RX } from "./constants.js";
import { TomData } from "./data.js";

const OVERLAY_ID = "tom-overlay";
const CROSSFADE_MS = 1200;
const EXIT_MS = 550;

const SHAPE_RADIUS = {
  circle: "50%",
  rounded: "16px",
  square: "0",
  portrait: "12px"
};

/**
 * Renders the theatre-of-mind layer as a DOM overlay above the canvas.
 *
 * A DOM overlay (instead of a canvas layer) was chosen deliberately:
 * - <video> backdrops work natively without VideoTexture bookkeeping
 * - actor alignment/justification maps directly onto CSS flexbox
 * - it is completely independent of the underlying game system and canvas state
 *
 * Layer structure (bottom to top):
 *   .tom-stage      backdrop image/video, crossfaded on change
 *   .tom-weather    rain / snow / fog / ember particles
 *   .tom-mood       color-grading tint (paired with a filter on the stage)
 *   .tom-vignette   radial darkening towards the edges
 *   .tom-grain      subtle animated film grain
 *   .tom-letterbox  cinematic top/bottom bars
 *   .tom-actors     flexbox strip of actor portraits
 *   .tom-preview    hover portrait preview
 *   .tom-title      cinematic title card
 *
 * The actor strip is diffed by entry id: new portraits animate in, removed
 * ones animate out, persisting ones are updated in place so unrelated config
 * changes never replay entrance animations.
 */
const WEATHERS = ["rain", "snow", "fog", "embers", "blood"];
const MOODS = ["cold", "sepia", "frenzy", "dream", "hunger", "elysium", "bloodmoon", "sunset", "vampnight"];

export class TomOverlay {
  /** Dwell timer + state for the hover portrait preview. */
  static #hoverTimer = null;
  static #previewFor = null;

  /** Title card state. */
  static #lastTitleNonce = null;
  static #lastBackdropId = null;
  static #titleTimer = null;

  /** Whether the window-level parallax listener is attached. */
  static #parallaxBound = false;

  /**
   * Re-evaluate the active scene and render or remove the overlay accordingly.
   * Safe to call from any hook, any client.
   */
  static refresh() {
    const scene = game.scenes?.active;
    const config = scene ? TomData.get(scene) : null;
    if (!scene || !config?.enabled) return this.#remove();
    this.#render(config);
  }

  static #remove() {
    clearTimeout(this.#hoverTimer);
    this.#previewFor = null;
    const el = document.getElementById(OVERLAY_ID);
    if (!el) return;
    el.classList.add("closing");
    setTimeout(() => el.remove(), 450);
  }

  static #ensureElement() {
    let el = document.getElementById(OVERLAY_ID);
    if (el) {
      el.classList.remove("closing");
      return el;
    }
    el = document.createElement("div");
    el.id = OVERLAY_ID;
    for (const cls of ["tom-stage", "tom-weather", "tom-mood", "tom-vignette", "tom-grain", "tom-actors"]) {
      const layer = document.createElement("div");
      layer.classList.add(cls);
      el.append(layer);
    }
    const title = document.createElement("div");
    title.classList.add("tom-title");
    el.append(title);
    for (const pos of ["top", "bottom"]) {
      const bar = document.createElement("div");
      bar.classList.add("tom-letterbox", pos);
      el.append(bar);
    }
    // Clicking a portrait opens the actor's character sheet (permission-gated)
    el.querySelector(".tom-actors").addEventListener("click", event => {
      const item = event.target.closest(".tom-actor.clickable");
      if (!item?.dataset.uuid) return;
      const actor = fromUuidSync(item.dataset.uuid);
      if (actor?.testUserPermission(game.user, "LIMITED")) actor.sheet?.render(true);
    });
    if (game.user.isGM) this.#bindStageDrag(el);
    this.#bindHoverPreview(el);
    this.#bindParallax();
    document.body.append(el);
    return el;
  }

  /* -------------------------------------------- */
  /*  Parallax                                    */
  /* -------------------------------------------- */

  /** Subtle depth: the stage drifts against the cursor, the cast with it. */
  static #bindParallax() {
    if (this.#parallaxBound) return;
    this.#parallaxBound = true;
    window.addEventListener("mousemove", event => {
      const el = document.getElementById(OVERLAY_ID);
      if (!el?.classList.contains("fx-parallax")) return;
      const nx = (event.clientX / window.innerWidth - 0.5) * 2;
      const ny = (event.clientY / window.innerHeight - 0.5) * 2;
      el.querySelector(".tom-stage").style.transform =
        `translate(${(nx * -1.1).toFixed(3)}%, ${(ny * -0.8).toFixed(3)}%) scale(1.06)`;
      el.querySelector(".tom-actors").style.transform =
        `translate(${(nx * 0.35).toFixed(3)}%, ${(ny * 0.25).toFixed(3)}%)`;
    }, { passive: true });
  }

  /* -------------------------------------------- */
  /*  Hover portrait preview                      */
  /* -------------------------------------------- */

  /**
   * Dwelling on a portrait (configurable, default 5s) opens a large centered
   * view of the avatar. Moving the mouse off the portrait closes it again —
   * no click needed. Dragging cancels any pending preview.
   */
  static #bindHoverPreview(el) {
    const preview = document.createElement("div");
    preview.classList.add("tom-preview");
    const main = document.createElement("div");
    main.classList.add("tom-preview-main");
    const frame = document.createElement("div");
    frame.classList.add("tom-preview-frame");
    frame.append(document.createElement("img"));
    const name = document.createElement("div");
    name.classList.add("tom-name", "tom-preview-name");
    main.append(frame, name);
    const text = document.createElement("div");
    text.classList.add("tom-preview-text");
    preview.append(main, text);
    el.append(preview);

    const actors = el.querySelector(".tom-actors");
    actors.addEventListener("mouseover", event => {
      const item = event.target.closest(".tom-actor");
      if (!item || item.classList.contains("leaving")) return;
      if (event.relatedTarget && item.contains(event.relatedTarget)) return;
      this.#scheduleHoverPreview(el, item);
    });
    actors.addEventListener("mouseout", event => {
      const item = event.target.closest(".tom-actor");
      if (!item) return;
      if (event.relatedTarget && item.contains(event.relatedTarget)) return;
      this.#cancelHoverPreview(el, item.dataset.entryId);
    });
    actors.addEventListener("dragstart", () => this.#cancelHoverPreview(el));
  }

  static #scheduleHoverPreview(el, item) {
    const config = TomData.get(game.scenes?.active);
    if (!config?.preview?.enabled) return;
    clearTimeout(this.#hoverTimer);
    this.#hoverTimer = setTimeout(
      () => this.#openPreview(el, item),
      (config.preview.delay ?? 5) * 1000
    );
  }

  /** Close the preview / pending timer. With entryId only if it belongs to that actor. */
  static #cancelHoverPreview(el, entryId = null) {
    clearTimeout(this.#hoverTimer);
    if (this.#previewFor && (!entryId || this.#previewFor === entryId)) {
      this.#previewFor = null;
      el.querySelector(".tom-preview")?.classList.remove("open");
    }
  }

  static async #openPreview(el, item) {
    if (!item.isConnected || item.classList.contains("leaving")) return;
    const preview = el.querySelector(".tom-preview");
    const src = item.querySelector(".tom-portrait img")?.getAttribute("src");
    if (!preview || !src) return;
    const actor = fromUuidSync(item.dataset.uuid);
    preview.querySelector("img").src = src;
    preview.querySelector(".tom-preview-name").textContent = actor?.name ?? "";
    const accent = item.style.getPropertyValue("--tom-accent")
      || item.closest(".tom-group")?.style.getPropertyValue("--tom-accent");
    if (accent) preview.style.setProperty("--tom-accent", accent);
    else preview.style.removeProperty("--tom-accent");

    const textEl = preview.querySelector(".tom-preview-text");
    textEl.innerHTML = "";
    preview.classList.remove("has-text");
    preview.classList.toggle("text-left", game.settings.get(MODULE_ID, "codexSide") === "left");

    this.#previewFor = item.dataset.entryId;
    preview.classList.add("open");

    // Campaign Codex text arrives async (enrichHTML); guard against a preview
    // that closed or switched to another actor in the meantime.
    const token = this.#previewFor;
    const html = await this.#resolveCodexText(actor).catch(() => null);
    if (!html || this.#previewFor !== token || !preview.classList.contains("open")) return;
    textEl.innerHTML = html;
    preview.classList.add("has-text");
  }

  /**
   * Campaign Codex integration: returns the enriched HTML of the linked NPC
   * entry's configured field, or null when Campaign Codex is missing, no entry
   * links this actor, the field is empty, or the viewer may not see it.
   * Visibility: "description" (Info tab) is public presentation content;
   * "notes" are GM notes — players need OBSERVER permission on the journal.
   */
  static async #resolveCodexText(actor) {
    if (!actor || !game.modules.get("campaign-codex")?.active) return null;
    const journal = game.journal.find(j =>
      j.getFlag("campaign-codex", "type") === "npc" &&
      j.getFlag("campaign-codex", "data")?.linkedActor === actor.uuid);
    if (!journal) return null;

    const field = game.settings.get(MODULE_ID, "codexField");
    if (field === "notes" && !game.user.isGM
      && !journal.testUserPermission(game.user, "OBSERVER")) return null;

    const raw = journal.getFlag("campaign-codex", "data")?.[field];
    if (typeof raw !== "string" || !raw.replace(/<[^>]*>/g, "").trim()) return null;

    const TE = foundry.applications?.ux?.TextEditor?.implementation ?? TextEditor;
    return TE.enrichHTML(raw, { async: true, secrets: game.user.isGM });
  }

  /**
   * GM-only: drag portraits between group rows directly on the stage.
   * While a drag is active the rows become visible drop zones; dropping
   * re-assigns the actor's groupId (empty stage / default row = no group).
   */
  static #bindStageDrag(el) {
    const root = el.querySelector(".tom-actors");
    const clearHover = () =>
      root.querySelectorAll(".tom-group.drop-hover").forEach(r => r.classList.remove("drop-hover"));

    root.addEventListener("dragstart", event => {
      const item = event.target.closest(".tom-actor");
      if (!item) return;
      event.dataTransfer.setData("text/plain", JSON.stringify({ type: "TomActor", entryId: item.dataset.entryId }));
      event.dataTransfer.effectAllowed = "move";
      el.classList.add("tom-dragging");
    });

    root.addEventListener("dragend", () => {
      el.classList.remove("tom-dragging");
      clearHover();
    });

    root.addEventListener("dragover", event => {
      if (!el.classList.contains("tom-dragging")) return;
      const row = event.target.closest(".tom-group");
      if (!row) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (!row.classList.contains("drop-hover")) {
        clearHover();
        row.classList.add("drop-hover");
      }
    });

    root.addEventListener("drop", async event => {
      if (!el.classList.contains("tom-dragging")) return;
      el.classList.remove("tom-dragging");
      clearHover();
      const row = event.target.closest(".tom-group");
      if (!row) return;
      event.preventDefault();
      let data;
      try { data = JSON.parse(event.dataTransfer.getData("text/plain")); } catch { return; }
      if (data?.type !== "TomActor") return;
      const scene = game.scenes.active;
      const config = TomData.get(scene);
      const groupId = row.dataset.groupId || null;
      const entry = config.actors.find(a => a.id === data.entryId);
      if (!entry || (entry.groupId ?? null) === groupId) return;
      await TomData.update(scene, {
        actors: config.actors.map(a => a.id === data.entryId ? { ...a, groupId } : a)
      });
    });
  }

  static #render(config) {
    const existed = !!document.getElementById(OVERLAY_ID);
    const el = this.#ensureElement();

    el.style.setProperty("--tom-size", `${config.layout.size}px`);
    el.style.setProperty("--tom-gap", `${config.layout.gap}px`);
    el.style.setProperty("--tom-name-size", `${config.layout.nameSize}px`);
    el.style.setProperty("--tom-accent", config.border.color);
    el.style.setProperty("--tom-border-width", `${config.border.width}px`);
    el.style.setProperty("--tom-radius", SHAPE_RADIUS[config.border.shape] ?? "50%");
    el.classList.toggle("shape-portrait", config.border.shape === "portrait");

    el.classList.toggle("fx-letterbox", !!config.fx.letterbox);
    el.classList.toggle("fx-vignette", !!config.fx.vignette);
    el.classList.toggle("fx-kenburns", !!config.fx.kenburns);
    el.classList.toggle("fx-grain", !!config.fx.grain);
    el.classList.toggle("fx-parallax", !!config.fx.parallax);
    if (!config.fx.parallax) {
      el.querySelector(".tom-stage").style.transform = "";
      el.querySelector(".tom-actors").style.transform = "";
    }

    // Weather + color mood (single-choice classes)
    const weather = el.querySelector(".tom-weather");
    for (const w of WEATHERS) weather.classList.toggle(`weather-${w}`, config.fx.weather === w);
    for (const m of MOODS) el.classList.toggle(`mood-${m}`, config.fx.mood === m);

    const backdrop = config.backdrops.find(b => b.id === config.activeBackdrop) ?? config.backdrops[0];
    this.#updateBackdrop(el.querySelector(".tom-stage"), backdrop);
    this.#updateActors(el.querySelector(".tom-actors"), config);
    this.#updateTitle(el, config, !existed);
  }

  /* -------------------------------------------- */
  /*  Title card                                  */
  /* -------------------------------------------- */

  /**
   * Plays the cinematic title on activation and on backdrop switches (both
   * gated by the showOnActivate setting), and whenever the GM bumps the
   * title nonce ("show now" button) — synced to all clients through the
   * ordinary flag update. The shown text is the active backdrop's name.
   */
  static #updateTitle(el, config, isNew) {
    const nonce = config.title?.nonce ?? null;
    const auto = config.title?.showOnActivate !== false;
    const activeId = config.activeBackdrop ?? config.backdrops[0]?.id ?? null;
    if (isNew) {
      this.#lastTitleNonce = nonce;
      this.#lastBackdropId = activeId;
      if (auto) this.#playTitle(el, config);
      return;
    }
    let play = false;
    if (nonce !== this.#lastTitleNonce) {
      this.#lastTitleNonce = nonce;
      play = true;
    }
    if (activeId !== this.#lastBackdropId) {
      this.#lastBackdropId = activeId;
      if (auto) play = true;
    }
    if (play) this.#playTitle(el, config);
  }

  static #playTitle(el, config) {
    const title = el.querySelector(".tom-title");
    const backdrop = config.backdrops.find(b => b.id === config.activeBackdrop) ?? config.backdrops[0];
    const text = backdrop?.name?.trim()
      || config.title?.text?.trim()
      || game.scenes?.active?.name
      || "";
    if (!text) return;
    title.textContent = text;
    title.classList.remove("playing");
    void title.offsetWidth; // restart the CSS animation
    title.classList.add("playing");
    clearTimeout(this.#titleTimer);
    this.#titleTimer = setTimeout(() => title.classList.remove("playing"), 5600);
  }

  /** Swap the backdrop with a crossfade when its source changed. */
  static #updateBackdrop(stage, backdrop) {
    const current = stage.querySelector(".tom-backdrop.current");
    const src = backdrop?.src ?? null;
    if ((current?.dataset.src ?? null) === src) return;

    if (current) {
      current.classList.remove("current");
      current.classList.add("fading-out");
      setTimeout(() => current.remove(), CROSSFADE_MS + 100);
    }
    if (!src) return;

    let node;
    if (VIDEO_RX.test(src)) {
      node = document.createElement("video");
      node.muted = true;
      node.loop = true;
      node.autoplay = true;
      node.playsInline = true;
      node.src = src;
    } else {
      node = document.createElement("img");
      node.src = src;
      node.alt = backdrop.name ?? "";
    }
    node.classList.add("tom-backdrop", "current");
    node.dataset.src = src;
    stage.append(node);
  }

  /* -------------------------------------------- */
  /*  Actor strip (grouped + diffed)              */
  /* -------------------------------------------- */

  /**
   * The `.tom-actors` root holds one `.tom-group` row per faction group,
   * positioned at its configured stage height, plus a default row that
   * behaves like the classic bottom strip for unassigned actors.
   */
  static #updateActors(root, config) {
    const visible = config.actors.filter(a => !a.hidden && fromUuidSync(a.uuid));
    root.classList.toggle("has-speaker", visible.some(a => a.speaking));

    const groupIds = new Set(config.groups.map(g => g.id));

    // Drop rows of deleted groups (their members re-enter in the default row)
    for (const row of root.querySelectorAll(":scope > .tom-group")) {
      const key = row.dataset.groupId;
      if (key !== "" && !groupIds.has(key)) row.remove();
    }

    // Default row: classic full-stage strip driven by the global layout
    const defRow = this.#ensureGroupRow(root, "");
    defRow.classList.add("tom-group-default");
    const defInner = defRow.querySelector(".tom-group-actors");
    defInner.style.justifyContent = config.layout.justify;
    defInner.style.alignItems = this.#alignToFlex(config.layout.align);

    // Faction rows
    for (const g of config.groups) {
      const row = this.#ensureGroupRow(root, g.id);
      row.style.top = `${Math.min(100, Math.max(0, g.y))}%`;
      row.style.setProperty("--tom-group-scale", g.scale ?? 1);
      if (g.color) row.style.setProperty("--tom-accent", g.color);
      else row.style.removeProperty("--tom-accent");
      const label = row.querySelector(".tom-group-label");
      label.textContent = g.name ?? "";
      label.style.display = (g.showLabel && g.name) ? "" : "none";
      label.style.alignSelf =
        { "flex-start": "flex-start", "flex-end": "flex-end" }[g.justify] ?? "center";
      row.querySelector(".tom-group-actors").style.justifyContent = g.justify;
    }

    // Global item map so actors can move between rows without losing their node
    const existing = new Map(
      [...root.querySelectorAll(".tom-actor:not(.leaving)")].map(n => [n.dataset.entryId, n])
    );

    // Exit: entries no longer visible sink out, then get removed
    const keep = new Set(visible.map(a => a.id));
    for (const [id, node] of existing) {
      if (keep.has(id)) continue;
      existing.delete(id);
      this.#cancelHoverPreview(root.closest(`#${OVERLAY_ID}`), id);
      node.classList.add("leaving");
      setTimeout(() => node.remove(), EXIT_MS + 100);
    }

    // Partition visible actors into their rows, in configured order
    const byGroup = new Map([["", []]]);
    for (const g of config.groups) byGroup.set(g.id, []);
    for (const entry of visible) {
      const key = entry.groupId && groupIds.has(entry.groupId) ? entry.groupId : "";
      byGroup.get(key).push(entry);
    }

    const initial = existing.size === 0;
    let stagger = 0;
    for (const [key, members] of byGroup) {
      const inner = this.#ensureGroupRow(root, key).querySelector(".tom-group-actors");
      const ordered = members.map(entry => {
        const actor = fromUuidSync(entry.uuid);
        let item = existing.get(entry.id);
        if (!item) item = this.#buildActorItem(entry, initial ? stagger++ : 0);
        this.#syncActorItem(item, entry, actor, config);
        return item;
      });
      // Minimal DOM moves; settled nodes have their animation disabled by class
      const liveNodes = () => [...inner.children].filter(n => !n.classList.contains("leaving"));
      ordered.forEach((item, i) => {
        const current = liveNodes()[i];
        if (current === item) return;
        inner.insertBefore(item, current ?? null);
      });
    }
  }

  static #ensureGroupRow(root, key) {
    let row = root.querySelector(`:scope > .tom-group[data-group-id="${key}"]`);
    if (row) return row;
    row = document.createElement("div");
    row.classList.add("tom-group");
    row.dataset.groupId = key;
    const label = document.createElement("div");
    label.classList.add("tom-group-label");
    label.style.display = "none";
    const inner = document.createElement("div");
    inner.classList.add("tom-group-actors");
    row.append(label, inner);
    root.append(row);
    return row;
  }

  static #buildActorItem(entry, staggerIndex) {
    const item = document.createElement("figure");
    item.classList.add("tom-actor");
    item.dataset.entryId = entry.id;
    item.style.animationDelay = `${staggerIndex * 140}ms`;
    item.addEventListener("animationend", event => {
      if (event.target !== item || item.classList.contains("leaving")) return;
      // Class instead of inline styles, so state rules (speaker dim) still apply
      item.classList.add("settled");
    });

    const frame = document.createElement("div");
    frame.classList.add("tom-portrait");
    frame.append(document.createElement("img"));
    item.append(frame);
    return item;
  }

  static #syncActorItem(item, entry, actor, config) {
    item.dataset.uuid = entry.uuid;
    item.draggable = game.user.isGM;
    item.classList.toggle("clickable", actor.testUserPermission(game.user, "LIMITED"));
    item.classList.toggle("speaking", !!entry.speaking);
    item.style.setProperty("--tom-actor-scale", entry.scale || 1);
    if (entry.color) item.style.setProperty("--tom-accent", entry.color);
    else item.style.removeProperty("--tom-accent");

    const img = item.querySelector(".tom-portrait img");
    const src = entry.img || actor.img || "icons/svg/mystery-man.svg";
    if (img.getAttribute("src") !== src) img.src = src;
    img.alt = actor.name;

    let name = item.querySelector(".tom-name");
    if (config.layout.showNames) {
      if (!name) {
        name = document.createElement("figcaption");
        name.classList.add("tom-name");
        item.append(name);
      }
      if (name.textContent !== actor.name) name.textContent = actor.name;
    } else {
      name?.remove();
    }
  }

  static #alignToFlex(align) {
    return { start: "flex-start", center: "center", end: "flex-end" }[align] ?? "flex-end";
  }
}
