import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

export const LEAVE_MESSAGE =
  'You have unsaved changes. Leave this page and discard them?';

interface UnsavedChangesGuard {
  mark(id: string, dirty: boolean): void;
  /** True when nothing is unsaved or the user agrees to discard it. */
  confirmLeave(): boolean;
}

const GuardContext = createContext<UnsavedChangesGuard | null>(null);

function browserConfirm(message: string): boolean {
  return window.confirm(message);
}

/**
 * Tracks which parts of the page hold unsaved edits, so navigation can ask
 * before throwing them away. Also asks the browser to warn on reload/close.
 */
export function UnsavedChangesProvider({
  children,
  confirm = browserConfirm,
}: {
  children: ReactNode;
  confirm?: (message: string) => boolean;
}) {
  const dirty = useRef(new Set<string>());
  const guard = useMemo<UnsavedChangesGuard>(
    () => ({
      mark(id, isDirty) {
        if (isDirty) dirty.current.add(id);
        else dirty.current.delete(id);
      },
      confirmLeave() {
        return dirty.current.size === 0 || confirm(LEAVE_MESSAGE);
      },
    }),
    [confirm],
  );

  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (dirty.current.size > 0) event.preventDefault();
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  return (
    <GuardContext.Provider value={guard}>{children}</GuardContext.Provider>
  );
}

/** Reports whether the calling component holds unsaved edits. */
export function useUnsavedChanges(dirty: boolean): void {
  const guard = useContext(GuardContext);
  const id = useId();
  useEffect(() => {
    guard?.mark(id, dirty);
    return () => guard?.mark(id, false);
  }, [guard, id, dirty]);
}

/** A check to run before navigating away; false means stay put. */
export function useConfirmLeave(): () => boolean {
  const guard = useContext(GuardContext);
  return guard?.confirmLeave ?? (() => true);
}
