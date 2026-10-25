// Live mode: Hermes's real HTTP API (api_server, docs: /docs/user-guide/features/api-server) for chat,
// sessions, models and jobs. One listener serves every profile when gateway.multiplex_profiles is on:
// /p/<profile>/... with that profile's own API_SERVER_KEY.
// Without hermes-bridge the roster is kept on the phone (the API server can't list profiles) and bots
// are added by hand. With a bridge key set, the roster comes from the server's profile list, "new bot"
// creates a real profile (its key is stored here, shown nowhere), and MCP / plugins / cron / skills /
// toolsets / memory settings go through the bridge.
import { toJob } from "./job-text";
import {
  AVATAR_COLORS, AVATAR_EMOJI, type Backend, BOT_CHAT_TITLE, type Bot, type BridgeFeature, ComingSoonError, type Job,
  type McpCatalogEntry, type McpServer, type MemoryStatus, type ModelOption, type PluginCatalog, type NewBot, type NewMcp, type Plugin, type SessionInfo, type Skill,
  STARTER_TOOLSETS, type Toolset,
} from "./backend";
import { BridgeClient, BridgeError } from "./bridge";
import { bridgeTarget, type HermesConfig } from "./config";
import { HermesClient, HermesError } from "./hermes";
import { saveLook, withLook } from "./appearance";
import * as Store from "./secure";

const ROSTER_KEY = "hermes.roster";
// Per profile: the session this bot's single chat lives in, and whether that profile's "Bot Chat"
// refused phone turns (then the bot keeps its own phone session).
const CHAT_KEY = (profile: string) => `hermes.botchat.${profile}`;
const OWN_KEY = (profile: string) => `hermes.botchat.own.${profile}`;
const titleTaken = (e: unknown) => e instanceof HermesError && e.status === 400 && e.code === "invalid_title";
const arr = (r: any, ...keys: string[]): any[] => (Array.isArray(r) ? r : keys.map((k) => r?.[k]).find(Array.isArray) ?? []);

const BRIDGE_FEATURES: BridgeFeature[] = ["createBot", "editPersona", "toggleToolsets", "toggleSkills", "memory", "mcp", "plugins"];
/** Hermes profile ids: lowercase folder names (hermes_cli/profiles.py; the bridge checks the same rule). */
export const PROFILE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export const profileIdFrom = (name: string) =>
  name.trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_-]+/g, "-").replace(/^[-_]+|[-_]+$/g, "").slice(0, 64);
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const pretty = (id: string) => id.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const errText = (e: unknown) => String((e as any)?.message ?? e);

export class LiveBackend implements Backend {
  kind = "live" as const;
  private bridge: BridgeClient | null;
  private problem: string | null = null;
  constructor(private cfg: HermesConfig) {
    const t = bridgeTarget(cfg);
    this.bridge = t ? new BridgeClient({ ...t, cfClientId: cfg.cfClientId, cfClientSecret: cfg.cfClientSecret }) : null;
  }
  supports(f: BridgeFeature) { return this.bridge !== null && BRIDGE_FEATURES.includes(f); }
  notice() { return this.problem; }
  private need(f: BridgeFeature): BridgeClient { if (!this.bridge) throw new ComingSoonError(f); return this.bridge; }

  private client(b: Bot) {
    if (b.needsKey) throw new Error(`${b.name} isn't set up for chat on this phone yet. Open it and tap "Set up chat".`);
    return new HermesClient({ ...this.cfg, apiKey: b.apiKey || this.cfg.apiKey, profile: b.profile, model: b.model, provider: b.provider });
  }
  private async roster(): Promise<Bot[]> {
    const raw = await Store.getItem(ROSTER_KEY);
    const bots: Bot[] = raw ? JSON.parse(raw) : [];
    if (!bots.some((b) => b.profile === "default"))
      bots.unshift({ id: "default", profile: "default", name: "Hermes", emoji: "🪽", color: "#2a3f5c", shape: "squircle", description: "Your main Hermes agent" });
    return Promise.all(bots.map((b) => withLook(Store, b))); // look (shape/colours/eyes) is kept per profile on the phone
  }
  private async saveRoster(bots: Bot[]) { await Store.setItem(ROSTER_KEY, JSON.stringify(bots)); }

