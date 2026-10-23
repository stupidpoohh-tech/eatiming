import { Check, Minus, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { STATUS_LABEL } from '../../shared/labels';
import type { FoodStatus } from '../../shared/types';

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

// ───────── 상태 아이콘: 색상 + 모양 + (스크린리더) 텍스트 ─────────
const STATUS_STYLE: Record<FoodStatus, string> = {
  easy: 'bg-brand-100 text-brand-700',
  depends: 'bg-honey-100 text-honey-700',
  heavy: 'bg-clay-100 text-clay-700',
};

export function StatusIcon({ status, size = 'md' }: { status: FoodStatus; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'size-5 rounded-md' : 'size-6 rounded-lg';
  const icon = size === 'sm' ? 12 : 14;
  return (
    <span className={cx('inline-flex shrink-0 items-center justify-center', box, STATUS_STYLE[status])} aria-hidden>
      {status === 'easy' && <Check size={icon} strokeWidth={3} />}
      {status === 'depends' && <span className="text-[13px] leading-none font-extrabold">?</span>}
      {status === 'heavy' && <Minus size={icon} strokeWidth={3} />}
    </span>
  );
}

export function StatusBadge({ status, label }: { status: FoodStatus; label?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full py-1 pr-3 pl-1 text-sm font-semibold', STATUS_STYLE[status])}>
      <StatusIcon status={status} size="sm" />
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}

// ───────── 버튼 ─────────
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-200',
  secondary: 'bg-white text-ink border border-line hover:border-brand-400 disabled:text-ink-mute',
  ghost: 'text-ink-soft hover:bg-ivory-deep',
  danger: 'bg-white text-clay-700 border border-clay-100 hover:bg-clay-50',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  const sz = size === 'sm' ? 'h-9 px-3 text-sm' : size === 'lg' ? 'h-13 px-5 text-base' : 'h-11 px-4 text-[15px]';
  return (
    <button
      type="button"
      className={cx('tap inline-flex items-center justify-center gap-1.5 rounded-[12px] font-semibold shadow-[0_1px_2px_rgb(25_38_59_/_0.035)]', sz, VARIANT[variant], className)}
      {...props}
    />
  );
}

// ───────── 바텀 시트 / 상세 패널 ─────────
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    document.addEventListener('keydown', onKey);
    // 배경 스크롤 위치를 건드리지 않는다(시트 내부는 overscroll-contain으로 분리)
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <div className="animate-fade-in absolute inset-0 bg-ink/30" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="animate-sheet-in relative flex max-h-[88dvh] w-full flex-col rounded-t-3xl bg-white shadow-[var(--shadow-sheet)] outline-none md:max-w-lg md:rounded-3xl"
      >
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line md:hidden" aria-hidden />
        <div className="flex items-start gap-3 px-5 pt-3 pb-2">
          <h2 id={titleId} className="min-w-0 flex-1 text-lg font-bold">
            {title}
          </h2>
          <button type="button" onClick={onClose} className="tap -mr-2 rounded-full p-2 text-ink-soft hover:bg-ivory-deep" aria-label="닫기">
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overscroll-contain overflow-y-auto px-5 pb-6">{children}</div>
        {footer && <div className="border-t border-line px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ───────── 입력 ─────────
export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-semibold text-ink-soft">{label}</span>
        {children}
      </label>
      {hint && <p className="mt-1 text-xs text-ink-mute">{hint}</p>}
    </div>
  );
}

export const inputClass =
  'h-11 w-full rounded-xl border border-line bg-white px-3 text-[16px] text-ink placeholder:text-ink-mute focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100';

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cx('flex min-h-12 items-center gap-3 py-2', disabled && 'opacity-50')}>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{label}</span>
        {description && <span className="block text-xs text-ink-mute">{description}</span>}
      </span>
      <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className="relative h-7 w-12 shrink-0 rounded-full bg-line transition-colors peer-checked:bg-brand-500 peer-focus-visible:outline-2 peer-focus-visible:outline-accent-500 after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5"
      />
    </label>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx('rounded-[20px] border border-line bg-white p-4 shadow-[var(--shadow-soft)] sm:p-5', className)}>{children}</section>;
}

export function Spinner({ label = '불러오는 중' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-mute" role="status">
      <span className="size-4 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" aria-hidden />
      {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-clay-100 bg-clay-50 p-4 text-sm text-clay-700" role="alert">
      <p>{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          다시 시도
        </Button>
      )}
    </div>
  );
}

// ───────── 토스트 ─────────
const ToastCtx = createContext<(msg: string) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; key: number } | null>(null);
  const show = useCallback((text: string) => setMsg({ text, key: Date.now() }), []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2400);
    return () => clearTimeout(t);
  }, [msg]);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4">
        {msg && (
          <div key={msg.key} className="animate-sheet-in rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-white shadow-lg">
            {msg.text}
          </div>
        )}
      </div>
    </ToastCtx.Provider>
  );
}

export function LevelMeter({ value, label }: { value: 1 | 2 | 3; label: string }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={label}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={cx('h-2 w-4 rounded-full', i <= value ? 'bg-ink-soft' : 'bg-line')} aria-hidden />
      ))}
    </span>
  );
}
