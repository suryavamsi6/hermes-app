// Connection settings live in the Android Keystore-backed SecureStore. Nothing is hardcoded.
import * as SecureStore from "./secure";

export type HermesConfig = {
  baseUrl: string;        // e.g. https://your-host.<tailnet>.ts.net (no trailing slash)
  apiKey: string;         // Hermes API_SERVER_KEY
  cfClientId: string;     // optional: Cloudflare Access service token Client ID ("" = not used)
  cfClientSecret: string; // optional: Cloudflare Access service token Client Secret
  bridgeUrl?: string;     // optional hermes-bridge URL ("" = <baseUrl>/bridge)
  bridgeKey?: string;     // optional hermes-bridge key ("" = no bridge: manual profile setup)
};

const KEYS: Record<keyof HermesConfig, string> = {
  baseUrl: "hermes.baseUrl",
  apiKey: "hermes.apiKey",
  cfClientId: "hermes.cfClientId",
  cfClientSecret: "hermes.cfClientSecret",
  bridgeUrl: "hermes.bridgeUrl",
  bridgeKey: "hermes.bridgeKey",
};

/** Where the bridge lives, or null when no bridge key is set. */
export function bridgeTarget(cfg: HermesConfig): { url: string; key: string } | null {
  const key = (cfg.bridgeKey ?? "").trim();
  if (!key) return null;
  const url = (cfg.bridgeUrl ?? "").trim().replace(/\/+$/, "") || `${cfg.baseUrl.replace(/\/+$/, "")}/bridge`;
  return { url, key };
}

export async function loadConfig(): Promise<HermesConfig | null> {
  const entries = await Promise.all(
    (Object.keys(KEYS) as (keyof HermesConfig)[]).map(async (k) => [k, await SecureStore.getItem(KEYS[k])] as const)
  );
  const cfg = Object.fromEntries(entries) as Record<keyof HermesConfig, string | null>;
  if (!cfg.baseUrl || !cfg.apiKey) return null;
  return {
    baseUrl: cfg.baseUrl,
    apiKey: cfg.apiKey,
    cfClientId: cfg.cfClientId ?? "",
    cfClientSecret: cfg.cfClientSecret ?? "",
    bridgeUrl: cfg.bridgeUrl ?? "",
    bridgeKey: cfg.bridgeKey ?? "",
  };
}

export async function saveConfig(cfg: HermesConfig): Promise<void> {
  for (const k of Object.keys(KEYS) as (keyof HermesConfig)[]) {
    await SecureStore.setItem(KEYS[k], (cfg[k] ?? "").trim());
  }
}