  /** Without the bridge: the phone's roster. With it: every server profile, merged with what the phone
   *  knows (look, display name, chat key). A profile without a key here is shown as needing setup. */
  async listBots(): Promise<Bot[]> {
    const local = await this.roster();
    if (!this.bridge) return local;
    let profiles;
    try { profiles = await this.bridge.profiles(); this.problem = null; }
    catch (e) { this.problem = `hermes-bridge: ${errText(e)} Showing the bots saved on this phone.`; return local; }
    const mine = new Map(local.map((b) => [b.profile, b]));
    const order = [...profiles].sort((a, b) => Number(b.id === "default") - Number(a.id === "default"));
    return Promise.all(order.map((p) => {
      const known = mine.get(p.id);
      const h = hash(p.id);
      const base: Bot = known ?? {
        id: p.id, profile: p.id, name: p.display_name && p.display_name !== p.id ? p.display_name : pretty(p.id),
        emoji: AVATAR_EMOJI[h % AVATAR_EMOJI.length], color: AVATAR_COLORS[h % AVATAR_COLORS.length], shape: "rounded",
        description: p.description || `Hermes profile ${p.id}`,
      };
      return withLook(Store, { ...base, needsKey: p.id !== "default" && !known?.apiKey });
    }));
  }

  /** Bridge: create the Hermes profile (persona -> SOUL.md, model), keep its new API key on the phone,
   *  then set the starter toolsets (best effort; the profile exists either way). */
  async createBot(n: NewBot): Promise<Bot> {
    const bridge = this.need("createBot");
    const id = profileIdFrom(n.profile || n.name);
    if (!PROFILE_ID_RE.test(id) || id === "default") throw new Error("Give the bot a name with letters or digits (its Hermes profile id is made from it).");
    const r = await bridge.createProfile({ name: id, description: n.description.trim() || undefined, soul: n.persona?.trim() || undefined, model: n.model, provider: n.provider });
    const bot: Bot = { id, profile: id, name: n.name.trim() || pretty(id), emoji: n.emoji, color: n.color, color2: n.color2, shape: n.shape, eyes: n.eyes,
      description: n.description.trim() || `Hermes profile ${id}`, apiKey: r.api_key };
    await this.addExistingBot(bot);
    try {
      const have = await bridge.toolsets(id);
      for (const t of have) {
        if (!STARTER_TOOLSETS.some(([name]) => name === t.name)) continue;
        const want = n.toolsets.includes(t.name);
        if (Boolean(t.enabled) !== want) await bridge.setToolset(id, t.name, want);
      }
    } catch { /* toolsets can be changed later in the bot's settings */ }
    return bot;
  }

  /** Bridge: give this phone a chat key for a server profile. Rotates that profile's API_SERVER_KEY,
   *  so anything else using the old key for this profile stops working. */
  async setupChat(b: Bot): Promise<Bot> {
    const r = await this.need("createBot").rotateKey(b.profile);
    const bot: Bot = { ...b, apiKey: r.api_key, needsKey: false };
    await this.addExistingBot(bot);
    return bot;
  }
  async addExistingBot(b: Bot) { const { needsKey: _, ...keep } = b; await saveLook(Store, b.profile, b); const bots = await this.roster(); await this.saveRoster([...bots.filter((x) => x.id !== b.id), keep]); return b; }
  /** Edits a bot's phone-side details; a server profile seen only through the bridge joins the roster here. */
  async getPersona(b: Bot) {
    try { return (await this.need("editPersona").soul(b.profile)).content ?? ""; }
    catch (e: any) {
      if (e?.status === 404 && e?.code !== "unknown_profile") throw new Error("Update hermes-bridge on the homelab to see and edit SOUL.md here.");
      throw e;
    }
  }
  async getUsage(b: Bot, days = 30) {
    if (!this.bridge) throw new ComingSoonError("memory");
    const r = await this.bridge.usage(b.profile, days);
    const t = r.totals ?? {}, n = (k: string) => Number(t[k] ?? 0) || 0;
    return { days: r.days, input: n("total_input"), output: n("total_output"), costUsd: n("total_actual_cost") || n("total_estimated_cost"), sessions: n("total_sessions"), apiCalls: n("total_api_calls") };
  }
  async setPersona(b: Bot, text: string) { await this.need("editPersona").setSoul(b.profile, text); }
  async updateBot(b: Bot) {
    const { needsKey: _, ...keep } = b;
    await saveLook(Store, b.profile, b);
    const bots = await this.roster();
    await this.saveRoster(bots.some((x) => x.id === b.id) ? bots.map((x) => (x.id === b.id ? keep : x)) : [...bots, keep]);
    return b;
  }
  async removeBot(id: string) { if (id === "default") return; await this.saveRoster((await this.roster()).filter((b) => b.id !== id)); }
  chat(b: Bot) { return this.client(b); }

