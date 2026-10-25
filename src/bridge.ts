// Client for hermes-bridge (the optional management API next to Hermes; see its README).
// Shapes match hermes-bridge 0.1.0 (/v1/...). The bridge has its own key: the Hermes API key is
// never sent to it, and the bridge key is never sent to Hermes.
import { fetch } from "expo/fetch";

export type BridgeTarget = { url: string; key: string; cfClientId?: string; cfClientSecret?: string };

export class BridgeError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "BridgeError";
  }
}

export type BridgeProfile = {
  id: string; display_name: string; description: string; is_default: boolean;
  model?: string | null; provider?: string | null; gateway_running: boolean; skill_count?: number | null;
  api_key_set: boolean | null;
};
export type BridgeStatus = { ok: boolean; code?: string; message?: string; warning?: string | null; hermes?: { version?: string; release_date?: string } };
export type BridgeMcp = { name: string; transport: string; url?: string | null; command?: string | null; auth?: string | null; enabled: boolean; tools?: string[] | null; source?: string; plugin?: string | null };
export type BridgeJob = { id: string; name?: string; prompt?: string; schedule?: unknown; schedule_display?: string; state?: string; enabled?: boolean; paused_at?: string | null; next_run_at?: string | null; last_run_at?: string | null; last_status?: string | null };
export type BridgeSkill = { name: string; description?: string; category?: string; enabled?: boolean; provenance?: string };
export type BridgeToolset = { name: string; label?: string; description?: string; enabled?: boolean; configured?: boolean; tools?: string[] };
export type BridgePlugin = { name: string; version?: string | null; description: string; source?: string | null; runtime_status?: string | null; enabled: boolean; auth_required: boolean; tools: string[] };
export type BridgeCatalogPlugin = { name: string; title?: string | null; description?: string | null; maintainer?: string | null; tier?: string | null;
  category?: string | null; version?: string | null; installed?: boolean; update_available?: boolean; requires_env?: string[]; provides_tools?: string[] };
export type BridgeMcpCatalogEntry = { name: string; description?: string; transport?: string; auth_type?: string;
  required_env?: { name: string; prompt?: string; required?: boolean }[]; installed?: boolean; enabled?: boolean; command?: string | null; url?: string | null };
export type BridgeMemory = { active: string; providers: { name: string; description: string; available: boolean; configured: boolean; status?: string }[]; builtin_files: { memory?: number; user?: number } };

const enc = encodeURIComponent;

export class BridgeClient {
  constructor(private t: BridgeTarget) {}

