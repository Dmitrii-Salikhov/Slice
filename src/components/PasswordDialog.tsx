import { useEffect, useRef, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import './Modal.css';

type Props = {
  open: boolean;
  zipName?: string;
  error?: string | null;
  onSubmit: (password: string) => void;
  onCancel: () => void;
};

export function PasswordDialog({ open, zipName, error, onSubmit, onCancel }: Props) {
  const { t } = useLocale();
  const [password, setPassword] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPassword('');
      queueMicrotask(() => inputRef.current?.focus());
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="zip-pw-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="zip-pw-title">{t('zip.passwordTitle')}</h2>
        <p className="modal__hint">
          {zipName ? t('zip.passwordHintNamed', { name: zipName }) : t('zip.passwordHint')}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const pw = password;
            setPassword('');
            onSubmit(pw);
          }}
        >
          <label className="modal__field">
            <span>{t('zip.password')}</span>
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
            />
          </label>
          {error && <p className="modal__error">{error}</p>}
          <div className="modal__actions">
            <button type="button" className="btn btn--ghost" onClick={onCancel}>
              {t('dialog.cancel')}
            </button>
            <button type="submit" className="btn btn--primary">
              {t('zip.unlock')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
