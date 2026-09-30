'use client';

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';

/** Campo opcional dentro do popup — substitui o window.prompt. */
export type ConfirmField = {
  label: string;
  /** "password" esconde o que é digitado (o window.prompt mostrava em claro). */
  type?: 'text' | 'password' | 'textarea';
  placeholder?: string;
  /** Sem valor o botão de confirmar fica desativado. */
  required?: boolean;
};

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Botão de confirmação em vermelho (excluir / ação destrutiva) */
  danger?: boolean;
  field?: ConfirmField;
};

type Pending = ConfirmOptions & {
  resolve: (value: string | null) => void;
};

type ConfirmDialogProps = ConfirmOptions & {
  open: boolean;
  busy?: boolean;
  onConfirm: (value: string) => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  busy = false,
  field,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (!open) return;
    setValue('');
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  const faltaValor = Boolean(field?.required && !value.trim());

  function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || faltaValor) return;
    onConfirm(value);
  }

  return (
    <div
      data-confirm-dialog
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
      onClick={(e) => {
        // Com campo digitado, clicar fora não pode jogar o texto fora
        if (e.target === e.currentTarget && !busy && !value) onCancel();
      }}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-md border border-line bg-white p-5 shadow-xl sm:rounded-md"
      >
        <h2 id="confirm-dialog-title" className="text-base font-bold text-ink">
          {title}
        </h2>
        <p
          id="confirm-dialog-desc"
          className="mt-2 text-sm leading-relaxed text-muted"
        >
          {message}
        </p>
        {field ? (
          <div className="mt-4">
            <label className="label" htmlFor="confirm-dialog-field">
              {field.label}
            </label>
            {field.type === 'textarea' ? (
              <textarea
                id="confirm-dialog-field"
                className="field min-h-[88px]"
                value={value}
                placeholder={field.placeholder}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
              />
            ) : (
              <input
                id="confirm-dialog-field"
                className="field"
                type={field.type === 'password' ? 'password' : 'text'}
                autoComplete={field.type === 'password' ? 'current-password' : 'off'}
                value={value}
                placeholder={field.placeholder}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
              />
            )}
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="submit"
            className={danger ? 'btn btn-danger' : 'btn btn-accent'}
            disabled={busy || faltaValor}
            autoFocus={!field}
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Substitui window.confirm e window.prompt por um popup da loja. */
export function useConfirm() {
  const [pending, setPending] = useState<Pending | null>(null);

  const open = useCallback((options: ConfirmOptions) => {
    return new Promise<string | null>((resolve) => {
      setPending({ ...options, resolve });
    });
  }, []);

  /** Sim/não. */
  const confirm = useCallback(
    async (options: Omit<ConfirmOptions, 'field'>) =>
      (await open(options)) !== null,
    [open],
  );

  /** Pede um texto. Devolve null se cancelar. */
  const ask = useCallback(
    (options: ConfirmOptions & { field: ConfirmField }) => open(options),
    [open],
  );

  const close = useCallback((value: string | null) => {
    setPending((cur) => {
      cur?.resolve(value);
      return null;
    });
  }, []);

  const dialog: ReactNode = pending ? (
    <ConfirmDialog
      open
      title={pending.title}
      message={pending.message}
      confirmLabel={pending.confirmLabel}
      cancelLabel={pending.cancelLabel}
      danger={pending.danger}
      field={pending.field}
      onConfirm={(value) => close(value)}
      onCancel={() => close(null)}
    />
  ) : null;

  return { confirm, ask, dialog };
}
