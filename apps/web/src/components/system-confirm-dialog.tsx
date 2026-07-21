import React, { createContext, PropsWithChildren, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CircleHelpIcon, TriangleAlertIcon } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from './ui/alert-dialog';

export type SystemConfirmOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'destructive';
};

type PendingConfirmation = SystemConfirmOptions & {
  resolve: (confirmed: boolean) => void;
};

type SystemConfirm = (options: SystemConfirmOptions) => Promise<boolean>;

const SystemConfirmContext = createContext<SystemConfirm | null>(null);

export const SystemConfirmDialogProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const pendingRef = useRef<PendingConfirmation | null>(null);

  const settle = useCallback((confirmed: boolean) => {
    const current = pendingRef.current;
    if (!current) return;
    pendingRef.current = null;
    setPending(null);
    current.resolve(confirmed);
  }, []);

  const confirm = useCallback<SystemConfirm>((options) => new Promise<boolean>((resolve) => {
    pendingRef.current?.resolve(false);
    const next = { ...options, resolve };
    pendingRef.current = next;
    setPending(next);
  }), []);

  useEffect(() => () => {
    pendingRef.current?.resolve(false);
    pendingRef.current = null;
  }, []);

  const destructive = pending?.tone === 'destructive';
  const Icon = destructive ? TriangleAlertIcon : CircleHelpIcon;

  return <SystemConfirmContext.Provider value={confirm}>
    {children}
    <AlertDialog open={Boolean(pending)} onOpenChange={(open) => { if (!open) settle(false); }}>
      <AlertDialogContent className="gap-5 p-6 shadow-[0_1px_2px_oklch(0_0_0/6%),0_12px_36px_oklch(0_0_0/12%)] sm:max-w-md">
        <AlertDialogHeader className="gap-2 sm:grid-cols-[auto_1fr] sm:place-items-start sm:text-left">
          <AlertDialogMedia className={destructive ? 'bg-destructive/10 text-destructive sm:row-span-2' : 'system-confirm-media sm:row-span-2'}>
            <Icon data-icon="inline-start" aria-hidden="true" />
          </AlertDialogMedia>
          <AlertDialogTitle className="text-xl font-semibold tracking-tight sm:col-start-2">
            {pending?.title}
          </AlertDialogTitle>
          <AlertDialogDescription className="leading-6 sm:col-start-2">
            {pending?.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="-mx-6 -mb-6 rounded-b-xl px-6 py-4">
          <AlertDialogCancel onClick={() => settle(false)}>{pending?.cancelLabel ?? 'Hủy'}</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? 'destructive' : 'default'}
            className={destructive ? undefined : 'system-confirm-primary'}
            onClick={() => settle(true)}
          >
            {pending?.confirmLabel ?? 'Xác nhận'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </SystemConfirmContext.Provider>;
};

export const useSystemConfirm = (): SystemConfirm => {
  const confirm = useContext(SystemConfirmContext);
  if (!confirm) throw new Error('useSystemConfirm phải được dùng bên trong SystemConfirmDialogProvider.');
  return confirm;
};
