export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      credentials: 'include',
      // Only claim a JSON content-type when there's actually a body — sending
      // it on a bodyless request (e.g. POST .../publish) makes some JSON body
      // parsers choke on the empty body.
      ...(options.body !== undefined ? { headers: { 'Content-Type': 'application/json' } } : {}),
      ...options,
    });
  } catch {
    // fetch() itself throwing (not a non-2xx response) means the request never
    // reached the server at all — offline, DNS failure, the server is down.
    // The raw error text here ("Failed to fetch", "Load failed", ...) is
    // browser-internal jargon, not something a non-technical admin can act on.
    throw new ApiError(0, "Couldn't reach the server — check your connection and try again.");
  }
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // no JSON body — keep statusText
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
