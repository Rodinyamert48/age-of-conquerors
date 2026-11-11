'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, FolderOpen, Trash2, Upload } from 'lucide-react';
import MenuFrame from '@/components/MenuFrame';
import { Button, Flag, useConfirm, useToasts } from '@/components/ui';
import { useT, useLang } from '@/i18n';
import { deleteSave, exportSaveFile, importSaveFile, listSaves, readSave, type SaveMeta } from '@/lib/saves';
import { useGame } from '@/store/game';
import { formatDate } from '@/lib/format';

export default function SavesPage() {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const ask = useConfirm((s) => s.ask);
  const push = useToasts((s) => s.push);
  const active = useGame((s) => s.state);
  const [saves, setSaves] = useState<SaveMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    listSaves()
      .then((l) => {
        setSaves(l);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const confirmReplace = async () => {
    if (!active) return true;
    return ask({ title: t('common.load'), body: t('saves.loadConfirm'), confirmLabel: t('common.confirm'), cancelLabel: t('common.cancel') });
  };

  const load = async (m: SaveMeta) => {
    if (!(await confirmReplace())) return;
    try {
      await useGame.getState().init();
      const world = useGame.getState().world!;
      const st = await readSave(m.id, world.P);
      await useGame.getState().loadState(st);
      router.push('/play');
    } catch (e) {
      push(t('saves.loadError', { error: e instanceof Error ? e.message : String(e) }), 'bad');
    }
  };

  const remove = async (m: SaveMeta) => {
    const ok = await ask({ title: t('common.delete'), body: t('saves.deleteConfirm', { name: m.name }), confirmLabel: t('common.delete'), cancelLabel: t('common.cancel'), danger: true });
    if (!ok) return;
    await deleteSave(m.id);
    refresh();
  };

  const exportOne = async (m: SaveMeta) => {
    try {
      const st = await readSave(m.id);
      exportSaveFile(st, `aoc-${m.player}-${m.day}.json`);
    } catch (e) {
      push(t('saves.loadError', { error: e instanceof Error ? e.message : String(e) }), 'bad');
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (!(await confirmReplace())) return;
    try {
      await useGame.getState().init();
      const world = useGame.getState().world!;
      const st = await importSaveFile(f, world.P);
      await useGame.getState().loadState(st);
      push(t('saves.imported'), 'good');
      router.push('/play');
    } catch (e) {
      push(t('saves.loadError', { error: e instanceof Error ? e.message : String(e) }), 'bad');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <MenuFrame
      title={t('saves.title')}
      actions={
        <>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          <Button size="sm" onClick={() => fileRef.current?.click()}>
            <Upload size={14} /> {t('saves.importFile')}
          </Button>
        </>
      }
    >
      {error && <p className="text-sm text-danger">{t('saves.loadError', { error })}</p>}
      {saves && saves.length === 0 && <p className="text-sm text-muted">{t('saves.empty')}</p>}
      <ul className="flex flex-col gap-1.5">
        {saves?.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 rounded border border-line-2 bg-panel/90 px-3 py-2">
            {m.playerFlag && <Flag code={m.playerFlag} className="h-7" />}
            <div className="min-w-0 flex-1">
              <div className="truncate text-ink">{m.name}</div>
              <div className="text-xs text-muted">
                <span className="rounded bg-panel-3 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-gold-soft">{t(`saves.kind.${m.kind}`)}</span> {m.playerName} · {m.scenarioName} ·{' '}
                {t('saves.date')}: {formatDate(m.day, lang)} · {t('saves.provinces', { n: m.provinces })} · {t('saves.turn')} {m.turn}
              </div>
              <div className="text-[11px] text-faint">
                {t('saves.savedAt')}: {new Date(m.savedAt).toLocaleString(lang)} · {t('saves.version')} {m.version}
              </div>
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="primary" onClick={() => load(m)}>
                <FolderOpen size={14} /> {t('common.load')}
              </Button>
              <Button size="sm" onClick={() => exportOne(m)} title={t('common.export')}>
                <Download size={14} />
              </Button>
              <Button size="sm" variant="danger" onClick={() => remove(m)} title={t('common.delete')}>
                <Trash2 size={14} />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </MenuFrame>
  );
}