  /** The one session this bot chats in. Order: the id stored for this profile (if it still exists) ->
   *  the profile's canonical "Bot Chat" (exact-title lookup incl. hidden rows, as `hermes peer dm` does;
   *  Hermes titles are unique, so never blindly create a second one) -> create "Bot Chat" -> if the
   *  title is taken by a row we can't see, or the Bot Chat refused phone turns before, a phone session
   *  "<name> · Hermes Mobile" (suffixed on collision, untitled as a last resort). */
  async botChatSession(b: Bot) {
    const c = this.client(b);
    const cached = await Store.getItem(CHAT_KEY(b.profile));
    if (cached && (await c.sessionExists(cached))) return cached;
    let id: string | undefined;
    if ((await Store.getItem(OWN_KEY(b.profile))) !== "1") {
      id = await c.findSessionByTitle(BOT_CHAT_TITLE);
      if (!id) {
        try { id = await c.createSession(BOT_CHAT_TITLE); }
        catch (e) { if (!titleTaken(e)) throw e; }
      }
    }
    id ??= await this.phoneSession(b);
    await Store.setItem(CHAT_KEY(b.profile), id);
    return id;
  }

  /** The Bot Chat refused a phone turn (owned by another login/client): move this bot to a phone session. */
  async abandonBotChat(b: Bot) {
    await Store.setItem(OWN_KEY(b.profile), "1");
    await Store.deleteItem(CHAT_KEY(b.profile));
  }
  /** Forget a stored session id that no longer exists. */
  async forgetSession(b: Bot) { await Store.deleteItem(CHAT_KEY(b.profile)); }

  async checkProfile(profile: string, apiKey: string) {
    if (!(await HermesClient.profileServed(this.cfg, profile)))
      throw new Error(`Hermes isn't serving a profile named "${profile}". Names are the lowercase folder names in ~/.hermes/profiles; check gateway.multiplex_profiles is on and the profile isn't standalone or parked.`);
    try { await new HermesClient({ ...this.cfg, apiKey, profile }).call("/api/sessions?limit=1"); }
    catch (e) {
      if (e instanceof HermesError && e.status === 401)
        throw new Error(`That isn't ${profile}'s key. Each profile needs its own API_SERVER_KEY in ~/.hermes/profiles/${profile}/.env (the main key isn't accepted under /p/${profile}/), then restart the gateway.`);
      throw e;
    }
  }

