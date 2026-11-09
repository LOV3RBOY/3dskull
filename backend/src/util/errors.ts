export class HttpError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = "Resource") => new HttpError(404, "not_found", `${what} not found`);
export const badRequest = (message: string) => new HttpError(400, "bad_request", message);
export const forbidden = (message = "Forbidden") => new HttpError(403, "forbidden", message);
export const unauthorized = (message = "Unauthorized") => new HttpError(401, "unauthorized", message);
