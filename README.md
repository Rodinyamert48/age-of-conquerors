# Age of Conquerors

Tarayıcıda çalışan, tamamen istemci taraflı bir büyük strateji oyunu. Age of History 2'nin sade ülke yönetimi ile Age of History 3'ün daha derin ekonomi, diplomasi ve savaş sistemlerini birleştirmeyi hedefler. Sunucu, hesap ya da ücretli API gerektirmez; oyun durumu tarayıcıdaki IndexedDB'de saklanır.

## Hızlı başlangıç

```bash
npm install        # bağımlılıklar + bayrak dosyalarının public/flags'e kopyalanması
npm run dev        # http://localhost:3000
```

Üretim derlemesi:

```bash
npm run build
npm start
```

Denetimler:

```bash
npm run typecheck  # TypeScript (strict)
npm run lint       # ESLint
npm test           # Vitest birim/entegrasyon testleri
```

Gereksinim: Node.js 20.9+ (Next.js 16).

## Oyunun içeriği

- **Harita:** Natural Earth verisinden üretilmiş 2.863 bölge, 4.167 deniz düğümü, boğaz/kanal denetimi, nehirler, göller ve başkentler. Yakınlaştırılabilir Canvas haritası; siyasi, ekonomik, diplomatik, askerî kontrol, istikrar, ikmal ve arazi katmanları. İşgal edilmiş bölgeler çizgili gösterilir; ordular, rotalar, muharebeler ve kuşatmalar haritada görünür.
- **Senaryo:** *Modern Dünya — 1 Ocak 2020* tam ve oynanabilir: 199 ülke, NATO ve KGAÖ, AB tek pazarı, gümrük birlikleri ve serbest ticaret anlaşmaları, savunma paktları, çekirdek bölge ve toprak talepleri, yaklaşık ordu büyüklükleri, senaryoya özgü olaylar. 1444, 1815, 1914, 1936, 1939 ve 1945 senaryoları menüde "veri hazırlanıyor" olarak görünür; doğrulanmış veri olmadan uydurma içerikle açılmazlar (bkz. *Yeni senaryo eklemek*).
- **Zaman:** Günlük (varsayılan), haftalık ve aylık tur adımı; duraklat, tek tur ilerlet, oynat ve 5 hız kademesi. Her tur sabit sırayla işlenir: hareket → muharebe/kuşatma → ekonomi → nüfus/ikmal → diplomatik süreler → inşaat/asker toplama/araştırma → yapay zekâ → olaylar/istikrar/isyanlar → zafer kontrolü → tarih. Simülasyon tohumlu RNG ile deterministiktir.
- **Ekonomi:** Hazine, vergi/ticaret/üretim/ihracat gelirleri ile ordu, donanma, tahkimat, politika, ithalat ve faiz giderlerinin ayrıntılı dökümü; borçlanma ve iflas. Sekiz bina türü (tarım, sanayi, ticaret merkezi, liman, yollar, üniversite, askerî tesis, tahkimat): maliyet, süre, seviye, teknoloji ve arazi kısıtlarıyla. Yiyecek, demir, kömür, kereste stokları; açıkların otomatik ithalatı, fazlaların ihracatı.
- **Ordu ve donanma:** Dönemine göre açılan birlik türleri (piyade, hafif birlik, süvari, topçu, kuşatma, zırhlı, hava, donanma); para + insan gücü + süre ile asker toplama; moral, tecrübe, ikmal ve bakım. Dijkstra rota bulma (kara, boğaz geçişi, liman–deniz, deniz–deniz); deniz aşırı nakliye donanma kapasitesiyle sınırlıdır. Ordu birleştirme, bölme, terhis, rota önizleme.
- **Muharebe:** Sayı, birlik türü, cephe genişliği, arazi, tahkimat, moral, tecrübe, ikmal, teknoloji ve komutan/politika değiştiricileriyle günlük turlarda işleyen muharebe; ayrıntılı muharebe raporu ve kazanma olasılığı tahmini. Kuşatmada bekleme ya da (kayıp vererek) hücum seçeneği.
- **Diplomasi:** İlişki geliştirme/kötüleştirme, saldırmazlık paktı, askerî ittifak, savunma anlaşması, ticaret anlaşması, geçiş izni, normalleşme, bağlı devlet, tanıma, toprak talebi, bölge devri/isteği, müttefiki savaşa çağırma, savaş ilanı ve barış görüşmesi (bölge, tazminat, ulus serbest bırakma, bağlı devlet, ilhak; karşı teklif). Kararlar ilişkiler, güç dengesi, tehdit, savaş skoru ve itibar üzerinden verilir; kabul/ret gerekçeleri gösterilir.
- **İç yönetim:** Vergi, askerî bütçe, altyapı, eğitim, iç güvenlik, kamu harcamaları ve kalkınma politikaları; istikrar, bölgesel huzursuzluk, isyanlar ve bağımsızlık hareketleri.
- **Araştırma:** 9 dal, 96 teknoloji (ekonomi, tarım ve üretim, altyapı, kara ordusu, denizcilik, topçu ve hava, lojistik, yönetim, diplomasi); teknolojiler bina seviyelerini, birlik türlerini ve değiştiricileri açar.
- **Yapay zekâ:** Her ülke ekonomi, asker toplama, ordu hareketi, diplomasi ve barış kararları verir. Zorluk seviyesi yalnızca bonus değil karar kalitesini de değiştirir (arama derinliği, hata payı, arazi farkındalığı, hücum kararları, düşünme sıklığı).
- **Olaylar:** Veri odaklı olay sistemi (koşul + seçenek + etki); genel olaylar ve senaryoya özgü olaylar.
- **Zafer:** Serbest oyun, hâkimiyet, bölge sayısı, ekonomik üstünlük ve ittifak hedefleri. Oyuncu ülkesi yok olursa yenilgi; başka bir ülkeyle devam edilebilir. Başkent kaybında başkent taşınır.
- **Kayıt:** Otomatik (3 döngüsel yuva), hızlı, adlandırılmış ve oturum kayıtları; dosyaya aktarma/dosyadan yükleme; sürümlü kayıt biçimi ve taşıma (migration); bozuk/uyumsuz kayıt uyarıları. Sayfa yenilendiğinde oyun kaldığı yerden devam eder.
- **Ayarlar ve dil:** Türkçe (varsayılan) ve İngilizce; ses/müzik, animasyon, harita kalitesi, varsayılan zorluk/hız/zaman adımı, otomatik kayıt sıklığı, bildirim tercihleri, varsayılan harita katmanı, değiştirilebilir klavye kısayolları.

