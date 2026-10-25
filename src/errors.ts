// HTTP errors from Hermes (shared by the client and the run follower).
/** An HTTP error from Hermes with its machine-readable code (e.g. invalid_title, session_not_found). */
export class HermesError extends Error {
  constructor(public status: number, public path: string, public code: string | undefined, public detail: string) {
    super(`${status} ${path}: ${detail}`);
    this.name = "HermesError";
  }
}

export function toHermesError(status: number, path: string, text: string): HermesError {
  let code: string | undefined; let msg = text.slice(0, 300);
  try {
    const j = JSON.parse(text);
    const e = j?.error;
    if (typeof e === "string") msg = e;
    else if (e && typeof e === "object") { msg = String(e.message ?? msg); code = e.code ?? undefined; }
  } catch {}
  return new HermesError(status, path, code, msg);
}

