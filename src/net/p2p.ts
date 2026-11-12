/**
 * Sunucusuz çevrimiçi bağlantı (WebRTC veri kanalı). Sinyalleşme elle yapılır:
 * oda sahibi bir "davet kodu" üretir, katılan oyuncu "cevap kodu" üretir ve sahibine iletir.
 * Oyun durumunun tek sahibi oda sahibidir (sunucu görevi görür).
 */

const ICE: RTCConfiguration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
const CHUNK = 48 * 1024;

export type NetMessage =
  | { t: 'hello'; name: string }
  | { t: 'welcome'; tag: string }
  | { t: 'cmd'; id: number; cmd: unknown }
  | { t: 'result'; id: number; result: unknown }
  | { t: 'ready'; on: boolean }
  | { t: 'readyList'; tags: string[]; humans: string[] }
  | { t: 'bye' };

export function encodeCode(desc: RTCSessionDescriptionInit): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(desc))));
}

export function decodeCode(code: string): RTCSessionDescriptionInit {
  const obj = JSON.parse(decodeURIComponent(escape(atob(code.trim().replace(/\s+/g, ''))))) as RTCSessionDescriptionInit;
  if (!obj || typeof obj.sdp !== 'string' || (obj.type !== 'offer' && obj.type !== 'answer')) throw new Error('Geçersiz kod');
  return obj;
}

function waitIce(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === 'complete') done();
    };
    pc.addEventListener('icegatheringstatechange', check);
    setTimeout(done, 6000);
  });
}

async function gzip(text: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  if (typeof CompressionStream === 'undefined') return prefix(0, bytes);
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  return prefix(1, new Uint8Array(await new Response(stream).arrayBuffer()));
}

async function gunzip(data: Uint8Array): Promise<string> {
  const body = data.subarray(1);
  if (data[0] === 0 || typeof DecompressionStream === 'undefined') return new TextDecoder().decode(body);
  const stream = new Blob([body as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

function prefix(flag: number, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(body.length + 1);
  out[0] = flag;
  out.set(body, 1);
  return out;
}

/** Tek bir eş ile bağlantı: JSON iletileri ve büyük durum aktarımı (parçalı, sıkıştırılmış) */
export class Peer {
  pc: RTCPeerConnection;
  channel: RTCDataChannel | null = null;
  open = false;
  onMessage: (m: NetMessage) => void = () => {};
  onState: (json: string) => void = () => {};
  onOpen: () => void = () => {};
  onClose: () => void = () => {};
  private chunks: Uint8Array[] = [];
  private expect = 0;

  constructor() {
    this.pc = new RTCPeerConnection(ICE);
    this.pc.addEventListener('connectionstatechange', () => {
      const st = this.pc.connectionState;
      if (st === 'failed' || st === 'closed' || st === 'disconnected') this.handleClose();
    });
  }

  private setup(ch: RTCDataChannel) {
    this.channel = ch;
    ch.binaryType = 'arraybuffer';
    ch.onopen = () => {
      this.open = true;
      this.onOpen();
    };
    ch.onclose = () => this.handleClose();
    ch.onmessage = (e) => {
      if (typeof e.data === 'string') {
        const m = JSON.parse(e.data) as NetMessage | { t: 'stateHead'; n: number };
        if (m.t === 'stateHead') {
          this.chunks = [];
          this.expect = m.n;
        } else this.onMessage(m as NetMessage);
        return;
      }
      this.chunks.push(new Uint8Array(e.data as ArrayBuffer));
      if (this.expect > 0 && this.chunks.length >= this.expect) {
        const parts = this.chunks;
        this.chunks = [];
        this.expect = 0;
        const total = parts.reduce((a, p) => a + p.length, 0);
        const all = new Uint8Array(total);
        let o = 0;
        for (const p of parts) {
          all.set(p, o);
          o += p.length;
        }
        gunzip(all).then((j) => this.onState(j)).catch(() => {});
      }
    };
  }

  private closed = false;
  private handleClose() {
    if (this.closed) return;
    this.closed = true;
    this.open = false;
    this.onClose();
  }

  /** Oda sahibi: davet kodu üret */
  async createOffer(): Promise<string> {
    this.setup(this.pc.createDataChannel('game', { ordered: true }));
    await this.pc.setLocalDescription(await this.pc.createOffer());
    await waitIce(this.pc);
    return encodeCode(this.pc.localDescription!);
  }

  /** Oda sahibi: katılanın cevap kodunu işle */
  async acceptAnswer(code: string): Promise<void> {
    await this.pc.setRemoteDescription(decodeCode(code));
  }

  /** Katılan: davet kodundan cevap kodu üret */
  async acceptOffer(code: string): Promise<string> {
    this.pc.ondatachannel = (e) => this.setup(e.channel);
    await this.pc.setRemoteDescription(decodeCode(code));
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    await waitIce(this.pc);
    return encodeCode(this.pc.localDescription!);
  }

  send(m: NetMessage) {
    if (this.open && this.channel?.readyState === 'open') this.channel.send(JSON.stringify(m));
  }

  async sendState(json: string) {
    if (!this.open || this.channel?.readyState !== 'open') return;
    const data = await gzip(json);
    const n = Math.ceil(data.length / CHUNK);
    this.channel.send(JSON.stringify({ t: 'stateHead', n }));
    for (let i = 0; i < n; i++) {
      // Gönderim tamponu dolarsa bekle
      while (this.channel.bufferedAmount > 4 * 1024 * 1024) await new Promise((r) => setTimeout(r, 30));
      this.channel.send(data.subarray(i * CHUNK, (i + 1) * CHUNK) as unknown as ArrayBuffer);
    }
  }

  close() {
    this.closed = true;
    this.open = false;
    try {
      this.channel?.close();
      this.pc.close();
    } catch {
      /* zaten kapalı */
    }
  }
}