  async req<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    const h: Record<string, string> = { Authorization: `Bearer ${this.t.key}`, Accept: "application/json" };
    if (body !== undefined) h["Content-Type"] = "application/json";
    if (this.t.cfClientId && this.t.cfClientSecret) { h["CF-Access-Client-Id"] = this.t.cfClientId; h["CF-Access-Client-Secret"] = this.t.cfClientSecret; }
    let res: Response;
    try { res = await fetch(this.t.url + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }) as unknown as Response; }
    catch (e: any) { throw new BridgeError(0, "unreachable", `Can't reach hermes-bridge at ${this.t.url} (${e?.message ?? e}).`); }
    const text = await res.text();
    let j: any = null;
    try { j = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok) {
      const code = j?.error?.code ?? j?.code ?? String(res.status);
      const msg = j?.error?.message ?? j?.message ?? (res.status === 404 && !j ? `No hermes-bridge at ${this.t.url}.` : `HTTP ${res.status}`);
      throw new BridgeError(res.status, code, res.status === 401 && code === "unauthorized" ? "hermes-bridge refused the bridge key. Copy it again from your server." : msg);
    }
    return j as T;
  }
  private p(profile: string, rest = "") { return `/v1/profiles/${enc(profile)}${rest}`; }

  /** The bridge's compatibility report; a 503 still carries it ({ok:false, code, message}). */
  async status(): Promise<BridgeStatus> {
    try { return await this.req<BridgeStatus>("GET", "/v1/status"); }
    catch (e) { if (e instanceof BridgeError && e.status === 503) return { ok: false, code: e.code, message: e.message }; throw e; }
  }
  async profiles() { return (await this.req<{ profiles: BridgeProfile[] }>("GET", "/v1/profiles")).profiles ?? []; }
  createProfile(b: { name: string; description?: string; soul?: string; model?: string; provider?: string }) {
    return this.req<{ profile: { id: string }; api_key: string }>("POST", "/v1/profiles", b);
  }
  /** The profile's SOUL.md (bridge 0.3+: GET/PUT /v1/profiles/<p>/soul). */
  soul(profile: string) { return this.req<{ content: string; exists: boolean }>("GET", this.p(profile, "/soul")); }
  setSoul(profile: string, content: string) { return this.req("PUT", this.p(profile, "/soul"), { content }); }
  /** Token and cost totals (bridge 0.3+: GET /v1/profiles/<p>/usage). */
  usage(profile: string, days = 30) { return this.req<{ days: number; totals: Record<string, number | null> }>("GET", this.p(profile, `/usage?days=${days}`)); }
  rotateKey(profile: string) { return this.req<{ api_key: string }>("POST", this.p(profile, "/key"), {}); }
  restartGateway() { return this.req("POST", "/v1/gateway/restart", {}); }

  async mcp(profile: string) { return (await this.req<{ servers: BridgeMcp[] }>("GET", this.p(profile, "/mcp"))).servers ?? []; }
  addMcp(profile: string, s: { name: string; url: string; auth: "none" | "header"; bearer_token?: string }) { return this.req("POST", this.p(profile, "/mcp"), s); }
  setMcpEnabled(profile: string, name: string, enabled: boolean) { return this.req("PUT", this.p(profile, `/mcp/${enc(name)}/enabled`), { enabled }); }
  removeMcp(profile: string, name: string) { return this.req("DELETE", this.p(profile, `/mcp/${enc(name)}`)); }

  async jobs(profile: string) { return (await this.req<{ jobs: BridgeJob[] }>("GET", this.p(profile, "/jobs"))).jobs ?? []; }
  jobAction(profile: string, id: string, action: "pause" | "resume" | "trigger") { return this.req("POST", this.p(profile, `/jobs/${enc(id)}/${action}`), {}); }

  async skills(profile: string) { return (await this.req<{ skills: BridgeSkill[] }>("GET", this.p(profile, "/skills"))).skills ?? []; }
  setSkill(profile: string, name: string, enabled: boolean) { return this.req("PUT", this.p(profile, "/skills/enabled"), { name, enabled }); }
  async toolsets(profile: string) { return (await this.req<{ toolsets: BridgeToolset[] }>("GET", this.p(profile, "/toolsets"))).toolsets ?? []; }
  setToolset(profile: string, name: string, enabled: boolean) { return this.req("PUT", this.p(profile, `/toolsets/${enc(name)}/enabled`), { enabled }); }

  plugins(profile: string) { return this.req<{ plugins: BridgePlugin[]; toggle_supported: boolean }>("GET", this.p(profile, "/plugins")); }
  pluginAction(profile: string, name: string, action: "enable" | "disable") { return this.req("POST", this.p(profile, `/plugins/${enc(name)}/${action}`), {}); }

  pluginCatalog(profile: string) { return this.req<{ entries: BridgeCatalogPlugin[]; install_supported: boolean }>("GET", this.p(profile, "/plugin-catalog")); }
  installCatalogPlugin(profile: string, name: string) { return this.req<{ ok?: boolean; consent_required?: boolean; error?: string }>("POST", this.p(profile, "/plugin-catalog/install"), { name }); }
  async mcpCatalog(profile: string) { return (await this.req<{ entries: BridgeMcpCatalogEntry[] }>("GET", this.p(profile, "/mcp-catalog"))).entries ?? []; }
  installMcpCatalog(profile: string, name: string, env: Record<string, string>) { return this.req("POST", this.p(profile, "/mcp-catalog/install"), { name, env, enable: true }); }

  memory(profile: string) { return this.req<BridgeMemory>("GET", this.p(profile, "/memory")); }
}
