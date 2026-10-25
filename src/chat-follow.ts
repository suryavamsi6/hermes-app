// Where the chat list sits relative to the newest message, and when it should move there.
// The list is inverted, so offset 0 is the newest message (just above the composer, edge to edge).
//
// - Your own send (text, attachments or a steer) always brings the newest message into view, smoothly,
//   wherever you were scrolled.
// - While you're at the bottom, the list follows new rows and a streaming reply on its own.
// - Scrolled up, nothing that arrives moves you: the list keeps the rows you're reading in place.

/** Within this many px of the newest message counts as "at the bottom". */
export const AT_BOTTOM = 48;
/** After a send, keep following this long while the smooth scroll travels back down. */
export const SETTLE_MS = 1500;

/** maintainVisibleContentPosition: keep the visible rows still when rows are added or grow below them. */
export type Anchor = { minIndexForVisible: number } | undefined;
const KEEP: Anchor = { minIndexForVisible: 0 };

export class ChatFollow {
  private offset = 0;
  private forcedUntil = 0;
  private waiting = false;

  constructor(private readonly scrollToLatest: () => void, private readonly now: () => number = Date.now) {}

  /** True when the list should stick to the newest message. */
  following(): boolean {
    return this.offset <= AT_BOTTOM || this.now() < this.forcedUntil;
  }

  /** Pin the visible rows only when you've scrolled up; at the bottom new content shows up in place. */
  anchor(): Anchor {
    return this.following() ? undefined : KEEP;
  }

  /** Feed every scroll offset. Returns true when `following()` changed (re-render to update the anchor). */
  scrolled(y: number): boolean {
    const before = this.following();
    this.offset = y;
    if (y <= AT_BOTTOM) this.forcedUntil = 0;
    return before !== this.following();
  }

  /** You sent something: go to the newest message now, and again once your message has rendered. */
  sent(): void {
    this.forcedUntil = this.now() + SETTLE_MS;
    this.waiting = true;
    this.scrollToLatest();
  }

  /** The rows changed (new message, streamed tokens, a steer). Finishes a send's scroll. */
  rowsChanged(): void {
    if (!this.waiting) return;
    this.waiting = false;
    if (this.following()) this.scrollToLatest();
  }
}
