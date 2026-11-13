/**
 * İsteğe bağlı sinyalleşme: "oda linki" ile tek tıkla katılma. Ücretsiz, hesapsız bir yayınla-abone ol
 * servisi (ntfy) yalnızca bağlantı kodlarını (WebRTC teklif/cevap) iletmek için kullanılır; oyun verisi
 * her zaman oyuncular arasında doğrudan akar. Servise ulaşılamazsa elle kod alışverişi çalışmaya devam eder.
 */
export const SIGNAL_URL = (process.env.NEXT_PUBLIC_SIGNAL_URL ?? 'https://ntfy.sh').replace(/\/$/, '');

export type SignalMessage =
  | { t: 'join'; guest: string; tag: string; name: string }
  | { t: 'offer'; sdp: string }
  | { t: 'answer'; guest: string; sdp: string }
  | { t: 'deny'; reason: string };

export function randomId(n = 10): string {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => abc[b % abc.length]).join('');
}

export const hostTopic = (room: string) => `aoc26-${room}-host`;
export const guestTopic = (room: string, guest: string) => `aoc26-${room}-${guest}`;

export async function publish(topic: string, msg: SignalMessage): Promise<void> {
  const res = await fetch(`${SIGNAL_URL}/${topic}`, { method: 'POST', body: JSON.stringify(msg) });
  if (!res.ok) throw new Error(`Sinyalleşme hatası (${res.status})`);
}

/** Konuya abone ol; dönen işlev aboneliği kapatır */
export function subscribe(topic: string, onMessage: (m: SignalMessage) => void, onError?: () => void): () => void {
  const es = new EventSource(`${SIGNAL_URL}/${topic}/sse`);
  es.onmessage = (e) => {
    try {
      const env = JSON.parse(e.data) as { event?: string; message?: string };
      if (env.event && env.event !== 'message') return;
      if (!env.message) return;
      onMessage(JSON.parse(env.message) as SignalMessage);
    } catch {
      /* geçersiz ileti: yok say */
    }
  };
  es.onerror = () => onError?.();
  return () => es.close();
}
