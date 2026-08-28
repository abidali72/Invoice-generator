"use client";

import { useCallback, useEffect, useState } from "react";

interface State<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export interface ApiEnvelope<T> {
  ok: boolean;
  data: T;
  error?: string;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!res.ok || !body?.ok) {
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return body.data;
}

/** Minimal data-fetching hook with refetch support. */
export function useApi<T>(path: string | null) {
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: !!path });

  const load = useCallback(async () => {
    if (!path) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await apiFetch<T>(path);
      setState({ data, error: null, loading: false });
    } catch (e) {
      setState({ data: null, error: (e as Error).message, loading: false });
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, refetch: load };
}
