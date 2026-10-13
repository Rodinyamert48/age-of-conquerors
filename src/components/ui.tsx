'use client';
/**
 * Ortak arayüz bileşenleri: düğmeler, bayraklar, iletişim kutuları, bildirim tostları.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { create } from 'zustand';
import { X } from 'lucide-react';
import { playSound } from '@/lib/audio';
import { asset } from '@/lib/base';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  children,
  onClick,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-[3px] border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 select-none';
  const sizes = { sm: 'px-2 py-1 text-xs', md: 'px-3 py-1.5 text-sm', lg: 'px-5 py-2.5 text-base' };
  const variants: Record<Variant, string> = {
    primary: 'border-gold-2 bg-gold/90 text-[#1a1408] hover:bg-gold-soft',
    secondary: 'border-line-2 bg-panel-2 text-ink hover:border-gold-2 hover:bg-panel-3',
    ghost: 'border-transparent bg-transparent text-ink-2 hover:bg-white/5 hover:text-ink',
    danger: 'border-danger/60 bg-danger/15 text-[#f3c2bc] hover:bg-danger/30',
  };
  return (
    <button
      type="button"
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      onClick={(e) => {
        playSound('click');
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Flag({ code, className = '', title }: { code: string; className?: string; title?: string }) {
  const src = asset(code.startsWith('x-') ? `/flags-custom/${code.slice(2)}.svg` : `/flags/${code}.svg`);
  // Bayrak dosyası yoksa alttaki genel bayrak görünür
  const fallback = asset('/flags-custom/unknown.svg');
  return <span role="img" aria-label={title} title={title} className={`flag ${className}`} style={{ backgroundImage: `url(${src}), url(${fallback})`, aspectRatio: '4 / 3' }} />;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-1.5 mt-3 flex items-center justify-between border-b border-line pb-1 first:mt-0">
      <h3 className="font-display text-[13px] uppercase tracking-[0.12em] text-gold-soft">{children}</h3>
      {right}
    </div>
  );
}

export function Stat({ label, value, tone, hint }: { label: ReactNode; value: ReactNode; tone?: 'good' | 'bad' | 'warn' | 'muted'; hint?: string }) {
  const tones = { good: 'text-good', bad: 'text-danger', warn: 'text-warn', muted: 'text-muted' };
  return (
    <div className="flex items-baseline justify-between gap-2 py-[3px] text-[13px]" title={hint}>
      <span className="text-muted">{label}</span>
      <span className={`tabular text-right ${tone ? tones[tone] : 'text-ink'}`}>{value}</span>
    </div>
  );
}

export function Bar({ value, max = 1, color = 'bg-gold', className = '' }: { value: number; max?: number; color?: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1e-9, max)) * 100));
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-black/40 ${className}`}>
      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className={`anim-in flex max-h-[92vh] w-full flex-col rounded border border-line-2 bg-panel shadow-2xl outline-none ${wide ? 'max-w-4xl' : 'max-w-lg'}`}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h2 className="font-display text-lg tracking-wide text-gold-soft">{title}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted hover:bg-white/5 hover:text-ink" aria-label="Kapat">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-4 py-2.5">{footer}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Onay iletişim kutusu (kritik işlemler)
// ---------------------------------------------------------------------------
interface ConfirmState {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
  resolve: ((v: boolean) => void) | null;
  ask: (o: { title: string; body: ReactNode; confirmLabel: string; cancelLabel: string; danger?: boolean }) => Promise<boolean>;
  close: (v: boolean) => void;
}

export const useConfirm = create<ConfirmState>((set, get) => ({
  open: false,
  title: '',
  body: null,
  confirmLabel: '',
  cancelLabel: '',
  danger: false,
  resolve: null,
  ask: (o) =>
    new Promise<boolean>((resolve) => {
      get().resolve?.(false);
      set({ open: true, title: o.title, body: o.body, confirmLabel: o.confirmLabel, cancelLabel: o.cancelLabel, danger: !!o.danger, resolve });
    }),
  close: (v) => {
    get().resolve?.(v);
    set({ open: false, resolve: null });
  },
}));

export function ConfirmHost() {
  const st = useConfirm();
  return (
    <Modal
      open={st.open}
      onClose={() => st.close(false)}
      title={st.title}
      footer={
        <>
          <Button onClick={() => st.close(false)}>{st.cancelLabel}</Button>
          <Button variant={st.danger ? 'danger' : 'primary'} onClick={() => st.close(true)} autoFocus>
            {st.confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-ink-2">{st.body}</div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Tostlar (kısa, oyunu kesmeyen geri bildirim)
// ---------------------------------------------------------------------------
interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'good' | 'bad';
}
interface ToastState {
  toasts: Toast[];
  push: (text: string, tone?: Toast['tone']) => void;
  remove: (id: number) => void;
}
let toastId = 1;
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (text, tone = 'info') => {
    const id = toastId++;
    set({ toasts: [...get().toasts.slice(-3), { id, text, tone }] });
    if (tone === 'bad') playSound('error');
    setTimeout(() => get().remove(id), tone === 'bad' ? 5000 : 3000);
  },
  remove: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export function ToastHost() {
  const toasts = useToasts((s) => s.toasts);
  const remove = useToasts((s) => s.remove);
  return (
    <div className="pointer-events-none fixed bottom-14 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-1.5" aria-live="polite">
      {toasts.map((t) => (
        <button
          type="button"
          key={t.id}
          onClick={() => remove(t.id)}
          className={`anim-in pointer-events-auto max-w-md rounded border px-3 py-1.5 text-sm shadow-lg ${
            t.tone === 'bad' ? 'border-danger/60 bg-[#2a1414] text-[#f3c2bc]' : t.tone === 'good' ? 'border-good/50 bg-[#132418] text-[#cdebd0]' : 'border-line-2 bg-panel-2 text-ink'
          }`}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${checked ? 'border-gold-2 bg-gold/70' : 'border-line-2 bg-panel-3'}`}
    >
      <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-ink transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex overflow-hidden rounded-[3px] border border-line-2">
      {options.map((o) => (
        <button
          type="button"
          key={String(o.value)}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 text-xs transition-colors ${o.value === value ? 'bg-gold/85 text-[#1a1408]' : 'bg-panel-2 text-ink-2 hover:bg-panel-3'} border-l border-line-2 first:border-l-0`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sanallaştırılmış liste (uzun listelerde yalnızca görünen satırlar çizilir)
// ---------------------------------------------------------------------------
export function VirtualList<T>({ items, rowHeight, render, className = '', overscan = 6 }: { items: T[]; rowHeight: number; render: (item: T, index: number) => ReactNode; className?: string; overscan?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState(0);
  const [height, setHeight] = useState(400);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setHeight(el.clientHeight || 400);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const start = Math.max(0, Math.floor(scroll / rowHeight) - overscan);
  const end = Math.min(items.length, Math.ceil((scroll + height) / rowHeight) + overscan);
  return (
    <div ref={ref} className={`overflow-y-auto ${className}`} onScroll={(e) => setScroll((e.target as HTMLDivElement).scrollTop)}>
      <div style={{ height: items.length * rowHeight, position: 'relative' }}>
        {items.slice(start, end).map((it, i) => (
          <div key={start + i} style={{ position: 'absolute', top: (start + i) * rowHeight, left: 0, right: 0, height: rowHeight }}>
            {render(it, start + i)}
          </div>
        ))}
      </div>
    </div>
  );
}