### Kontroller

| Eylem | Varsayılan |
| --- | --- |
| Oynat / duraklat | Boşluk |
| Bir tur ilerlet | N |
| Hız azalt / artır | `-` / `=` |
| Hız kademesi seç | 1 – 5 |
| Ülke / Ordular / Diplomasi / Ekonomi / Araştırma / Politikalar / Savaşlar | C / A / D / E / R / P / W |
| Harita katmanını değiştir | M |
| Başkente git | H |
| Hızlı kayıt | F5 |
| Seçimi kaldır | Esc |
| Ordu seç | Sol tık (Shift ile çoklu seçim) |
| Hareket emri | Sağ tık ya da "Hareket ettir" + sol tık |

Kısayollar *Oyun Ayarları* ekranından değiştirilebilir.

## Mimari

```
src/
  app/               Next.js App Router sayfaları (menü, yeni oyun, oyun, kayıtlar, ayarlar…)
  components/
    map/             Canvas harita çizicisi, geometri, harita katmanları
    game/            Oyun ekranı: üst çubuk, sol sekmeler, sağ bağlam paneli, diyaloglar
  game/              React'ten bağımsız oyun motoru (saf TypeScript)
    engine.ts        Oyun kurulumu ve tur sırası
    commands.ts      Doğrulanan oyuncu komutları
    economy.ts movement.ts combat.ts siege.ts war.ts diplomacy.ts
    construction.ts stability.ts population.ts events.ts victory.ts save.ts
    ai/              Yapay zekâ (ekonomi, askerî, diplomasi)
    defs/            Bina, birlik, teknoloji, politika ve arazi tanımları
    data/            Olay verileri
    scenarios/       Senaryo kayıtları ve modern senaryo verisi
  worker/            Simülasyonu çalıştıran Web Worker ve mesaj protokolü
  store/             Zustand depoları (oyun köprüsü, arayüz, ayarlar)
  lib/               IndexedDB kayıtları, biçimlendirme, ses
  i18n/              Merkezî çeviri sistemi (tr, en)
scripts/
  build-map.mjs      Natural Earth → oyun haritası veri hattı
  copy-flags.mjs     flag-icons bayraklarını public/flags'e kopyalar
tests/               Vitest testleri
```

