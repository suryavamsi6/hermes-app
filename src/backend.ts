// The app talks to a Backend. LiveBackend uses Hermes's real HTTP API (api_server) and, when a
// hermes-bridge key is set, the bridge for what the API server doesn't offer (profiles, keys, MCP,
// plugins, cron, skills, memory settings). DemoBackend is fully offline.
import type { EyeStyle, ShapeId } from "./appearance";
import type { ChatClient } from "./hermes";

export type Bot = {
  id: string;            // stable app id
  profile: string;       // Hermes profile name ("default" = launch profile)
  name: string;
  emoji: string;
  color: string;         // avatar fill (gradient start when color2 is set)
  color2?: string;       // optional gradient end
  shape?: ShapeId;       // avatar tile shape (default "rounded")
  eyes?: EyeStyle;       // face style override; "auto"/undefined = derived from id
  description: string;   // one-liner shown on Home
  persona?: string;      // SOUL.md text (bridge feature in live mode)
  model?: string;        // per-request override (live: honoured by session chat endpoints)
  provider?: string;
  apiKey?: string;       // per-profile API_SERVER_KEY (live, multiplex /p/<profile>); falls back to main key
  needsKey?: boolean;    // live + bridge: a server profile this phone has no chat key for yet ("Set up chat")
};
export type NewBot = Pick<Bot, "name" | "emoji" | "color" | "color2" | "shape" | "eyes" | "description" | "persona" | "model" | "provider"> & { toolsets: string[]; profile?: string };
/** Toolsets offered when creating a bot (Hermes toolset ids, toolsets.py). */
export const STARTER_TOOLSETS: [string, string][] = [["web", "Web"], ["terminal", "Terminal"], ["browser", "Browser"], ["computer_use", "Computer use"], ["file", "Files"], ["memory", "Memory"], ["cronjob", "Routines"]];
export type Skill = { name: string; description: string; category?: string; enabled?: boolean };
export type Toolset = { name: string; label: string; description: string; enabled: boolean };
export type Job = { id: string; name: string; schedule: string; prompt: string; paused: boolean; lastRun?: string; nextRun?: string; lastStatus?: string };
export type NewJob = { name: string; schedule: string; prompt: string };
export type McpServer = { name: string; url: string; enabled: boolean; hasAuth: boolean; tools?: number };
export type NewMcp = { name: string; url: string; authHeader?: string };
export type Memory = { memory: string; user: string };
export type PluginKind = "tools" | "browser" | "context-engine" | "memory-provider" | "model-provider" | "platform";
export type Plugin = { name: string; kind: PluginKind; description: string; version: string; installed: boolean; enabled: boolean; tools: string[]; skills: string[];
  /** Set when the switch can't be flipped from the phone: what to run on the server instead. */
  toggleHint?: string; source?: string };
/** Memory as hermes-bridge reports it: the active provider and the built-in files' sizes (not their text). */
export type MemoryStatus = { active: string; providers: { name: string; description: string; available: boolean; configured: boolean; status?: string }[]; files: { memory: number; user: number } };
export type ModelOption = { id: string; provider?: string; label: string };
/** One entry of Hermes's curated plugin marketplace (dashboard /api/dashboard/plugins/catalog). */
export type CatalogPlugin = { name: string; title: string; description: string; maintainer?: string; tier?: string; category?: string;
  version?: string; installed: boolean; updateAvailable: boolean; requiresEnv: string[]; tools: string[] };
/** installSupported is false for profiles other than the one the dashboard runs as (Hermes's limit). */
export type PluginCatalog = { entries: CatalogPlugin[]; installSupported: boolean };
/** One entry of Hermes's approved MCP catalog (dashboard /api/mcp/catalog). */
export type McpCatalogEntry = { name: string; description: string; transport: string; authType: string;
  requiredEnv: { name: string; prompt?: string; required: boolean }[]; installed: boolean; enabled: boolean; command?: string; url?: string };
export type SessionInfo = { id: string; title: string; updated?: string };

/** Live mode needs hermes-bridge for these (editPersona/deleteBot stay server-side even with it). */
export type BridgeFeature = "createBot" | "editPersona" | "deleteBot" | "toggleToolsets" | "toggleSkills" | "memory" | "mcp" | "plugins";