  private async phoneSession(b: Bot): Promise<string> {
    const c = this.client(b);
    const base = `${(b.name || b.profile).trim()} · Hermes Mobile`;
    const mine = await c.findSessionByTitle(base);
    if (mine) return mine;
    for (let i = 2; i <= 6; i++) {
      try { return await c.createSession(i === 2 ? base : `${base} (${i - 1})`); }
      catch (e) { if (!titleTaken(e)) throw e; }
    }
    return c.createSession(); // untitled: Hermes leaves the title empty, no uniqueness check
  }
  async createTopic(b: Bot, title: string) { await this.client(b).createSession(title); }
  async updateSession(b: Bot, id: string, patch: { title?: string; archived?: boolean }) {
    await this.client(b).call(`/api/sessions/${encodeURIComponent(id)}`, "PATCH", patch);
  }
  async listSessions(b: Bot): Promise<SessionInfo[]> {
    const r = await this.client(b).call(`/api/sessions?limit=50`);
    return arr(r, "sessions", "data", "items").map((s) => ({ id: String(s.id ?? s.session_id), title: String(s.title || s.preview || "Untitled"), updated: s.updated_at ?? s.last_active }));
  }
  async listModels(b: Bot): Promise<ModelOption[]> {
    // Only providers Hermes has credentials for (the default also lists unconfigured skeleton rows).
    const r: any = await this.client(b).call("/api/model/options?include_unconfigured=false");
    const out: ModelOption[] = [];
    const providers = arr(r, "providers", "data").filter((p: any) => p?.authenticated !== false);
    // The profile's current provider first, like the dashboard picker.
    providers.sort((a: any, b: any) => Number(!!b?.is_current) - Number(!!a?.is_current));
    for (const p of providers) for (const m of arr(p, "models")) {
      const id = typeof m === "string" ? m : m.id ?? m.name;
      if (id) out.push({ id, provider: p.slug ?? p.id ?? p.name, providerName: p.name ?? p.slug, label: `${id}${p.name ? ` · ${p.name}` : ""}` });
    }
    return out;
  }
  async listSkills(b: Bot): Promise<Skill[]> {
    const rows = this.bridge ? await this.bridge.skills(b.profile) : arr(await this.client(b).call("/v1/skills"), "skills", "data");
    return rows.map((s: any) => ({ name: s.name, description: s.description ?? "", category: s.category, enabled: s.enabled }));
  }
  async setSkill(b: Bot, name: string, enabled: boolean) { await this.need("toggleSkills").setSkill(b.profile, name, enabled); }
  async listToolsets(b: Bot): Promise<Toolset[]> {
    const rows = this.bridge ? await this.bridge.toolsets(b.profile) : arr(await this.client(b).call("/v1/toolsets"), "toolsets", "data");
    return rows.map((t: any) => ({ name: t.name, label: t.label ?? t.name, description: t.description ?? "", enabled: Boolean(t.enabled) }));
  }
  async setToolset(b: Bot, name: string, enabled: boolean) { await this.need("toggleToolsets").setToolset(b.profile, name, enabled); }

  // Jobs: listed, paused/resumed and run through the bridge when there is one (works for profiles
  // without a chat key); otherwise the API server's /api/jobs. Create/delete use the API server.
  async listJobs(b: Bot): Promise<Job[]> {
    if (this.bridge) return (await this.bridge.jobs(b.profile)).map(toJob);
    return arr(await this.client(b).call("/api/jobs?include_disabled=true"), "jobs", "data").map(toJob); // paused jobs are disabled ones
  }
  async createJob(b: Bot, j: { name: string; schedule: string; prompt: string }) {
    return toJob(await this.client(b).call("/api/jobs", "POST", { name: j.name, schedule: j.schedule, prompt: j.prompt, deliver: "bot-chat" }));
  }
  async setJobPaused(b: Bot, id: string, paused: boolean) {
    if (this.bridge) { await this.bridge.jobAction(b.profile, id, paused ? "pause" : "resume"); return; }
    await this.client(b).call(`/api/jobs/${encodeURIComponent(id)}/${paused ? "pause" : "resume"}`, "POST", {});
  }
  async runJob(b: Bot, id: string) {
    if (this.bridge) { await this.bridge.jobAction(b.profile, id, "trigger"); return; }
    await this.client(b).call(`/api/jobs/${encodeURIComponent(id)}/run`, "POST", {});
  }
  async updateJob(b: Bot, id: string, j: { name: string; schedule: string; prompt: string }) {
    await this.client(b).call(`/api/jobs/${encodeURIComponent(id)}`, "PATCH", { name: j.name, schedule: j.schedule, prompt: j.prompt });
  }
  async deleteJob(b: Bot, id: string) { await this.client(b).call(`/api/jobs/${encodeURIComponent(id)}`, "DELETE"); }

  // Memory text (MEMORY.md / USER.md) has no Hermes API; the bridge reports provider + file sizes.
  async getMemory(): Promise<never> { throw new ComingSoonError("memory"); }
  async setMemory(): Promise<never> { throw new ComingSoonError("memory"); }
  async getMemoryStatus(b: Bot): Promise<MemoryStatus> {
    const m = await this.need("memory").memory(b.profile);
    return { active: m.active && m.active !== "builtin" ? m.active : "", providers: (m.providers ?? []).map((p) => ({ name: p.name, description: p.description ?? "", available: Boolean(p.available), configured: Boolean(p.configured), status: p.status })),
      files: { memory: Number(m.builtin_files?.memory ?? 0), user: Number(m.builtin_files?.user ?? 0) } };
  }