- **Simülasyon iş parçacığı:** Oyun durumu Web Worker'da tutulur ve ilerletilir; arayüz yalnızca komut gönderir ve her turdan sonra durum anlık görüntüsünü alır. Rota önizleme ve muharebe tahmini gibi salt okunur sorgular ana iş parçacığında son anlık görüntü üzerinde hesaplanır. Böylece arayüz, yoğun simülasyon sırasında da akıcı kalır.
- **Deterministik durum:** `GameState` JSON'a çevrilebilir tek bir nesnedir; RNG durumu (mulberry32) kayıtla birlikte saklanır. Aynı tohum ve aynı komutlar aynı sonucu üretir.
- **Performans:** Bölge yolları `Path2D` olarak önbelleğe alınır, dolgular renk gruplarıyla çizilir, ordu işaretleri ekran uzayında sınırlı sayıda çizilir, isabet testi ızgara üzerinden yapılır. Rota bulma tipli dizilerle Dijkstra kullanır; yapay zekâ her gün değil zorluğa göre aralıklarla düşünür. Modern senaryoda bir gün ortalama ~20 ms sürer.

## Harita verisi ve yeniden üretme

`public/data/world.json` (bölgeler, komşuluklar, deniz grafiği, nüfus/GSYH tahmini) ve `public/data/world-geo.json` (çizim geometrisi) depoda hazır gelir. Yeniden üretmek için:

```bash
npm run build:map                       # Natural Earth dosyalarını .cache/naturalearth altına indirir
npm run build:map -- --data-dir <klasör> # önceden indirilmiş GeoJSON dosyalarını kullanır
```

Hat, Natural Earth 1:10m yönetim birimi (admin-1) sınırlarını Miller projeksiyonuna dönüştürür, topoloji korunarak sadeleştirir, nüfus yoğunluğuna göre birleştirir/böler, T-kavşakları onarır, kıyı/deniz komşuluklarını ve boğaz geçişlerini üretir.

## Yeni senaryo eklemek

Senaryolar `src/game/scenarios/` altında `ScenarioInfo` biçimindedir: başlangıç tarihi, bölge sahipliği (ülke kodu → sahip), hükûmet türleri, ordular, ittifaklar, antlaşmalar, ilişkiler, çekirdek/talep bölgeleri, senaryo olayları ve zafer koşulları. Modern senaryo (`modern.ts`) örnek uygulamadır. Bir senaryonun `available: false` alanı, verisi kaynaklarıyla doğrulanana kadar menüde başlatılamaz olarak kalmasını sağlar.

## Veri kaynakları ve lisanslar

| Kaynak | Kullanım | Lisans |
| --- | --- | --- |
| [Natural Earth](https://www.naturalearthdata.com/) v5.1.2 | Sınırlar, yerleşimler, nehirler, göller, nüfus ve GSYH tahminleri | Kamu malı |
| [flag-icons](https://github.com/lipis/flag-icons) | Ülke bayrakları | MIT |
| [Lucide](https://lucide.dev/) | Arayüz ikonları | ISC |
| Oyun içi Web Audio | Ses efektleri ve müzik (dosya kullanılmaz) | — |

Bazı tanınmamış/özel varlıkların bayrakları (`public/flags-custom/`) oyun için basit biçimde çizilmiştir.

**Yaklaşık değerler:** Başlangıç orduları başlıca ülkeler için 2020 düzeyindeki kamuya açık değerlerin yuvarlanmış yaklaşıklarıdır; diğer ülkelerde nüfus ve ekonomiye göre tahmin edilir. Bölge nüfusu ve üretimi, Natural Earth ülke toplamlarının yerleşim yerlerine göre dağıtılmasıyla tahmin edilir. Bunlar oyun dengesi için kullanılan yaklaşık verilerdir; kesin istatistik iddiası taşımaz.

## Testler

`tests/` klasöründeki testler şunları doğrular: ekonomi güncellemesi ve bütçe tutarlılığı, inşaat/asker toplama maliyet ve süreleri, arazi kısıtları, geçerli rotalar ve engellenen geçersiz hareketler, geçiş izni ve deniz nakliye kuralları, muharebe sonuçlarının uygulanması, kuşatma ve işgal, barış sonrası sahiplik değişimi, antlaşmaların kurallara etkisi (saldırmazlık paktı, savunma paktı, ateşkes, ittifak çağrısı), kayıt/yükleme ve sürüm taşıma, IndexedDB oturum kaydı (sayfa yenileme), determinizm, zaman adımları, yapay zekâ kararları, zafer/yenilgi algılama ve senaryo başlangıç verisi.

## Lisans

Apache License 2.0 — bkz. [LICENSE](LICENSE).