/** Thrown in live mode when a feature needs hermes-bridge and no bridge key is set. */
export class ComingSoonError extends Error {
  constructor(public feature: BridgeFeature) { super(`${feature} needs hermes-bridge on your homelab. Add its key in Settings.`); }
}

export interface Backend {
  kind: "demo" | "live";
  supports(f: BridgeFeature): boolean;
  listBots(): Promise<Bot[]>;
  createBot(b: NewBot): Promise<Bot>;
  /** Add an already-existing Hermes profile to the roster (live: local only, no bridge needed). */
  addExistingBot(b: Bot): Promise<Bot>;
  updateBot(b: Bot): Promise<Bot>;
  removeBot(id: string): Promise<void>;
  chat(b: Bot): ChatClient;
  /** The single continuous conversation of this bot: a session titled "Bot Chat" (Hermes Bot Mode). */
  botChatSession(b: Bot): Promise<string>;
  /** Live only: the profile's Bot Chat refused a phone turn; use a phone session from now on. */
  abandonBotChat?(b: Bot): Promise<void>;
  /** Live only: the stored session id no longer exists on the server. */
  forgetSession?(b: Bot): Promise<void>;
  /** Live only: verify /p/<profile>/ is served and `apiKey` is that profile's key; throws a readable error. */
  checkProfile?(profile: string, apiKey: string): Promise<void>;
  listSessions(b: Bot): Promise<SessionInfo[]>;
  listModels(b: Bot): Promise<ModelOption[]>;
  listSkills(b: Bot): Promise<Skill[]>;
  setSkill?(b: Bot, name: string, enabled: boolean): Promise<void>;
  listToolsets(b: Bot): Promise<Toolset[]>;
  setToolset(b: Bot, name: string, enabled: boolean): Promise<void>;
  listJobs(b: Bot): Promise<Job[]>;
  createJob(b: Bot, j: NewJob): Promise<Job>;
  setJobPaused(b: Bot, id: string, paused: boolean): Promise<void>;
  runJob(b: Bot, id: string): Promise<void>;
  deleteJob(b: Bot, id: string): Promise<void>;
  getMemory(b: Bot): Promise<Memory>;
  setMemory(b: Bot, m: Memory): Promise<void>;
  /** Live: provider + file sizes via hermes-bridge (Hermes has no API for the files' text). */
  getMemoryStatus?(b: Bot): Promise<MemoryStatus>;
  /** Live + bridge: give this phone a chat key for a profile (rotates that profile's API_SERVER_KEY). */
  setupChat?(b: Bot): Promise<Bot>;
  /** Live + bridge: restart the Hermes gateway (applies MCP changes). */
  restartGateway?(): Promise<void>;
  /** A one-line problem to show on Home (e.g. the bridge is unreachable, so the roster is local only). */
  notice?(): string | null;
  listMcp(b: Bot): Promise<McpServer[]>;
  addMcp(b: Bot, m: NewMcp): Promise<void>;
  setMcpEnabled(b: Bot, name: string, enabled: boolean): Promise<void>;
  removeMcp(b: Bot, name: string): Promise<void>;
  listPlugins(b: Bot): Promise<Plugin[]>;
  installPlugin(b: Bot, name: string): Promise<void>;
  /** Hermes's plugin marketplace with installed state (live: needs hermes-bridge 0.2+). */
  listPluginCatalog?(b: Bot): Promise<PluginCatalog>;
  /** Hermes's MCP catalog with installed/enabled state for this bot's profile. */
  listMcpCatalog?(b: Bot): Promise<McpCatalogEntry[]>;
  /** Install a catalog MCP; `env` holds the values for the variables the entry declares. */
  installMcpCatalog?(b: Bot, name: string, env: Record<string, string>): Promise<void>;
  setPluginEnabled(b: Bot, name: string, enabled: boolean): Promise<void>;
}

export const BOT_CHAT_TITLE = "Bot Chat";
export const AVATAR_COLORS = ["#2a3f5c", "#4b3576", "#1f5a42", "#1d6670", "#9a3b2e", "#6e2f60", "#8a6a1f", "#43475a"];
export const AVATAR_EMOJI = ["🪽", "🛠️", "📈", "🧠", "🦊", "🐙", "🌿", "🔭", "🎧", "🍵", "🚀", "🐢"];
