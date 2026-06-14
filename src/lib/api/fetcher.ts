export const customFetch = async <T>(url: string, options?: RequestInit): Promise<T> => {
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
  const hasBody = options?.body != null;
  const response = await fetch(`${base}${url}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${response.status} ${response.statusText}${body ? `: ${body}` : ''}`);
  }

  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
};
