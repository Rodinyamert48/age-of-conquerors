'use client';
import { useCallback, useEffect, useMemo } from 'react';
import { useGame } from '@/store/game';
import { useUI, type LeftTab } from '@/store/ui';
import { useSettings, type KeyAction } from '@/store/settings';
import { useT } from '@/i18n';
import MapCanvas, { type MapClick, type MapHover } from '@/components/map/MapCanvas';
import type { Selection } from '@/components/map/renderer';
import TopBar from './TopBar';
import LeftPanel from './LeftPanel';
import RightPanel from './RightPanel';
import PeaceDialog from './PeaceDialog';
import { GameOverDialog, HoverTooltip, MapModeBar, NotificationLog, PauseMenu } from './Overlays';
import { useCommand, useReadCtx } from './hooks';
import { findPath } from '@/game/movement';
import { MAP_MODES } from '@/components/map/modes';
import { useToasts } from '@/components/ui';

const TAB_KEYS: Partial<Record<KeyAction, LeftTab>> = {
  tabCountry: 'country',
  tabArmies: 'armies',
  tabDiplomacy: 'diplomacy',
  tabEconomy: 'economy',
  tabResearch: 'research',
  tabPolicies: 'policies',
  tabWars: 'wars',
};

export default function GameScreen() {
  const t = useT();
  const world = useGame((s) => s.world);
  const geo = useGame((s) => s.geo);
  const state = useGame((s) => s.state);
  const error = useGame((s) => s.error);
  const ctx = useReadCtx();
  const ui = useUI();
  const cmd = useCommand();
  const push = useToasts((s) => s.push);

  // Hata bildirimi
  useEffect(() => {
    if (error) {
      push(error, 'bad');
      useGame.getState().clearError();
    }
  }, [error, push]);

  // Başlangıçta başkente odaklan
  useEffect(() => {
    if (!state || !ctx) return;
    const cap = state.countries[state.player]?.capital;
    if (cap !== undefined && cap >= 0) ui.focusOn(ctx.w.x[cap], ctx.w.y[cap], 0.55);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.player]);

  const issueMove = useCallback(
    async (node: number) => {
      const st = useGame.getState().state;
      if (!st) return;
      const ids = useUI.getState().selectedArmies.filter((id) => st.armies[id]?.owner === st.player);
      if (!ids.length) return;
      let ok = 0;
      for (const id of ids) {
        const a = st.armies[id];
        if (!a.isNavy && node >= (ctx?.w.P ?? 0)) continue;
        const r = await useGame.getState().command({ type: 'moveArmy', army: id, target: node });
        if (r.ok) ok++;
        else push(t(r.error ?? 'err.unknown', r.errorParams), 'bad');
      }
      if (ok) useUI.getState().setMoveMode(false);
    },
    [ctx, push, t],
  );

  const onClick = useCallback(
    (c: MapClick) => {
      const st = useGame.getState().state;
      if (!st) return;
      const u = useUI.getState();
      const node = c.province >= 0 ? c.province : c.seaNode;
      // Sağ tık: seçili ordulara hareket emri
      if (c.button === 2) {
        if (u.selectedArmies.length && node >= 0) void issueMove(node);
        return;
      }
      if (u.moveMode && u.selectedArmies.length && node >= 0) {
        void issueMove(node);
        return;
      }
      if (c.battle) {
        u.openRight({ kind: 'battle', id: c.battle });
        return;
      }
      if (c.army) {
        if (c.shift) u.toggleArmy(c.army);
        else u.selectArmies([c.army]);
        return;
      }
      if (c.province >= 0) {
        useUI.setState({ selectedArmies: [], moveMode: false });
        u.openRight({ kind: 'province', id: c.province });
        return;
      }
      u.clearSelection();
    },
    [issueMove],
  );

  const onHover = useCallback((h: MapHover | null) => {
    const cur = useUI.getState().hover;
    if (!h && !cur) return;
    useUI.getState().setHover(h);
  }, []);

  // Rota önizlemesi (seçili ordu varken imleç altındaki hedefe)
  const hoverNode = ui.hover ? (ui.hover.province >= 0 ? ui.hover.province : ui.hover.seaNode) : -1;
  const previewArmy = ui.selectedArmies[0] ?? null;
  const previewPath = useMemo(() => {
    if (!ctx || !previewArmy || hoverNode < 0) return null;
    const a = ctx.s.armies[previewArmy];
    if (!a || a.owner !== ctx.s.player || a.battle) return null;
    if (!a.isNavy && hoverNode >= ctx.w.P) return null;
    if (!ui.moveMode) return null;
    return findPath(ctx, a, hoverNode)?.path ?? null;
  }, [ctx, previewArmy, hoverNode, ui.moveMode]);

  const selection: Selection = useMemo(() => {
    const r = ui.right;
    let country: string | null = state?.player ?? null;
    if (r?.kind === 'country') country = r.tag;
    else if (r?.kind === 'province' && state) country = state.provinces[r.id].owner;
    return {
      province: r?.kind === 'province' ? r.id : null,
      country,
      armies: ui.selectedArmies,
      battle: r?.kind === 'battle' ? r.id : null,
    };
  }, [ui.right, ui.selectedArmies, state]);

  // Klavye kısayolları
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useSettings.getState();
      if (!s.keyboardShortcuts) return;
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT' || tgt.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]') && e.code !== s.keys.deselect) return;
      const action = (Object.keys(s.keys) as KeyAction[]).find((k) => s.keys[k] === e.code);
      if (!action) return;
      const g = useGame.getState();
      const u = useUI.getState();
      e.preventDefault();
      switch (action) {
        case 'togglePause':
          g.togglePlay();
          break;
        case 'step':
          g.step();
          break;
        case 'speedUp':
          g.setSpeed(g.speed + 1);
          break;
        case 'speedDown':
          g.setSpeed(g.speed - 1);
          break;
        case 'speed1':
        case 'speed2':
        case 'speed3':
        case 'speed4':
        case 'speed5':
          g.setSpeed(Number(action.slice(-1)));
          break;
        case 'cycleMapMode': {
          const i = MAP_MODES.indexOf(u.mapMode);
          u.setMapMode(MAP_MODES[(i + 1) % MAP_MODES.length]);
          break;
        }
        case 'quickSave':
          g.save('quick', 'Hızlı kayıt').then(() => push(t('pause.quickSaved'), 'good'));
          break;
        case 'deselect':
          if (u.moveMode) u.setMoveMode(false);
          else if (u.right || u.selectedArmies.length) u.clearSelection();
          else if (u.leftTab) u.setLeftTab(null);
          else u.setPauseMenu(true);
          break;
        case 'centerCapital': {
          const st = g.state;
          const r = readCapital(st);
          if (r !== null && g.world) u.focusOn(g.world.x[r], g.world.y[r], 1);
          break;
        }
        default: {
          const tab = TAB_KEYS[action];
          if (tab) u.toggleLeftTab(tab);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [push, t]);

  if (!world || !geo || !state) return null;
  void cmd;

  return (
    <div className="flex h-full flex-col bg-bg">
      <TopBar />
      <div className="relative flex min-h-0 flex-1">
        <LeftPanel />
        <div className="relative min-w-0 flex-1">
          <MapCanvas
            world={world}
            geo={geo}
            state={state}
            ctx={ctx}
            mode={ui.mapMode}
            viewer={state.player}
            selection={selection}
            showSeaNodes={ui.moveMode && ui.selectedArmies.some((id) => state.armies[id]?.isNavy)}
            previewPath={previewPath}
            previewArmy={previewArmy}
            onClick={onClick}
            onHover={onHover}
            focus={ui.focus}
          />
          <MapModeBar />
          <HoverTooltip />
          {ui.moveMode && (
            <div className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded border border-gold-2 bg-panel/90 px-3 py-1 text-xs text-gold-soft">{t('army.moveMode')}</div>
          )}
        </div>
        <RightPanel />
      </div>
      <NotificationLog />
      <PeaceDialog />
      <PauseMenu />
      <GameOverDialog />
    </div>
  );
}

function readCapital(st: ReturnType<typeof useGame.getState>['state']): number | null {
  if (!st) return null;
  const c = st.countries[st.player];
  return c && c.capital >= 0 ? c.capital : null;
}
