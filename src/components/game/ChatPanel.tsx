'use client';
import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { useGame } from '@/store/game';
import { useOnline } from '@/store/online';
import { useT, useLang } from '@/i18n';
import { Flag } from '@/components/ui';

/** Çevrimiçi sohbet: herkese ya da tek bir oyuncuya (gizli) mesaj. Anlaşmalar diplomasi ekranından teklif edilir. */
export default function ChatPanel() {
  const t = useT();
  const lang = useLang();
  const state = useGame((s) => s.state);
  const role = useOnline((s) => s.role);
  const chat = useOnline((s) => s.chat);
  const unread = useOnline((s) => s.unread);
  const humans = useOnline((s) => s.humans);
  const reconnecting = useOnline((s) => s.reconnecting);
  const error = useOnline((s) => s.error);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [to, setTo] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) {
      end.current?.scrollIntoView({ block: 'end' });
      useOnline.getState().markRead();
    }
  }, [open, chat.length]);
  if (!state || role === 'none') return null;
  const me = state.player;
  const nameOf = (tag: string) => (lang === 'en' ? state.countries[tag]?.nameEn : state.countries[tag]?.name) ?? tag;
  const send = () => {
    useOnline.getState().sendChat(text, to || null);
    setText('');
  };
  return (
    <>
      {(reconnecting || (role === 'guest' && error)) && (
        <div className="pointer-events-none absolute left-1/2 top-14 z-40 -translate-x-1/2 rounded border border-danger bg-panel px-3 py-1.5 text-xs text-danger shadow-lg">
          {reconnecting ? t('online.reconnecting') : t(error ?? 'online.disconnected')}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={t('online.chat')}
        title={t('online.chat')}
        className="absolute bottom-24 right-2 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-gold-2 bg-panel text-gold shadow-lg hover:bg-panel-2"
      >
        <MessageCircle size={18} />
        {unread > 0 && !open && <span className="absolute -right-1 -top-1 rounded-full bg-danger px-1.5 text-[10px] leading-4 text-white">{unread}</span>}
      </button>
      {open && (
        <div className="absolute bottom-36 right-2 z-30 flex h-80 w-[min(22rem,calc(100vw-1rem))] flex-col rounded border border-line-2 bg-panel shadow-2xl">
          <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
            <span className="font-display text-gold-soft">{t('online.chat')}</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Kapat" className="text-muted hover:text-ink">
              <X size={16} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-xs">
            {chat.length === 0 && <p className="text-muted">{t('online.chatHint')}</p>}
            {chat.map((m, i) => (
              <div key={i} className={`mb-1.5 ${m.from === me ? 'text-right' : ''}`}>
                <div className="inline-flex items-center gap-1 text-[10px] text-muted">
                  <Flag code={state.countries[m.from]?.flag ?? 'x-unknown'} className="h-2.5" />
                  {nameOf(m.from)}
                  {m.to && <span className="text-warn">→ {nameOf(m.to)}</span>}
                </div>
                <div className={`mt-0.5 inline-block max-w-[85%] break-words rounded px-2 py-1 text-left ${m.from === me ? 'bg-gold/20 text-ink' : 'bg-panel-2 text-ink-2'}`}>{m.text}</div>
              </div>
            ))}
            <div ref={end} />
          </div>
          <div className="flex gap-1 border-t border-line p-1.5">
            <select value={to} onChange={(e) => setTo(e.target.value)} className="w-24 rounded border border-line-2 bg-bg-2 px-1 text-xs" aria-label={t('online.chatTo')}>
              <option value="">{t('online.everyone')}</option>
              {humans
                .filter((h) => h !== me)
                .map((h) => (
                  <option key={h} value={h}>
                    {nameOf(h)}
                  </option>
                ))}
            </select>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') send();
              }}
              maxLength={400}
              placeholder={t('online.chatPlaceholder')}
              className="min-w-0 flex-1 rounded border border-line-2 bg-bg-2 px-2 py-1 text-xs"
            />
            <button type="button" onClick={send} aria-label={t('online.send')} className="rounded border border-gold-2 px-2 text-gold hover:bg-gold/10">
              <Send size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
