// Pure helpers for the model picker: filter by a search query and group by provider (unit-tested).
import type { ModelOption } from "../backend";

export type ModelGroup = { provider: string; title: string; models: ModelOption[] };

/** Models whose id, label or provider contains every word of `query`, grouped by provider in input order. */
export function groupModels(models: ModelOption[], query = ""): ModelGroup[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const groups = new Map<string, ModelGroup>();
  for (const m of models) {
    const hay = `${m.id} ${m.label} ${m.provider ?? ""} ${m.providerName ?? ""}`.toLowerCase();
    if (!words.every((w) => hay.includes(w))) continue;
    const key = m.provider ?? "";
    if (!groups.has(key)) groups.set(key, { provider: key, title: m.providerName || m.provider || "Other", models: [] });
    groups.get(key)!.models.push(m);
  }
  return [...groups.values()];
}
