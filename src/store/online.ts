'use client';
/**
 * Çevrimiçi mod: oda sahibi oyunun tek sahibidir (sunucu). Konuklar komut gönderir ve durum alır.
 * Tur, tüm insan oyuncular "hazırım" (Boşluk) deyince ya da oda sahibinin koyduğu süre dolunca ilerler.
 * Bağlantı iki yolla kurulur: elle kod alışverişi ya da oda linki (isteğe bağlı sinyalleşme servisi).
 */
import { create } from 'zustand';
import { Peer, type NetMessage } from '@/net/p2p';
import { guestTopic, hostTopic, publish, randomId, subscribe, type SignalMessage } from '@/net/signal';
import { commandAs, receiveGuestState, setHumansInWorker, setNetHooks, stepNow, useGame, viewFor } from './game';
import type { Command } from '@/game/commands';
import type { CommandResult, GameState } from '@/game/types';
import { asset } from '@/lib/base';

export interface Seat {
  id: number;
  tag: string;
  name: string;
  status: 'waiting' | 'connected' | 'closed';
  offer: string;
  /** oda linkiyle katılan konuğun kimliği (yeniden bağlanma için) */
  guest?: string;
}

export interface ChatMessage {
  from: string;
  to: string | null;
  text: string;
  at: number;
}