  async listMcp(b: Bot): Promise<McpServer[]> {
    return (await this.need("mcp").mcp(b.profile)).map((s) => ({ name: s.name, url: s.url || [s.command, ...(s as any).args ?? []].filter(Boolean).join(" ") || s.transport,
      enabled: Boolean(s.enabled), hasAuth: Boolean(s.auth && s.auth !== "none") }));  // upstream `tools` is a selection filter, not a count
  }
  async addMcp(b: Bot, m: NewMcp) {
    const token = m.authHeader?.trim();
    await this.need("mcp").addMcp(b.profile, { name: m.name, url: m.url, auth: token ? "header" : "none", ...(token ? { bearer_token: token } : {}) });
  }
  async setMcpEnabled(b: Bot, name: string, enabled: boolean) { await this.need("mcp").setMcpEnabled(b.profile, name, enabled); }
  async removeMcp(b: Bot, name: string) { await this.need("mcp").removeMcp(b.profile, name); }
  async restartGateway() { await this.need("mcp").restartGateway(); }

  /** Installed plugins (status per profile) with the tools of the toolset of the same name. Hermes's
   *  dashboard API toggles plugins only for the profile it runs as; other profiles get the CLI command. */
  async listPlugins(b: Bot): Promise<Plugin[]> {
    const r = await this.need("plugins").plugins(b.profile);
    return (r.plugins ?? []).map((p) => ({ name: p.name, kind: "tools", description: p.description ?? "", version: p.version ?? "", installed: true,
      enabled: Boolean(p.enabled), tools: p.tools ?? [], skills: [], source: p.source ?? undefined,
      toggleHint: r.toggle_supported ? undefined : `hermes -p ${b.profile} plugins ${p.enabled ? "disable" : "enable"} ${p.name}` }));
  }
  async installPlugin(b: Bot, name: string) {
    let r;
    try { r = await this.need("plugins").installCatalogPlugin(b.profile, name); }
    catch (e) {
      if (e instanceof BridgeError && e.status === 404 && e.code !== "plugin_install_unsupported") throw new Error(`This hermes-bridge can't install plugins yet (update it), or run on the server: hermes -p ${b.profile} plugins install ${name}`);
      if (e instanceof BridgeError) throw new Error(e.message);
      throw e;
    }
    if (r?.consent_required) throw new Error(`Hermes wants a confirmation for ${name} first. Run on the server: hermes -p ${b.profile} plugins install ${name}`);
  }
  async listPluginCatalog(b: Bot): Promise<PluginCatalog> {
    let r;
    try { r = await this.need("plugins").pluginCatalog(b.profile); }
    catch (e) { if (e instanceof BridgeError && e.status === 404) throw new Error("The marketplace needs a newer hermes-bridge (0.2+) on the server."); throw e; }
    return { installSupported: Boolean(r.install_supported), entries: (r.entries ?? []).map((e) => ({ name: e.name, title: e.title || e.name, description: e.description ?? "",
      maintainer: e.maintainer ?? undefined, tier: e.tier ?? undefined, category: e.category ?? undefined, version: e.version ?? undefined, installed: Boolean(e.installed),
      updateAvailable: Boolean(e.update_available), requiresEnv: e.requires_env ?? [], tools: e.provides_tools ?? [] })) };
  }
  async listMcpCatalog(b: Bot): Promise<McpCatalogEntry[]> {
    return (await this.need("mcp").mcpCatalog(b.profile)).map((e) => ({ name: e.name, description: e.description ?? "", transport: e.transport ?? "", authType: e.auth_type ?? "none",
      requiredEnv: (e.required_env ?? []).map((v) => ({ name: v.name, prompt: v.prompt, required: v.required !== false })), installed: Boolean(e.installed), enabled: Boolean(e.enabled),
      command: e.command ?? undefined, url: e.url ?? undefined }));
  }
  async installMcpCatalog(b: Bot, name: string, env: Record<string, string>) { await this.need("mcp").installMcpCatalog(b.profile, name, env); }
  async setPluginEnabled(b: Bot, name: string, enabled: boolean) {
    try { await this.need("plugins").pluginAction(b.profile, name, enabled ? "enable" : "disable"); }
    catch (e) { if (e instanceof BridgeError && e.code === "plugin_toggle_unsupported") throw new Error(e.message); throw e; }
  }
}

// Hermes cron records (cron/jobs.py _normalize_job_record): id, name, prompt, schedule{expr,...},
// schedule_display, state ("scheduled"/"paused"/...), enabled, paused_at, next_run_at, last_run_at, last_status.
