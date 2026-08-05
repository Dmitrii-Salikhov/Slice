import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { humanizeError } from './humanizeError';
import {
  createErrorLogStore,
  type ErrorLogEntry,
  type ErrorLogOptions,
} from './store';

type ErrorLogContextValue = {
  entries: ErrorLogEntry[];
  reportError: (message: string, source?: string) => void;
  clearLog: () => void;
};

const ErrorLogContext = createContext<ErrorLogContextValue | null>(null);

export function ErrorLogProvider({
  children,
  options,
}: {
  children: ReactNode;
  options?: ErrorLogOptions;
}) {
  const { t } = useLocale();
  const store = useMemo(() => createErrorLogStore(options), [options]);
  const [entries, setEntries] = useState<ErrorLogEntry[]>(() => store.getEntries());

  const reportError = useCallback(
    (message: string, source?: string) => {
      store.add(humanizeError(message, t), source);
      setEntries(store.getEntries());
    },
    [store, t],
  );

  const clearLog = useCallback(() => {
    store.clear();
    setEntries([]);
  }, [store]);

  const value = useMemo(
    () => ({ entries, reportError, clearLog }),
    [entries, reportError, clearLog],
  );

  return <ErrorLogContext.Provider value={value}>{children}</ErrorLogContext.Provider>;
}

export function useErrorLog(): ErrorLogContextValue {
  const ctx = useContext(ErrorLogContext);
  if (!ctx) {
    throw new Error('useErrorLog must be used within ErrorLogProvider');
  }
  return ctx;
}
