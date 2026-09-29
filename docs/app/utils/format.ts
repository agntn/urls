/** `2002-01-20T14:25:10Z` → `2002-01-20 14:25`. */
export function shortStamp(iso: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/u.exec(iso);
  return match ? `${match[1]} ${match[2]}` : iso;
}

/** `2002-01-20T14:25:10Z` → `2002-01-20`. */
export function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

/** Keeps the start and the end of a long URL: `https://arquivo.pt/wayback/2010…example.com/`. */
export function shortUrl(url: string, max = 56): string {
  if (url.length <= max) {
    return url;
  }
  const head = Math.ceil((max - 1) * 0.6);
  const tail = max - 1 - head;
  return `${url.slice(0, head)}…${url.slice(-tail)}`;
}


/** The message a failed `$fetch` carries: the route's status message first, the error's own last. */
export function errorText(error: unknown): string {
  if (error && typeof error === "object") {
    const data = (error as { data?: { statusMessage?: string; message?: string } }).data;
    const message = data?.statusMessage ?? data?.message;
    if (message) return message;
  }
  return error instanceof Error ? error.message : "Request failed";
}
