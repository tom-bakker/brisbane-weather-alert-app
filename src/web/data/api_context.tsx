import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type {DataApi} from './api';

const ApiContext = createContext<DataApi | null>(null);

/** Makes a DataApi available to every component below it. */
export function ApiProvider({
  api,
  children,
}: {
  api: DataApi;
  children: ReactNode;
}) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

/** The DataApi from the nearest ApiProvider. */
export function useApi(): DataApi {
  const api = useContext(ApiContext);
  if (api === null)
    throw new Error('useApi must be used inside an ApiProvider');
  return api;
}

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Loads data with `load` and reloads whenever `reload` is called or `load`
 * changes (wrap it in useCallback). Keeps showing old data while reloading.
 */
export function useAsync<T>(load: () => Promise<T>): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    load().then(
      (value) => {
        if (cancelled) return;
        setData(value);
        setError(null);
        setLoading(false);
      },
      (e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [load, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return {data, error, loading, reload};
}
