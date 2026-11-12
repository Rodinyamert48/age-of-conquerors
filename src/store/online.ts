'use client';
/**
 * Çevrimiçi mod: oda sahibi oyunun tek sahibidir (sunucu). Konuklar komut gönderir ve durum alır.
 * Tur, tüm insan oyuncular "hazırım" (Boşluk) deyince ilerler.
 */
import { create } from 'zustand';
import { Peer, type NetMessage } from '@/net/p2p';
import { commandAs, receiveGuestState, setHumansInWorker, setNetHooks, stepNow, useGame } from './game';
import type { Command } from '@/game/commands';
import type { CommandResult, GameState } from '@/game/types';

export interface Seat {
  id: number;
  tag: string;
  name: string;
  status: 'waiting' | 'connected' | 'closed';
  offer: string;
}

interface OnlineStore {
  role: 'none' | 'host' | 'guest';
  myTag: string | null;
  seats: Seat[];
  ready: string[];
  humans: string[];
  error: string | null;
  /** Oda sahibi: bir ülke için davet kodu üret */
  invite: (tag: string) => Promise<Seat>;
  /** Oda sahibi: konuğun cevap kodunu gir */
  accept: (seatId: number, answer: string) => Promise<void>;
  /** Konuk: davet koduyla katıl, cevap kodunu döndür */
  join: (offer: string, name: string) => Promise<string>;
  leave: () => void;
}

const peers = new Map<number, Peer>();
let guestPeer: Peer | null = null;
let nextSeat = 1;
let sending = false;
let latest: GameState | null = null;
let lastTurn = -1;
const pendingResults = new Map<number, (r: CommandResult) => void>();
let nextCmd = 1;

function set(p: Partial<OnlineStore>) {
  useOnline.setState(p);
}

function broadcastReady() {
  const st = useOnline.getState();
  for (const peer of peers.values()) peer.send({ t: 'readyList', tags: st.ready, humans: st.humans });
}

function connectedHumans(): string[] {
  const me = useGame.getState().state?.player;
  const tags = useOnline.getState().seats.filter((s) => s.status === 'connected').map((s) => s.tag);
  return me ? [me, ...tags] : tags;
}

function checkAllReady() {
  const st = useOnline.getState();
  if (st.role !== 'host') return;
  const humans = connectedHumans();
  set({ humans });
  if (humans.length > 0 && humans.every((h) => st.ready.includes(h))) {
    set({ ready: [] });
    stepNow();
  }
  broadcastReady();
}

async function pumpState() {
  if (sending) return;
  sending = true;
  try {
    while (latest) {
      const s = latest;
      latest = null;
      const json = JSON.stringify(s);
      await Promise.all([...peers.values()].map((p) => p.sendState(json)));
    }
  } finally {
    sending = false;
  }
}

function onHostState(state: GameState) {
  // Yeni tur: hazır listesi sıfırlanır
  if (state.turn !== lastTurn) {
    lastTurn = state.turn;
    if (useOnline.getState().ready.length) set({ ready: [] });
  }
  latest = state;
  void pumpState();
}

function hostMessage(seat: Seat, peer: Peer, m: NetMessage) {
  const st = useOnline.getState();
  if (m.t === 'hello') {
    set({ seats: st.seats.map((x) => (x.id === seat.id ? { ...x, name: m.name || x.name } : x)) });
  } else if (m.t === 'cmd') {
    void commandAs(seat.tag, m.cmd as Command).then((result) => peer.send({ t: 'result', id: m.id, result }));
  } else if (m.t === 'ready') {
    const ready = m.on ? Array.from(new Set([...st.ready, seat.tag])) : st.ready.filter((x) => x !== seat.tag);
    set({ ready });
    checkAllReady();
  } else if (m.t === 'bye') {
    peer.close();
  }
}

function activateHost() {
  setNetHooks({
    role: 'host',
    step: () => {
      const st = useOnline.getState();
      const me = useGame.getState().state?.player;
      if (!me) return;
      const on = !st.ready.includes(me);
      set({ ready: on ? [...st.ready, me] : st.ready.filter((x) => x !== me) });
      checkAllReady();
    },
    onState: onHostState,
    close: () => useOnline.getState().leave(),
  });
  set({ role: 'host', myTag: useGame.getState().state?.player ?? null });
}

export const useOnline = create<OnlineStore>()((_set, get) => ({
  role: 'none',
  myTag: null,
  seats: [],
  ready: [],
  humans: [],
  error: null,

  invite: async (tag) => {
    if (get().role === 'none') activateHost();
    const peer = new Peer();
    const id = nextSeat++;
    peers.set(id, peer);
    const offer = await peer.createOffer();
    const seat: Seat = { id, tag, name: '', status: 'waiting', offer };
    set({ seats: [...get().seats, seat] });
    peer.onMessage = (m) => hostMessage(seat, peer, m);
    peer.onOpen = () => {
      set({ seats: get().seats.map((x) => (x.id === id ? { ...x, status: 'connected' } : x)) });
      const humans = connectedHumans();
      setHumansInWorker(humans);
      peer.send({ t: 'welcome', tag });
      set({ humans });
      const cur = useGame.getState().state;
      if (cur) {
        latest = cur;
        void pumpState();
      }
      broadcastReady();
    };
    peer.onClose = () => {
      peers.delete(id);
      set({ seats: get().seats.map((x) => (x.id === id ? { ...x, status: 'closed' } : x)), ready: get().ready.filter((r) => r !== tag) });
      setHumansInWorker(connectedHumans());
      checkAllReady();
    };
    return seat;
  },

  accept: async (seatId, answer) => {
    const peer = peers.get(seatId);
    if (!peer) throw new Error('Davet bulunamadı');
    await peer.acceptAnswer(answer);
  },

  join: async (offer, name) => {
    if (get().role !== 'none') throw new Error('Zaten çevrimiçi');
    const peer = new Peer();
    guestPeer = peer;
    const answer = await peer.acceptOffer(offer);
    peer.onOpen = () => peer.send({ t: 'hello', name });
    peer.onMessage = (m) => {
      if (m.t === 'welcome') {
        set({ myTag: m.tag, role: 'guest' });
        setNetHooks({
          role: 'guest',
          command: (cmd) =>
            new Promise<CommandResult>((resolve) => {
              const id = nextCmd++;
              pendingResults.set(id, resolve);
              peer.send({ t: 'cmd', id, cmd });
            }),
          step: () => {
            const me = get().myTag;
            if (!me) return;
            peer.send({ t: 'ready', on: !get().ready.includes(me) });
          },
          close: () => get().leave(),
        });
      } else if (m.t === 'result') {
        const r = pendingResults.get(m.id);
        pendingResults.delete(m.id);
        r?.(m.result as CommandResult);
      } else if (m.t === 'readyList') {
        set({ ready: m.tags, humans: m.humans });
      }
    };
    peer.onState = (json) => {
      const tag = get().myTag;
      if (!tag) return;
      const st = JSON.parse(json) as GameState;
      st.player = tag;
      void receiveGuestState(st);
    };
    peer.onClose = () => {
      if (get().role === 'guest') set({ error: 'online.disconnected' });
    };
    return answer;
  },

  leave: () => {
    for (const p of peers.values()) {
      p.send({ t: 'bye' });
      p.close();
    }
    peers.clear();
    guestPeer?.send({ t: 'bye' });
    guestPeer?.close();
    guestPeer = null;
    latest = null;
    setNetHooks(null);
    set({ role: 'none', myTag: null, seats: [], ready: [], humans: [] });
  },
}));
