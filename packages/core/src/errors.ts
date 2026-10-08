/**
 * A rule was broken or something was not found. `status` is the HTTP code the
 * server will answer with, so every caller (UI, CLI, MCP) gets the same message.
 */
export class TixError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "TixError";
    this.status = status;
  }
}