interface OnlineStore {
  role: 'none' | 'host' | 'guest';
  myTag: string | null;
  seats: Seat[];
  ready: string[];
  humans: string[];
  error: string | null;
  chat: ChatMessage[];
  unread: number;
  /** tur süresi sınırı (saniye; 0 = sınırsız) ve bitiş anı */
  turnLimit: number;
  deadline: number | null;
  /** oda linki için oda kimliği */
  room: string | null;
  roomError: boolean;
  /** konuk: bağlantı koptu, yeniden deneniyor */
  reconnecting: boolean;
  invite: (tag: string) => Promise<Seat>;
  accept: (seatId: number, answer: string) => Promise<void>;
  join: (offer: string, name: string) => Promise<string>;
  /** Oda sahibi: oda linkini etkinleştir */
  openRoom: () => string;
  roomLink: (tag: string) => string;
  /** Konuk: oda linkiyle katıl */
  joinRoom: (room: string, tag: string, name: string) => Promise<void>;
  setTurnLimit: (seconds: number) => void;
  sendChat: (text: string, to: string | null) => void;
  markRead: () => void;
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
let unsubRoom: (() => void) | null = null;
let unsubGuest: (() => void) | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let retry: ReturnType<typeof setInterval> | null = null;
let guestSession: { room: string; tag: string; name: string; guest: string } | null = null;

function set(p: Partial<OnlineStore>) {
  useOnline.setState(p);
}

function left(): number {
  const d = useOnline.getState().deadline;
  return d ? Math.max(0, Math.round((d - Date.now()) / 1000)) : 0;
}

function broadcastReady() {
  const st = useOnline.getState();
  for (const peer of peers.values()) peer.send({ t: 'readyList', tags: st.ready, humans: st.humans, limit: st.turnLimit, left: left() });
}

function connectedHumans(): string[] {
  const me = useGame.getState().state?.player;
  const tags = useOnline.getState().seats.filter((s) => s.status === 'connected').map((s) => s.tag);
  return me ? [me, ...tags] : tags;
}

function restartClock() {
  const st = useOnline.getState();
  set({ deadline: st.turnLimit > 0 && connectedHumans().length > 1 ? Date.now() + st.turnLimit * 1000 : null });
}

function advance() {
  set({ ready: [] });
  stepNow();
}

function checkAllReady() {
  const st = useOnline.getState();
  if (st.role !== 'host') return;
  const humans = connectedHumans();
  set({ humans });
  if (humans.length > 0 && humans.every((h) => st.ready.includes(h))) advance();
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
  // Yeni tur: hazır listesi ve süre sıfırlanır
  if (state.turn !== lastTurn) {
    lastTurn = state.turn;
    if (useOnline.getState().ready.length) set({ ready: [] });
    restartClock();
    broadcastReady();
  }
  latest = state;
  void pumpState();
}

function addChat(m: ChatMessage, mine = false) {
  const st = useOnline.getState();
  set({ chat: [...st.chat.slice(-199), m], unread: mine ? st.unread : st.unread + 1 });
}

function seatOf(id: number): Seat | undefined {
  return useOnline.getState().seats.find((s) => s.id === id);
}

function hostMessage(seatId: number, peer: Peer, m: NetMessage) {
  const st = useOnline.getState();
  const seat = seatOf(seatId);
  if (!seat) return;
  if (m.t === 'hello') {
    set({ seats: st.seats.map((x) => (x.id === seatId ? { ...x, name: m.name || x.name } : x)) });
  } else if (m.t === 'cmd') {
    void commandAs(seat.tag, m.cmd as Command).then((result) => peer.send({ t: 'result', id: m.id, result }));
  } else if (m.t === 'ready') {
    const ready = m.on ? Array.from(new Set([...st.ready, seat.tag])) : st.ready.filter((x) => x !== seat.tag);
    set({ ready });
    checkAllReady();
  } else if (m.t === 'chat') {
    // Gönderen etiketi sunucuda belirlenir (taklit edilemez)
    const msg: ChatMessage = { from: seat.tag, to: m.to, text: String(m.text).slice(0, 400), at: Date.now() };
    const me = useGame.getState().state?.player;
    if (msg.to === null || msg.to === me) addChat(msg);
    for (const s of st.seats) {
      if (s.id === seatId || s.status !== 'connected') continue;
      if (msg.to === null || msg.to === s.tag) peers.get(s.id)?.send({ t: 'chat', ...msg });
    }
  } else if (m.t === 'bye') {
    peer.close();
  }
}

function wirePeer(id: number, tag: string, peer: Peer) {
  const get = useOnline.getState;
  peer.onMessage = (m) => hostMessage(id, peer, m);
  peer.onOpen = () => {
    set({ seats: get().seats.map((x) => (x.id === id ? { ...x, status: 'connected' } : x)) });
    const humans = connectedHumans();
    setHumansInWorker(humans);
    peer.send({ t: 'welcome', tag });
    set({ humans });
    if (!get().deadline) restartClock();
    const cur = useGame.getState().rawState ?? useGame.getState().state;
    if (cur) {
      latest = cur;
      void pumpState();
    }
    broadcastReady();
  };
  peer.onClose = () => {
    if (peers.get(id) !== peer) return;
    peers.delete(id);
    set({ seats: get().seats.map((x) => (x.id === id ? { ...x, status: 'closed' } : x)), ready: get().ready.filter((r) => r !== tag) });
    setHumansInWorker(connectedHumans());
    checkAllReady();
  };
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
  // Tur süresi: dolunca bekleyenler hazır sayılır
  timer = setInterval(() => {
    const st = useOnline.getState();
    if (st.role !== 'host' || !st.deadline || Date.now() < st.deadline) return;
    if (useGame.getState().busy) return;
    set({ deadline: null });
    advance();
    broadcastReady();
  }, 500);
}

/** Oda linkiyle gelen katılma isteği */
async function handleJoin(room: string, m: Extract<SignalMessage, { t: 'join' }>) {
  const get = useOnline.getState;
  const state = useGame.getState().state;
  if (!state) return;
  const deny = (reason: string) => publish(guestTopic(room, m.guest), { t: 'deny', reason }).catch(() => {});
  const c = state.countries[m.tag];
  if (!c?.alive || c.rebelMovement || m.tag === 'REB' || m.tag === state.player) return void deny('online.countryUnavailable');
  const existing = get().seats.find((s) => s.tag === m.tag && s.status !== 'closed');
  if (existing && existing.guest !== m.guest) return void deny('online.countryTaken');
  // Yeniden bağlanma: eski bağlantı kapatılır, koltuk yenilenir
  let id = existing?.id;
  if (id !== undefined) {
    const old = peers.get(id);
    peers.delete(id);
    old?.close();
  } else {
    const prev = get().seats.find((s) => s.tag === m.tag && s.guest === m.guest);
    id = prev?.id ?? nextSeat++;
  }
  const peer = new Peer();
  peers.set(id, peer);
  const seat: Seat = { id, tag: m.tag, name: m.name, status: 'waiting', offer: '', guest: m.guest };
  set({ seats: [...get().seats.filter((s) => s.id !== id), seat] });
  wirePeer(id, m.tag, peer);
  try {
    const offer = await peer.createOffer();
    await publish(guestTopic(room, m.guest), { t: 'offer', sdp: offer });
  } catch {
    set({ roomError: true });
  }
}

export const useOnline = create<OnlineStore>()((_set, get) => ({
  role: 'none',
  myTag: null,
  seats: [],
  ready: [],
  humans: [],
  error: null,
  chat: [],
  unread: 0,
  turnLimit: 0,
  deadline: null,
  room: null,
  roomError: false,
  reconnecting: false,

  invite: async (tag) => {
    if (get().role === 'none') activateHost();
    const peer = new Peer();
    const id = nextSeat++;
    peers.set(id, peer);
    const offer = await peer.createOffer();
    const seat: Seat = { id, tag, name: '', status: 'waiting', offer };
    set({ seats: [...get().seats, seat] });
    wirePeer(id, tag, peer);
    return seat;
  },

  accept: async (seatId, answer) => {
    const peer = peers.get(seatId);
    if (!peer) throw new Error('Davet bulunamadı');
    await peer.acceptAnswer(answer);
  },

  openRoom: () => {
    if (get().role === 'none') activateHost();
    const existing = get().room;
    if (existing) return existing;
    const room = randomId(10);
    set({ room, roomError: false });
    unsubRoom = subscribe(
      hostTopic(room),
      (m) => {
        if (m.t === 'join') void handleJoin(room, m);
        else if (m.t === 'answer') {
          const seat = get().seats.find((s) => s.guest === m.guest && s.status === 'waiting');
          const peer = seat ? peers.get(seat.id) : undefined;
          peer?.acceptAnswer(m.sdp).catch(() => {});
        }
      },
      () => set({ roomError: true }),
    );
    return room;
  },

  roomLink: (tag) => {
    const room = get().room ?? get().openRoom();
    return `${window.location.origin}${asset('/online/')}?room=${room}&tag=${tag}`;
  },

  setTurnLimit: (seconds) => {
    set({ turnLimit: Math.max(0, Math.min(3600, Math.round(seconds))) });
    restartClock();
    broadcastReady();
  },

  sendChat: (text, to) => {
    const body = text.trim().slice(0, 400);
    const me = get().myTag ?? useGame.getState().state?.player;
    if (!body || !me) return;
    const msg: ChatMessage = { from: me, to, text: body, at: Date.now() };
    addChat(msg, true);
    if (get().role === 'guest') guestPeer?.send({ t: 'chat', ...msg });
    else
      for (const s of get().seats) {
        if (s.status !== 'connected') continue;
        if (to === null || to === s.tag) peers.get(s.id)?.send({ t: 'chat', ...msg });
      }
  },

  markRead: () => set({ unread: 0 }),

  join: async (offer, name) => {
    if (get().role !== 'none') throw new Error('Zaten çevrimiçi');
    const peer = new Peer();
    const answer = await peer.acceptOffer(offer);
    wireGuest(peer, name);
    return answer;
  },

  joinRoom: async (room, tag, name) => {
    let guest = '';
    try {
      const saved = JSON.parse(sessionStorage.getItem('aoc-online') ?? 'null') as typeof guestSession;
      if (saved && saved.room === room && saved.tag === tag) guest = saved.guest;
    } catch {
      /* oturum bilgisi yok */
    }
    if (!guest) guest = randomId(8);
    guestSession = { room, tag, name, guest };
    try {
      sessionStorage.setItem('aoc-online', JSON.stringify(guestSession));
    } catch {
      /* depolama kapalı olabilir */
    }
    set({ error: null });
    unsubGuest?.();
    unsubGuest = subscribe(
      guestTopic(room, guest),
      (m) => {
        if (m.t === 'deny') set({ error: m.reason });
        else if (m.t === 'offer') {
          guestPeer?.close();
          const peer = new Peer();
          wireGuest(peer, name);
          peer
            .acceptOffer(m.sdp)
            .then((sdp) => publish(hostTopic(room), { t: 'answer', guest, sdp }))
            .catch(() => set({ error: 'online.signalError' }));
        }
      },
      () => {
        if (get().role !== 'guest') set({ error: 'online.signalError' });
      },
    );
    // Abonelik kurulduktan hemen sonra katılma isteği
    await new Promise((r) => setTimeout(r, 600));
    await publish(hostTopic(room), { t: 'join', guest, tag, name });
  },

  leave: () => {
    for (const p of peers.values()) {
      p.send({ t: 'bye' });
      p.close();
    }
    peers.clear();
    guestSession = null;
    guestPeer?.send({ t: 'bye' });
    guestPeer?.close();
    guestPeer = null;
    latest = null;
    unsubRoom?.();
    unsubGuest?.();
    unsubRoom = unsubGuest = null;
    if (timer) clearInterval(timer);
    if (retry) clearInterval(retry);
    timer = retry = null;
    try {
      sessionStorage.removeItem('aoc-online');
    } catch {
      /* yok say */
    }
    setNetHooks(null);
    set({ role: 'none', myTag: null, seats: [], ready: [], humans: [], chat: [], unread: 0, deadline: null, room: null, reconnecting: false });
  },
}));

function wireGuest(peer: Peer, name: string) {
  const get = useOnline.getState;
  guestPeer = peer;
  peer.onOpen = () => {
    peer.send({ t: 'hello', name });
    if (retry) clearInterval(retry);
    retry = null;
    set({ reconnecting: false, error: null });
  };
  peer.onMessage = (m) => {
    if (m.t === 'welcome') {
      set({ myTag: m.tag, role: 'guest' });
      setNetHooks({
        role: 'guest',
        command: (cmd) =>
          new Promise<CommandResult>((resolve) => {
            if (!guestPeer?.open) return resolve({ ok: false, error: 'online.disconnected' });
            const id = nextCmd++;
            pendingResults.set(id, resolve);
            guestPeer.send({ t: 'cmd', id, cmd });
          }),
        step: () => {
          const me = get().myTag;
          if (!me) return;
          guestPeer?.send({ t: 'ready', on: !get().ready.includes(me) });
        },
        close: () => get().leave(),
      });
    } else if (m.t === 'result') {
      const r = pendingResults.get(m.id);
      pendingResults.delete(m.id);
      r?.(m.result as CommandResult);
    } else if (m.t === 'readyList') {
      set({ ready: m.tags, humans: m.humans, turnLimit: m.limit, deadline: m.limit > 0 && m.left > 0 ? Date.now() + m.left * 1000 : null });
    } else if (m.t === 'chat') {
      const st = get();
      set({ chat: [...st.chat.slice(-199), { from: m.from, to: m.to, text: m.text, at: m.at }], unread: st.unread + 1 });
    }
  };
  peer.onState = (json) => {
    const tag = get().myTag;
    if (!tag) return;
    void receiveGuestState(viewFor(JSON.parse(json) as GameState, tag));
  };
  peer.onClose = () => {
    if (guestPeer !== peer || get().role !== 'guest') return;
    for (const r of pendingResults.values()) r({ ok: false, error: 'online.disconnected' });
    pendingResults.clear();
    // Oda linkiyle katıldıysa kendiliğinden yeniden bağlanmayı dener
    const ses = guestSession;
    if (!ses) {
      set({ error: 'online.disconnected' });
      return;
    }
    set({ reconnecting: true });
    if (retry) clearInterval(retry);
    const attempt = () => publish(hostTopic(ses.room), { t: 'join', guest: ses.guest, tag: ses.tag, name: ses.name }).catch(() => {});
    void attempt();
    retry = setInterval(attempt, 6000);
  };
}
