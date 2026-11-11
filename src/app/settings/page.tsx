'use client';
import { useEffect, useState } from 'react';
import MenuFrame from '@/components/MenuFrame';
import { Button, SectionTitle, Segmented, Toggle, useConfirm } from '@/components/ui';
import { useT } from '@/i18n';
import { useSettings, DEFAULT_KEYS, type AutosaveFrequency, type KeyAction, type MapQuality } from '@/store/settings';
import type { Difficulty, MapMode, NotificationKind, TimeStep } from '@/game/types';
import { MAP_MODES } from '@/components/map/modes';
import { playSound } from '@/lib/audio';

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 py-2">
      <div>
        <div className="text-sm text-ink-2">{label}</div>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function keyLabel(code: string): string {
  if (code === 'Space') return '␣';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Equal') return '+';
  if (code === 'Minus') return '−';
  if (code === 'Escape') return 'Esc';
  return code;
}

export default function SettingsPage() {
  const t = useT();
  const s = useSettings();
  const ask = useConfirm((st) => st.ask);
  const [listening, setListening] = useState<KeyAction | null>(null);

  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      useSettings.getState().setKey(listening, e.code);
      setListening(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listening]);

  const kinds: NotificationKind[] = ['war', 'peace', 'battle', 'province', 'treaty', 'construction', 'recruit', 'economy', 'rebellion', 'research', 'event', 'diplomacy', 'system'];

  return (
    <MenuFrame title={t('settings.title')}>
      <p className="mb-2 text-xs text-muted">{t('settings.saved')}</p>
      <div className="rounded border border-line bg-panel/90 px-4 py-2">
        <SectionTitle>{t('settings.general')}</SectionTitle>
        <Row label={t('settings.language')}>
          <Segmented value={s.language} onChange={(v) => s.set({ language: v })} options={[{ value: 'tr', label: 'Türkçe' }, { value: 'en', label: 'English' }]} />
        </Row>

        <SectionTitle>{t('settings.audio')}</SectionTitle>
        <Row label={t('settings.sound')}>
          <Toggle checked={s.soundEnabled} onChange={(v) => s.set({ soundEnabled: v })} label={t('settings.sound')} />
        </Row>
        <Row label={t('settings.soundVolume')}>
          <input type="range" min={0} max={1} step={0.05} value={s.soundVolume} onChange={(e) => s.set({ soundVolume: Number(e.target.value) })} onMouseUp={() => playSound('notify')} className="w-40" />
        </Row>
        <Row label={t('settings.music')}>
          <Toggle checked={s.musicEnabled} onChange={(v) => s.set({ musicEnabled: v })} label={t('settings.music')} />
        </Row>
        <Row label={t('settings.musicVolume')}>
          <input type="range" min={0} max={1} step={0.05} value={s.musicVolume} onChange={(e) => s.set({ musicVolume: Number(e.target.value) })} className="w-40" />
        </Row>

        <SectionTitle>{t('settings.graphics')}</SectionTitle>
        <Row label={t('settings.animations')}>
          <Toggle checked={s.animations} onChange={(v) => s.set({ animations: v })} label={t('settings.animations')} />
        </Row>
        <Row label={t('settings.mapQuality')} hint={t('settings.qualityHint')}>
          <Segmented value={s.mapQuality} onChange={(v: MapQuality) => s.set({ mapQuality: v })} options={(['low', 'medium', 'high'] as MapQuality[]).map((q) => ({ value: q, label: t(`settings.quality.${q}`) }))} />
        </Row>
        <Row label={t('settings.defaultMapMode')}>
          <select value={s.defaultMapMode} onChange={(e) => s.set({ defaultMapMode: e.target.value as MapMode })} className="rounded border border-line-2 bg-bg-2 px-2 py-1 text-sm">
            {MAP_MODES.map((m) => (
              <option key={m} value={m}>
                {t(`mapMode.${m}`)}
              </option>
            ))}
          </select>
        </Row>

        <SectionTitle>{t('settings.gameplay')}</SectionTitle>
        <Row label={t('settings.defaultDifficulty')}>
          <Segmented value={s.defaultDifficulty} onChange={(v: Difficulty) => s.set({ defaultDifficulty: v })} options={(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => ({ value: d, label: t(`difficulty.${d}`) }))} />
        </Row>
        <Row label={t('settings.defaultSpeed')}>
          <Segmented value={s.defaultSpeed} onChange={(v: number) => s.set({ defaultSpeed: v })} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))} />
        </Row>
        <Row label={t('settings.defaultTimeStep')} hint={t('timeStep.desc')}>
          <Segmented value={s.defaultTimeStep} onChange={(v: TimeStep) => s.set({ defaultTimeStep: v })} options={(['day', 'week', 'month'] as TimeStep[]).map((d) => ({ value: d, label: t(`timeStep.${d}`) }))} />
        </Row>
        <Row label={t('settings.autosave')}>
          <Segmented
            value={s.autosave}
            onChange={(v: AutosaveFrequency) => s.set({ autosave: v })}
            options={(['off', 'monthly', 'quarterly', 'yearly'] as AutosaveFrequency[]).map((d) => ({ value: d, label: t(`settings.autosave.${d}`) }))}
          />
        </Row>

        <SectionTitle>{t('settings.notifications')}</SectionTitle>
        <p className="text-xs text-muted">{t('settings.notificationsHint')}</p>
        <div className="mt-1 grid grid-cols-2 gap-x-6 sm:grid-cols-3">
          {kinds.map((k) => (
            <label key={k} className="flex items-center justify-between gap-2 py-1 text-sm text-ink-2">
              {t(`notifKind.${k}`)}
              <Toggle checked={s.notifications[k] !== false} onChange={(v) => s.set({ notifications: { ...s.notifications, [k]: v } })} label={t(`notifKind.${k}`)} />
            </label>
          ))}
        </div>

        <SectionTitle>{t('settings.keyboard')}</SectionTitle>
        <Row label={t('settings.keyboardEnabled')}>
          <Toggle checked={s.keyboardShortcuts} onChange={(v) => s.set({ keyboardShortcuts: v })} label={t('settings.keyboardEnabled')} />
        </Row>
        <div className="grid gap-x-6 sm:grid-cols-2">
          {(Object.keys(DEFAULT_KEYS) as KeyAction[]).map((k) => (
            <div key={k} className="flex items-center justify-between gap-2 border-b border-line/40 py-1 text-sm">
              <span className="text-ink-2">{t(`key.${k}`)}</span>
              <button
                type="button"
                onClick={() => setListening(k)}
                className={`min-w-14 rounded border px-2 py-0.5 text-xs ${listening === k ? 'border-gold bg-gold/20 text-gold' : 'border-line-2 bg-panel-2 text-ink'}`}
              >
                {listening === k ? t('settings.pressKey') : keyLabel(s.keys[k])}
              </button>
            </div>
          ))}
        </div>
        <div className="py-3">
          <Button
            variant="danger"
            onClick={async () => {
              const ok = await ask({ title: t('settings.resetAll'), body: t('settings.resetConfirm'), confirmLabel: t('common.confirm'), cancelLabel: t('common.cancel'), danger: true });
              if (ok) s.reset();
            }}
          >
            {t('settings.resetAll')}
          </Button>
        </div>
      </div>
    </MenuFrame>
  );
}
