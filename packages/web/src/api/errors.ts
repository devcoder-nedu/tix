/** Thrown for rule violations (bad parent, unknown key...). `status` matches the HTTP code the real server will use. */
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
