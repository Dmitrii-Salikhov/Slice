import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  createErrorLogStore,
  type ErrorLogEntry,
  type ErrorLogOptions,
} from '../errorLog/store';

type UpdateLogContextValue = {
  entries: ErrorLogEntry[];
  reportUpdate: (message: string, source?: string) => void;
  clearLog: () => void;
};

const UpdateLogContext = createContext<UpdateLogContextValue | null>(null);

export function UpdateLogProvider({
  children,
  options,
}: {
  children: ReactNode;
  options?: ErrorLogOptions;
}) {
  const store = useMemo(() => createErrorLogStore(options), [options]);
  const [entries, setEntries] = useState<ErrorLogEntry[]>(() => store.getEntries());

  const reportUpdate = useCallback(
    (message: string, source?: string) => {
      store.add(message, source ?? 'update');
      setEntries(store.getEntries());
    },
    [store],
  );

  const clearLog = useCallback(() => {
    store.clear();
    setEntries([]);
  }, [store]);

  const value = useMemo(
    () => ({ entries, reportUpdate, clearLog }),
    [entries, reportUpdate, clearLog],
  );

  return (
    <UpdateLogContext.Provider value={value}>{children}</UpdateLogContext.Provider>
  );
}

export function useUpdateLog(): UpdateLogContextValue {
  const ctx = useContext(UpdateLogContext);
  if (!ctx) {
    throw new Error('useUpdateLog must be used within UpdateLogProvider');
  }
  return ctx;
}
