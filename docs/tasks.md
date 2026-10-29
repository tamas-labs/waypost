# Waypost – feladatlista (1. lépcső)

Forrás: [Waypost – fejlesztői specifikáció (1. lépcső).md](./Waypost%20–%20fejlesztői%20specifikáció%20(1.%20lépcső).md) és a design átadás (`docs/orjarat-design-handoff/`).

Hogyan használd:

- A feladatok a mérföldkövek sorrendjében haladnak (M0 → M7). Egy feladat egy fejlesztési menetben (egy Claude Code munkamenetben) elkészíthető.
- Minden feladatnál: **mit** kell csinálni, **kész, ha** (elfogadási feltétel), **függ** (előfeltétel, ha nem az előző feladat), **spec** (a specifikáció szakasza).
- Egy mérföldkő akkor kész, ha minden feladata kész, és a záró „Elfogadás” feladat teljesül.
- Ami a specifikációban nincs eldöntve, az a `docs/decisions.md` fájlba kerül. A már most látható nyitott kérdések a dokumentum végén, a **Nyitott kérdések** szakaszban vannak; a velük érintett feladatoknál `⚠ Q#` jelzi őket.
- Repók: `schema` = `waypost-schema`, `backend` = `laravel-waypost`, `app` = `waypost`.

---

## M0 – `waypost-schema`: a közös szerződés

Cél: entitás-, API- és láncsémák a login, enroll, pull és push végpontokhoz; lánc- és menetrend-tesztvektorok; TS típusok.

- [x] **M0-01 Repo váz**
  - Mit: `package.json` (`@waypost/schema`), `composer.json` (`waypost/schema`), `CLAUDE.md` (hivatkozás a fejlesztői specifikációra), `CHANGELOG.md` (semver), `.gitignore`, a könyvtárszerkezet (`schemas/entities|api|chain`, `chain/`, `schedule/`, `examples/`, `scripts/`).
  - Kész, ha: `npm install` és `composer validate` hibátlan.
  - Spec: Repo és technológiai stack.

- [x] **M0-02 Sémaellenőrző szkript**
  - Mit: `scripts/validate` (Ajv, draft 2020-12): minden séma lefordul, minden `examples/**/valid/*` példa validál, minden `examples/**/invalid/*` elbukik. `npm test` ezt futtatja.
  - Kész, ha: egy szándékosan hibás példán a szkript elbukik, a jókon átmegy.

- [x] **M0-03 Közös definíciók (`schemas/common.json` vagy `$defs`)**
  - Mit: UUIDv7, ISO 8601 UTC időbélyeg ezredmásodperccel, 64 hex karakteres lenyomat, base64, `server_time`, egész számú `lat_e7` / `lng_e7` / `accuracy_dm`, `api/error.json` (a hibakódok felsorolásával: `unauthenticated`, `device_revoked`, `forbidden`, `not_found`, `validation_failed`, `conflict`, `chain_gap`, `chain_fork`, `bad_hmac`, `rate_limited`).
  - Kész, ha: mindegyikhez van érvényes és érvénytelen példa.
  - Spec: API-szerződés / Hibaformátum.

- [x] **M0-04 Konfigurációs entitássémák**
  - Mit: `site`, `user` (a pull változat PIN-mezőkkel, e-mail és jelszó nélkül), `device`, `checkpoint`, `route`, `route-version`, `route-version-checkpoint`, `schedule`, `report-subscription`. Az enumok, a `weekdays` bitmaszk (1–127), a `start_times` formátuma (`HH:MM`), a `tag_uid` formátuma (nagybetűs hex, kettőspont nélkül), a QR payload formátuma (`waypost:cp:<uuid>:<16 karakter>`).
  - Kész, ha: mindegyikhez van érvényes és érvénytelen példa, és a validálás zöld.
  - Spec: Adatbázis.

- [x] **M0-05 Láncsémák**
  - Mit: `chain/entry.json` (minden mező kötelező, a `null` értékű is), `payload-shift_started|shift_closed|round_opened|scan|incident|round_closed.json`. Lebegőpontos szám sehol, a `media: [{id, sha256}]` mező a `scan` és az `incident` payloadban. A `type` legyen bővíthető (2. lépcső: `sos`).
  - Kész, ha: minden típushoz van érvényes példa, és érvénytelen is (pl. float koordináta, hiányzó `null` mező).
  - Spec: Láncolt napló / Bejegyzéstípusok és payload.

- [x] **M0-06 API-sémák: login, enroll, pull, push**
  - Mit: `auth-login.request/response`, `auth-logout.response`, `devices-enroll.request/response`, `sync-pull.response` (`cursor`, `has_more`, `changes`, `deleted`), `sync-push.request/response` (`accepted`, `last_seq`, `rejected[]`, `media_missing[]`). Minden válaszban kötelező a `server_time`.
  - Kész, ha: a specifikáció JSON-példái érvényes példaként validálnak.
  - Spec: API-szerződés.

- [x] **M0-07 Lánc-tesztvektorok**
  - Mit: egy referencia-generátor (JS, RFC 8785 JCS + HMAC-SHA256) és a kimenete, a `chain/test-vectors.json`: rögzített kulcs; bemenet → `canonical_json` → `hash`. Esetek: minden bejegyzéstípus, `null` mezők, ékezetes és nem-BMP Unicode szöveg, nagy egész számok, kulcsrendezés beágyazott objektumban, egy 3 elemű lánc `prev_hash`-sel (az első 64 db `0`).
  - Kész, ha: a generátor újrafuttatása bájtra azonos fájlt ad, és ezt a teszt ellenőrzi.
  - Spec: Láncolt napló / Bejegyzés és lenyomat.

- [x] **M0-08 Menetrend-tesztvektorok** `⚠ Q5`
  - Mit: `schedule/test-vectors.json`: menetrend + időszak → várt időpontok (UTC és helyi idő). Esetek: `list` mód; `interval` mód, mindkét vég beleértve (20:00–08:00, 60 perc = 13 kör); éjfélen átnyúló ablak; a `weekdays` szűrés a kezdő napra vonatkozik (a pénteki ablakban szombat reggeli körök is vannak); DST-váltás (2026-03-29 és 2026-10-25, Europe/Budapest), nem létező és kétszer előforduló helyi idő; időkeret-alapérték (`ceil(walk_duration_s × 1,5 / 300) × 5`, ennek hiányában 20).
  - Kész, ha: a vektorok kézzel is ellenőrizve vannak, a DST-döntés a `decisions.md`-ben szerepel.
  - Spec: Állapotgépek / Menetrend → körök; Jelentések.

- [x] **M0-09 TS típusgenerálás**
  - Mit: `scripts/` json-schema-to-typescript-tel, a kimenet a csomag exportja (`types`), build szkript.
  - Kész, ha: egy minta TS fájl a generált típusokkal `tsc --strict` alatt lefordul.

- [x] **M0-10 Csomagolás és telepíthetőség**
  - Mit: npm-ből (`file:../waypost-schema`) és Composerből (`path` repository) is telepíthető. A PHP-oldalon egy kis segéd a sémafájlok útvonalához; a JS-oldalon a sémák és a tesztvektorok exportja. Verzió `0.1.0`, CHANGELOG bejegyzés.
  - Kész, ha: egy üres npm- és egy üres Composer-projektbe telepítve a sémák és a típusok elérhetők.

- [x] **M0-11 Elfogadás**: minden példa validál (az érvénytelenek elbuknak), a TS típusok lefordulnak, mindkét csomagkezelővel telepíthető.

---

## M1 – `waypost`: prototípus (kockázatcsökkentés)

Cél: egy Androidon és egy iPhone-on bizonyítani, hogy az NFC, a QR, az ébresztés és a monoton óra úgy működik, ahogy a specifikáció leírja. Ha nem, a munka megáll, és a specifikációt kell módosítani.

- [x] **M1-01 Expo projekt váz**
  - Mit: a legfrissebb stabil Expo SDK, TypeScript strict, expo-router, ESLint, Jest; a `src/` mappaszerkezet (`db`, `domain`, `sync`, `chain`, `nfc`, `qr`, `alarms`, `location`, `theme`); `CLAUDE.md`, `docs/decisions.md` (üres sablon: dátum, kérdés, döntés, indok); bundle ID / package name; `eas.json` development build profillal. `⚠ Q12`
  - Kész, ha: `npx tsc --noEmit`, `npm run lint` és `npm test` zöld; a dev build elkészül.
  - Spec: Repo és technológiai stack.

- [x] **M1-02 Téma- és szövegfájlok átvétele**
  - Mit: a `docs/orjarat-design-handoff/src/theme/tokens.ts` → `src/theme/tokens.ts`, a `src/i18n/hu.json` → `src/i18n/hu.json`. Egy egyszerű `t()` segéd a feliratokhoz.
  - Kész, ha: a prototípus képernyői már ezeket használják, beégetett szín és felirat nélkül.
  - Spec: Alapszabályok 4–5.; DESIGN_HANDOFF 3.

- [x] **M1-03 `waypost-clock` natív modul**
  - Mit: saját Expo-modul (`modules/waypost-clock`): `getUptimeMs()` és `getBootId()`. Androidon `SystemClock.elapsedRealtime()` + `Settings.Global.BOOT_COUNT`, iOS-en `clock_gettime(CLOCK_MONOTONIC)` + `kern.boottime` alapján képzett azonosító. Egy tesztképernyő mutatja az értékeket.
  - Kész, ha: mindkét telefonon az uptime alvás alatt is nő, újraindítás után a boot ID megváltozik.
  - Spec: Láncolt napló / Bejegyzés és lenyomat.

- [x] **M1-04 NFC prototípus**
  - Mit: react-native-nfc-manager config pluginnel, iOS NFC Tag Reading entitlement. Androidon előtérbeli figyelés (`registerTagEvent`) gomb nélkül; iOS-en gombra induló munkamenet „Tartsd a telefont a címkéhez” szöveggel. A UID normalizálása (nagybetűs hex, kettőspont nélkül) és a nyers NDEF kiolvasása. Írás nincs.
  - Kész, ha: mindkét telefonon kiolvasható egy NTAG21x és egy NTAG 424 DNA címke UID-ja és NDEF tartalma.
  - Spec: Mobilapp / NFC és QR.

- [x] **M1-05 QR prototípus**
  - Mit: teljes képernyős kameranézet (expo-camera barcode scanning), amely csak a `waypost:cp:` előtagú kódokat fogadja el, a többit figyelmen kívül hagyja.
  - Kész, ha: mindkét telefonon egy kinyomtatott és egy képernyőn megjelenített kód is beolvasható.

- [x] **M1-06 Ébresztés prototípus**
  - Mit: expo-notifications. Android: `rounds` csatorna (MAX fontosság, saját hang, rezgés), pontos riasztás engedély kérése, kivétel az akkumulátor-optimalizálás alól. iOS: `timeSensitive` szint és jogosultság, saját hang. Egy gomb, amely 3 órára előre beütemez 15 percenként egy értesítést.
  - Kész, ha: a beállítás mindkét platformon működik, az engedélyek állapota egy képernyőn látszik.
  - Spec: Mobilapp / Ébresztés.

- [x] **M1-07 Kézi eszközteszt-lista**
  - Mit: a `docs/device-test.md` létrehozása a specifikáció ellenőrzőlistájából, és kiegészítése az M1 próbáival (dátum, telefon, OS-verzió, eredmény oszlopokkal).
  - Spec: Tesztelés / Kézi eszközteszt.

- [x] **M1-08 Elfogadás (Android + iPhone)**: a címke- és a QR-olvasás működik; 3 órán át 15 percenként pontosan szól az értesítés zárolt képernyőn, háttérben és bezárt appal is; az uptime alvás alatt is nő. Az eredmények a `device-test.md`-ben. Ha valami nem működik: STOP, a specifikációt kell módosítani.

---

## M2 – `laravel-waypost`: alap backend

Cél: migrációk, modellek, telepítő parancsok, login, konfigurációs CRUD Policy-kkel, enroll, pull.

### Váz és infrastruktúra

- [x] **M2-01 Csomag váz**
  - Mit: `composer.json` (`waypost/laravel-waypost`; Laravel 13, Sanctum, `waypost/schema` path repositoryból, opis/json-schema, dompdf), `WaypostServiceProvider`, `config/waypost.php` (route prefix, middleware, tábla-előtag, storage disk, queue, mail feladó), Orchestra Testbench + workbench, Pest, Larastan 8-as szint, `CLAUDE.md`, `docs/decisions.md`.
  - Kész, ha: `vendor/bin/pest` (egy üres teszttel) és `vendor/bin/phpstan` zöld; a workbench elindul.
  - Spec: Repo és technológiai stack.

- [x] **M2-02 Alapkonvenciók**
  - Mit: táblanév-előtag (`waypost_`, konfigurálható) a modellekben és a migrációkban; UUIDv7 elsődleges kulcs trait; UTC és `datetime(3)` kezelés; az ISO 8601 ezredmásodperces kimenet egységes formázója.
  - Kész, ha: unit teszt az előtagra, az UUIDv7-re és az időformátumra.

### Adatbázis és modellek

- [x] **M2-03 Migrációk: konfiguráció** `⚠ Q3`
  - Mit: `users`, `sites`, `site_user`, `devices`, `checkpoints`, `routes`, `route_versions`, `route_version_checkpoints`, `schedules`, `report_subscriptions`, az összes egyedi kulccsal és indexszel. A pull törlési listájához szükséges törlésjelölés minden szinkronizált táblán.
  - Kész, ha: a migráció MySQL 8-on és PostgreSQL 16-on (vagy legalább SQLite-on a tesztekben és egy valódi motoron kézzel) fut, és vissza is görgethető.
  - Spec: Adatbázis.

- [x] **M2-04 Migrációk: eszközadat, kimenő és idempotencia** `⚠ Q4` `⚠ Q14`
  - Mit: `chain_entries`, `shifts`, `rounds`, `scans`, `incidents`, `media`, `reports`, valamint egy idempotenciatábla (kulcs, token/eszköz, kérés-lenyomat, tárolt válasz, lejárat).
  - Kész, ha: mint fent.

- [x] **M2-05 Modellek, kapcsolatok, factory-k**
  - Mit: minden táblához modell (`Waypost\Models\...`), kapcsolatok, castok (a `devices.secret` titkosítva), factory-k a tesztekhez. A `User` és a `Device` Sanctum-tokenelhető.
  - Kész, ha: factory-kkel minden modell létrehozható; PHPStan zöld.

- [x] **M2-06 Workbench demó-seeder**
  - Mit: egy seeder, amely létrehoz egy telephelyet supervisorral, két őrrel (ismert PIN-nel), 6 ponttal (NFC és QR), egy kötött és egy szabad sorrendű útvonallal, és egy 5 perces menetrenddel. Az app M3-as tesztjéhez is ez kell.
  - Kész, ha: `php artisan db:seed` után a pull a teljes demóállapotot adja.

### Parancsok és PIN

- [x] **M2-07 `waypost:install` parancs**
  - Mit: a konfiguráció és a migrációk publikálása, opcionálisan a migráció futtatása.
  - Kész, ha: egy friss Laravel 13 alkalmazásban (`composer require` + `waypost:install`) a táblák létrejönnek; feature teszt.

- [x] **M2-08 `waypost:create-supervisor` parancs**
  - Mit: név, e-mail és jelszó bekérése (interaktívan vagy opciókkal), validálás, létrehozás.
  - Kész, ha: feature teszt; ugyanazzal az e-mail-címmel másodszor hibát ad.

- [x] **M2-09 PIN-szolgáltatás** `⚠ Q11`
  - Mit: PBKDF2-HMAC-SHA256, 16 bájtos véletlen só, 100 000 iteráció; 6 jegyű PIN generálása; ellenőrzés, hogy a PIN egyedi-e egy telephelyen belül (minden ott lévő felhasználó sójával újraszámolva); egy rögzített PIN-tesztvektor, amelyet az app is használ.
  - Kész, ha: unit tesztek, köztük az ütközés esete.
  - Spec: Azonosítás / PIN-kód.

### API-alapok

- [x] **M2-10 API-keret**
  - Mit: útvonalcsoport a konfigurált előtaggal (`api/waypost/v1`); egységes hibaformátum (exception handler, magyar üzenetek, a specifikáció kódjai); `server_time` minden válaszban (middleware); rate limiting (`rate_limited`, 429).
  - Kész, ha: feature tesztek minden hibakódra.
  - Spec: API-szerződés / Hibaformátum.

- [x] **M2-11 Sémaellenőrzés**
  - Mit: a bemenő JSON ellenőrzése a `waypost/schema` sémáival (opis/json-schema) middleware-ben vagy a FormRequest előtt; a FormRequest csak az adatbázisfüggő szabályokat nézi. Pest-segéd: `expect($response)->toMatchSchema('api/...')`.
  - Kész, ha: hibás törzsre `validation_failed` jön mezőnkénti részletekkel.

- [x] **M2-12 Idempotency-Key middleware**
  - Mit: minden író kérésnél kötelező UUID fejléc; ugyanarra a kulcsra 24 órán át ugyanaz a válasz; más törzzsel érkező azonos kulcs esetén hiba; a lejárt kulcsok takarítása (ütemezett job).
  - Kész, ha: feature tesztek (ismétlés, eltérő törzs, lejárat).

- [x] **M2-13 Azonosítás: Sanctum, képességek, X-Acting-User** `⚠ Q8`
  - Mit: két tokenfajta (`supervisor` a `User`-en, `device` a `Device`-on); middleware a képességekre; a visszavont eszközre `device_revoked` (401); az `X-Acting-User` fejléc kezelése: eszköztoken + egy olyan supervisor nevében, aki az eszköz telephelyéhez van rendelve, és csak azon a telephelyen.
  - Kész, ha: feature tesztek minden kombinációra (jó/rossz képesség, visszavont eszköz, idegen telephely supervisora).
  - Spec: Azonosítás.

- [x] **M2-14 `POST /auth/login`, `POST /auth/logout`**
  - Kész, ha: feature tesztek (helyes, hibás jelszó, inaktív felhasználó, őr nem léphet be jelszóval, a kijelentkezés törli a tokent); a válasz megfelel a sémának.

- [x] **M2-15 Policy-k**
  - Mit: a supervisor csak a `site_user` szerint hozzárendelt telephelyeit és azok alá tartozó entitásait látja és módosíthatja.
  - Kész, ha: unit vagy feature teszt minden Policy-ra, idegen telephelyre 403 / 404.

### Konfigurációs CRUD

- [x] **M2-16 `/sites` és `/sites/{id}/users`**
  - Mit: CRUD (soft delete), felhasználók hozzárendelése és leválasztása. Az új telephely létrehozója automatikusan hozzárendelődik.
  - Kész, ha: feature tesztek jogosultsággal.

- [x] **M2-17 `/users`**
  - Mit: őr és supervisor létrehozása, módosítása, inaktiválása; PIN megadása vagy generálása (a generált PIN egyszer jelenik meg a válaszban); PIN-csere; `conflict` (409) foglalt PIN-re.
  - Kész, ha: feature tesztek, köztük a 409.

- [x] **M2-18 `/checkpoints`**
  - Mit: CRUD; a `tag_uid` normalizálása; `UNIQUE(site_id, tag_uid)` és `UNIQUE(qr_payload)` ütközésre 409; a QR payload generálása (`waypost:cp:<id>:<16 karakteres véletlen kód>`), ha nincs megadva.
  - Kész, ha: feature tesztek, köztük a 409.

- [x] **M2-19 `/routes` és `/routes/{id}/versions`**
  - Mit: útvonal CRUD; új verzió létrehozása pontlistával és mért időkkel (a verzió utólag nem módosul); a `current_version_id` frissítése; a `version` sorszám automatikus.
  - Kész, ha: feature tesztek; egy meglévő verzió módosítási kísérlete hibát ad.

- [x] **M2-20 `/schedules`**
  - Mit: CRUD; a módhoz tartozó mezők validálása (`list`: `start_times`; `interval`: from, to, every); `time_limit_min` alapértéke a jelenlegi útvonalverzióból, ha a kérés nem ad meg semmit.
  - Kész, ha: feature tesztek mindkét módra és az alapértékre.

- [x] **M2-21 `/report-subscriptions`**
  - Kész, ha: CRUD feature tesztek, `UNIQUE(user_id, site_id, frequency)` ütközés.

### Eszköz és pull

- [x] **M2-22 `POST /devices/enroll`**
  - Mit: `devices` rekord, 32 bájtos véletlen titkos kulcs, `device` képességű token; a válasz (eszköz ID, token, base64 titok) csak egyszer adódik ki; ha a telephelynek már volt eszköze, az visszavonódik (`revoked_at`), és a tokenjei érvénytelenné válnak.
  - Kész, ha: feature tesztek (első hozzárendelés, csere, jogosultság).
  - Spec: Azonosítás / Telephelyi telefon hozzárendelése.

- [x] **M2-23 `GET /sync/pull`** `⚠ Q3` `⚠ Q9`
  - Mit: átlátszatlan kurzor (`updated_at` + `id`); üres kurzorral teljes állapot; oldalanként legfeljebb 500 rekord, `has_more`; a `changes` és a `deleted` listák; az eszköz a saját telephelyét, a supervisor a hozzárendelt telephelyeit kapja; a felhasználóknál a PIN-mezők; az eszköz `last_seen_at` értékének frissítése.
  - Kész, ha: feature tesztek: teljes pull, lapozás 500 felett, inkrementális pull módosítás és törlés után, azonos `updated_at` értékű rekordok a lapozás határán; a válasz megfelel a sémának.
  - Spec: API-szerződés / Pull.

- [x] **M2-24 Elfogadás**: Pest feature teszt minden végpontra jogosultsággal együtt; a válaszok megfelelnek a sémáknak; PHPStan 8 hibamentes.

---

## M3 – `waypost`: offline őr mód

Cél: SQLite, pull, PIN-belépés, műszak, menetrend, kör-állapotgép, leolvasás, esemény, lánc, ébresztés. Egy 5 perces körökkel beállított, 1 órás műszak teljesen offline végigvihető.

### Alapok

- [x] **M3-01 Helyi adatbázis (expo-sqlite + Drizzle)**
  - Mit: a szerver tábláinak tükre a specifikáció eltéréseivel (a `users` táblában nincs e-mail és jelszó; a `devices` táblában csak a saját eszköz van, titok nélkül); a `chain_entries` táblában `synced_at`; `outbox` és `kv` tábla; a migrációk induláskor futnak.
  - Kész, ha: Jest teszt a migrációkra (vagy legalább a sémára); az app induláskor létrehozza az adatbázist.
  - Spec: Adatbázis (utolsó bekezdés).

- [x] **M3-02 Idő- és azonosítósegédek**
  - Mit: UUIDv7 generátor; ISO 8601 UTC ezredmásodperccel; `waypost-clock` wrapper; a „megbízható idő” becslése a `kv` táblában tárolt utolsó `server_time` + uptime alapján (ugyanazon boot ID mellett).
  - Kész, ha: Jest tesztek (a natív modul mockolva).

- [x] **M3-03 Secure store réteg**
  - Mit: supervisortoken, eszköztoken, eszköztitok tárolása, olvasása, törlése.

- [x] **M3-04 API-kliens**
  - Mit: alap-URL konfiguráció, Bearer token, `Idempotency-Key` minden író kérésnél, a hibaformátum értelmezése (típusos hibák), a `@waypost/schema` TS típusai, `__DEV__` módban Ajv-ellenőrzés a válaszokra.
  - Kész, ha: Jest tesztek mockolt fetch-csel (sikeres válasz, 401, `device_revoked`, 422, sémahibás válasz fejlesztői módban).
  - Spec: Repo és technológiai stack (a csomag szabályai).

- [x] **M3-05 Indulási állapotok és navigációs váz** `⚠ Q1`
  - Mit: a három indulási állapot (nincs hozzárendelve → supervisor belépés; telephelyi telefon → PIN; supervisor saját telefonja → telephelylista); expo-router csoportok: `(auth)`, `(guard)`, `(supervisor)`; átirányítás az állapot szerint.
  - Spec: Mobilapp.

- [x] **M3-06 Fejlesztői eszköz-hozzárendelés** `⚠ Q7`
  - Mit: csak `__DEV__` módban egy képernyő: supervisor login + `POST /devices/enroll`, a token és a titok mentése. Az M3 teszteléséhez kell, mert a valódi hozzárendelés felülete csak M5-ben készül.
  - Kész, ha: a workbench demó-telephelyéhez (M2-06) a telefon hozzárendelhető.

### Szinkron (pull rész)

- [x] **M3-07 Pull**
  - Mit: lapozás a kurzorral, amíg `has_more` igaz; egy tranzakcióban upsert és a `deleted` szerinti törlés; a kurzor, a `server_time` és a hozzá tartozó uptime/boot ID mentése a `kv` táblába; esemény a többi modulnak (ébresztés újraütemezése).
  - Kész, ha: Jest tesztek (teljes, inkrementális, lapozott, törléses pull; hiba esetén a tranzakció visszagördül, a kurzor nem lép).
  - Spec: Szinkron protokoll / Pull.

- [x] **M3-08 Szinkron-vezérlő**
  - Mit: mutex (egyszerre egy szinkron); a sorrend: push → média → outbox → pull (az első három itt még üres lépés, M4-ben és M5-ben töltődik fel); indítók: app indulás, előtérbe kerülés, NetInfo „online”, 2 mp-es késleltetés láncbejegyzés után (összevonással), műszakzárás, előtérben 5 percenként.
  - Kész, ha: Jest tesztek a mutexre, a debounce-ra és a sorrendre.
  - Spec: Szinkron protokoll / Mikor fut.

- [x] **M3-09 Szinkronállapot-tár (Zustand)**
  - Mit: online/offline, feltöltetlen tételek száma, utolsó sikeres szinkron ideje, utolsó hiba; „Szinkron most” művelet.

### Lánc

- [x] **M3-10 `canonical_json` (RFC 8785)**
  - Mit: saját vagy bevált könyvtárra épülő implementáció; lebegőpontos szám esetén kivétel.
  - Kész, ha: a `chain/test-vectors.json` minden `canonical_json` esete bájtra egyezik.
  - Spec: Láncolt napló / Bejegyzés és lenyomat.

- [x] **M3-11 HMAC és láncíró**
  - Mit: HMAC-SHA256 a react-native-quick-crypto-val (a tesztekben Node crypto); globális írási zár; `seq` kiosztás 1-től hézag nélkül; `prev_hash` (első bejegyzésnél 64 db `0`); a bejegyzés és a vetületrekord egy SQLite tranzakcióban; az idő- és referenciamezők (`device_time`, `uptime_ms`, `boot_id`, `gnss_time`, `ref_*`) kitöltése.
  - Kész, ha: a tesztvektorok hash-ei egyeznek; párhuzamos írási teszt: a `seq` folytonos marad; a tranzakció hibájánál sem bejegyzés, sem vetület nem marad.
  - Spec: Láncolt napló.

- [x] **M3-12 Bejegyzés-építők típusonként**
  - Mit: függvények a hat típus payloadjának összeállításához; koordináta → `lat_e7` / `lng_e7`, pontosság → `accuracy_dm` (egész kerekítéssel); `media: [{id, sha256}]`.
  - Kész, ha: Jest tesztek; a kimenet validál a `@waypost/schema` láncsémáin.

### Domain (tiszta TS függvények, `src/domain`)

- [x] **M3-13 Menetrend-kibontás** `⚠ Q5`
  - Mit: menetrend + időszak → várt időpontok a telephely időzónájában (`list`, `interval`, éjfélen átnyúló ablak, `weekdays` a kezdő napra, DST).
  - Kész, ha: a `schedule/test-vectors.json` minden esete zöld.
  - Spec: Állapotgépek / Menetrend → körök.

- [x] **M3-14 Időkeret és határidő**
  - Mit: időkeret-alapérték (`ceil(walk_duration_s × 1,5 / 300) × 5`, különben 20 perc); határidő: `scheduled_at + time_limit_min`; időkeret nélkül az útvonal következő körének időpontja; a nap utolsó körénél `scheduled_at + 60 perc`.
  - Kész, ha: Jest tesztek minden ágra.
  - Spec: Állapotgépek / Kör.

- [x] **M3-15 PIN-ellenőrzés és zárolás** `⚠ Q6`
  - Mit: PBKDF2 a react-native-quick-crypto natív implementációjával; a beírt PIN-hez tartozó felhasználó megkeresése a telephely felhasználói között; szerep (őr / supervisor); 5 hiba után 5 perc zárolás, utána minden hibánál duplázódik; a számláló SQLite-ban, az eltelt idő uptime alapján.
  - Kész, ha: Jest tesztek (a PIN-tesztvektor az M2-09-ből; zárolás, duplázás, feloldás, inaktív felhasználó).
  - Spec: Azonosítás / PIN-kód.

- [x] **M3-16 Műszak-állapotgép**
  - Mit: belépés őrként → `shift_started`; ugyanaz az őr → folytatás; másik őr → a nyitott körök zárása, `shift_closed (handover)`, `shift_started`; zárás az őr döntésével (`guard`), nyitott kör esetén annak zárásával; automatikus zárás a nap utolsó ütemezett körének zárása után 60 perccel (`auto`). `⚠ Q10`
  - Kész, ha: Jest tesztek minden átmenetre; a kimenet a létrehozandó láncbejegyzések listája.
  - Spec: Állapotgépek / Műszak.

- [x] **M3-17 Kör-állapotgép és ütemező lépés**
  - Mit: az ütemező lépés (bemenet: állapot, idő) megnyitja az esedékes köröket (`round_opened`), ha van nyitott műszak; a kimaradt időpontot az eredeti `scheduled_at` értékkel nyitja meg, és ha a határidő is lejárt, azonnal zárja; útvonalanként legfeljebb egy nyitott kör (új időpontnál az előző zárul); `in_progress` az első érvényes leolvasásnál; `completed` azonnal, ha minden pont megvan (a kézi is számít); a határidőnél `incomplete` vagy `missed`; az egy futó kör nem vált útvonalverziót.
  - Kész, ha: Jest tesztek minden állapotátmenetre és a kimaradt időpontokra.
  - Spec: Állapotgépek / Kör.

- [x] **M3-18 Leolvasás feloldása és jelölései**
  - Mit: NFC: UID → pont a telephelyen; QR: teljes payload → pont; nincs találat → `unknown_tag` és hibaképernyő; ismétlés a körben → nincs bejegyzés, „Már leolvasva HH:MM-kor”; nincs nyitott kör vagy a pont nincs az útvonalon → `round_id = null`, `out_of_round`; kötött sorrendnél a legkisebb `position`-ú hiányzó pont a várt, eltérésnél `out_of_order` (de számít); `mock_location` jelölés.
  - Kész, ha: Jest tesztek minden esetre.
  - Spec: Állapotgépek / Leolvasás; Láncolt napló / Jelölések.

- [x] **M3-19 Kézi rögzítés és esemény a domainben**
  - Mit: kézi rögzítés → `scan` (`method = manual`, `manual` jelölés) + `incident` (`damaged_tag`, `scan_id`-val), a fotó és a megjegyzés kötelező; esemény: kategória, megjegyzés, 0–5 fotó, legközelebbi pont.
  - Kész, ha: Jest tesztek (a fotó vagy a megjegyzés hiánya hiba).

### Eszközszolgáltatások

- [ ] **M3-20 Helymeghatározás**
  - Mit: expo-location (előtér); az utolsó ismert pozíció, ha 60 mp-nél frissebb, különben legfeljebb 5 mp várakozás, utána helyadat nélkül; Androidon a mock-forrás és a `gnss_time` (ha a helyadat GPS-forrású).
  - Kész, ha: Jest tesztek mockolt providerrel az időkorlátokra.
  - Spec: Állapotgépek / Leolvasás 6.

- [ ] **M3-21 Fotó**
  - Mit: csak kamera (galéria nem); tömörítés: hosszabbik oldal 1600 px, JPEG 0,7; sha256; helyi `media` rekord `path = null` szerveroldali státusszal.
  - Spec: Repo és technológiai stack (Fotó).

- [ ] **M3-22 NFC és QR szolgáltatás (az M1 prototípusból)**
  - Mit: Androidon előtérbeli figyelés csak a kör és a betanítás képernyőjén (máshol a címke nem csinál semmit); iOS-en gombra induló munkamenet; a QR-olvasó csak `waypost:cp:` kódot fogad el; haptika és hang: siker / hiba (két rövid rezgés) / figyelmeztetés.
  - Spec: Mobilapp / NFC és QR; DESIGN_HANDOFF 7.

- [ ] **M3-23 Ütemező futtató**
  - Mit: a domain ütemező lépésének futtatása induláskor, előtérbe kerüléskor, minden értesítéskor és előtérben 30 másodpercenként; a kimenetének láncba írása.

- [ ] **M3-24 Ébresztés-ütemezés**
  - Mit: mindig a következő 36 óra körei, legfeljebb 48 értesítés; körönként kettő (időpontban, és +5 percnél emlékeztető, amelyet a kör indulása töröl); a teljes lista cseréje induláskor, pull után, műszakkezdéskor és minden értesítéskor; koppintásra a kör képernyője, vagy ha nincs belépett őr, a PIN-képernyő; figyelmeztető sáv a PIN-képernyőn, ha hiányzik egy Android-engedély.
  - Kész, ha: Jest tesztek a lista kiszámítására (36 óra, 48-as korlát, emlékeztető törlése).
  - Spec: Mobilapp / Ébresztés.

### Felület (őr mód)

- [ ] **M3-25 ThemeProvider és betűtípus**
  - Mit: sötét / világos téma rendszer szerint, kézi felülírással; Manrope betűtípus; a `tokens.ts` használata.
  - Spec: DESIGN_HANDOFF 3.

- [ ] **M3-26 Alapkomponensek I.**: `Button`, `IconButton`, `StatusDot`, `StatusBadge`, `Card`, `InfoBanner`, `TextField` / `TextArea`, `Switch`, `SegmentedControl`. (DESIGN_HANDOFF 5.; referencia: `T-Komponensek.dc.html`.)

- [ ] **M3-27 Alapkomponensek II.**: `SyncIndicator`, `PointListItem`, `ProgressRing`, `ProgressSegments`, `RoundTimeline`, `PhotoSlot` / `PhotoAdd`, `CategoryTile`, `PinPad` + `PinDots`, `ResultScreen`. Akadálymentesség a DESIGN_HANDOFF 8. szerint.

- [ ] **M3-28 Szinkronjelző a fejlécben**
  - Mit: online / offline / „N tétel vár feltöltésre”; koppintásra az utolsó sikeres szinkron ideje és „Szinkron most” gomb; minden képernyőn.

- [ ] **M3-29 PIN-képernyő (G1, `B-PIN`)**: telephely neve, 6 jegyű billentyűzet, szinkronállapot, zárolásnál visszaszámlálás, az engedélyekre figyelmeztető sáv.

- [ ] **M3-30 Műszakkezdés képernyő (G2, `B-Muszakkezdes`)** `⚠ Q1`: a design szerint; a specifikációban nincs külön képernyő, a döntés a `decisions.md`-be kerül.

- [ ] **M3-31 Műszak kezdőlap (G3, `B-Kezdolap`)**: a következő kör visszaszámlálással, az éjszaka körei idővonalon állapottal, „Esemény rögzítése” és „Műszak zárása” gomb.

- [ ] **M3-32 Ébresztés képernyő (G4, `B-Ebresztes`)** `⚠ Q1`: hang és rezgés ismétlődve, „Indulok” (a kör képernyője) és „Hang némítása”; halasztás nincs.

- [ ] **M3-33 Kör folyamatban – lista (G5, `B-Kor`)**: pontlista (leolvasva időponttal / hátralévő), hátralévő idő (az utolsó 5 percben figyelmeztető szín és egyszeri rezgés), nagy „Leolvasás” gomb (iOS-en NFC), QR gomb, „Címke nem olvasható”; expo-keep-awake; Androidon előtérbeli NFC-figyelés.

- [ ] **M3-34 Kör folyamatban – térkép (G6, `B-Terkep`)** `⚠ Q1`: react-native-maps, a pontok és a leolvasások összekötve. A specifikáció nem említi; ha a döntés „később”, ez a feladat átkerül a 2. lépcsőbe.

- [ ] **M3-35 Leolvasás eredménye (G7–G9, `B-Siker`, `B-Ismeretlen`, `B-Sorrend`)**: siker (pont neve, utasítás, 3 mp után vissza), ismeretlen címke, már leolvasva, rossz sorrend; haptika típusonként; fade + scale animáció.

- [ ] **M3-36 Kézi rögzítés (G10, `B-Kezi`)**: pontválasztás az útvonal listájából, kötelező fotó (csak kamera) és megjegyzés.

- [ ] **M3-37 Esemény rögzítése (G11, `B-Esemeny`)**: kategória, megjegyzés, 0–5 fotó (csak kamera).

- [ ] **M3-38 Műszakzárás (G12, `B-Zaras`)**: összegzés (körök állapota, események száma, feltöltetlen tételek), figyelmeztetés nyitott körnél, megerősítés PIN-nel.

### Lezárás

- [ ] **M3-39 Tesztlefedettség és minőség**: Jest ≥ 90% a `src/domain`, `src/chain` és `src/sync` modulokra; TypeScript strict; ESLint hibamentes; a közös tesztvektorok a tesztekben.

- [ ] **M3-40 Elfogadás**: a domain és a lánc tesztjei zöldek a közös tesztvektorokkal; telefonon egy 5 perces körökkel beállított, 1 órás műszak teljesen offline végigvihető (a demó-telephellyel); a `device-test.md` M3-as futása kitöltve.

---

## M4 – Push, média, láncellenőrzés (mindkét repo)

Cél: az eszköz adatai hibátlanul a szerverre kerülnek, és a szerver ellenőrzi a láncot.

### Séma

- [ ] **M4-01 Séma: push-final, média, entitások**
  - Mit: `sync-push-final.request/response`, `media-upload` (multipart mezők leírása, `sha256`) és válasza, a `media` entitás; minor verzióemelés és CHANGELOG.

### Backend

- [ ] **M4-02 Láncellenőrző (PHP)**
  - Mit: `src/Chain`: `canonical_json` (RFC 8785) és HMAC-SHA256 ellenőrzés.
  - Kész, ha: a `chain/test-vectors.json` minden esete egyezik (Pest unit teszt).

- [ ] **M4-03 `POST /sync/push`: fogadás és ellenőrzés**
  - Mit: legfeljebb 200 bejegyzés `seq` szerint növekvő sorrendben; eszközönkénti zárolt tranzakció; sorrendben: `seq` → `gap`, `prev_hash` → `fork`, HMAC → `bad_hmac`; `ok` esetén a `last_seq` és a `last_hash` frissítése; már elfogadott bejegyzés újraküldése is `accepted`; `rejected` lista kódokkal; `last_seen_at` frissítése.
  - Kész, ha: feature tesztek: jó köteg, újraküldés, gap, fork, bad_hmac, rossz sorrendű köteg, 200 feletti köteg.
  - Spec: Láncolt napló / Szerveroldali ellenőrzés; API-szerződés / Push.

- [ ] **M4-04 Hiánypótlás (gap)**
  - Mit: a hiány után érkező bejegyzés eltárolódik, de nem kerül vetületbe; amikor a hiányzó bejegyzés megérkezik, a várakozó bejegyzések sorrendben feldolgozódnak.
  - Kész, ha: feature teszt: 1, 2, 4, 5, majd 3 → minden `ok`, a vetület teljes.

- [ ] **M4-05 Vetületek**
  - Mit: a hat típus alkalmazása a `shifts`, `rounds`, `scans`, `incidents` és `media` (helyőrző) táblákra, idempotensen a payload ID-k alapján.
  - Kész, ha: unit tesztek típusonként és a kétszeri alkalmazásra.

- [ ] **M4-06 Szerveroldali jelölések**
  - Mit: `time_suspect` (becsült idő vs. `device_time`, illetve `gnss_time` vs. `device_time`, 2 perc); `too_fast` (a betanított gyalogidő 40%-a, csak egymást követő betanított pontokra); `far_from_checkpoint` (haversine, `max(50 m, 3 × pontosság)`, mindkét pontosság 50 m alatt); `late_sync` (a műszak zárása után 12 órán túl).
  - Kész, ha: unit tesztek minden jelölésre a határértékek két oldalán.
  - Spec: Láncolt napló / Jelölések.

- [ ] **M4-07 `media_missing` és `PUT /media/{id}`**
  - Mit: a push válaszában azok a hivatkozott fotók, amelyek még nincsenek fent; a feltöltés multipart, a sha256 ellenőrzése a payloadban rögzített lenyomattal, privát lemez, `path` és `uploaded_at` beállítása; idempotens újrafeltöltés.
  - Kész, ha: feature tesztek (jó, rossz lenyomat, idegen eszköz, ismételt feltöltés).

- [ ] **M4-08 `POST /sync/push-final`**
  - Mit: visszavont eszköz egyszeri utolsó feltöltése (ugyanaz az ellenőrzés, mint a push-nál), utána ez a lehetőség is lezárul.
  - Kész, ha: feature tesztek (első hívás sikerül, második 401, nem visszavont eszköz nem használhatja).

### App

- [ ] **M4-09 Push az appban** `⚠ Q2`
  - Mit: a nyugtázatlan bejegyzések `seq` szerint, 200-as kötegekben; nyugtázáskor `synced_at`; `chain_gap` / `chain_fork` esetén nincs újrapróbálás ugyanarra, hanem diagnosztikai jelzés megy a szervernek.
  - Kész, ha: Jest tesztek (kötegelés, nyugtázás, részleges elutasítás).
  - Spec: Szinkron protokoll / Push és média.

- [ ] **M4-10 Médiafeltöltés az appban**
  - Mit: a push után, egyesével; a `media_missing` és a helyi feltöltetlen lista alapján; újrapróbálás hálózati hibánál.
  - Kész, ha: Jest tesztek.

- [ ] **M4-11 Visszavont eszköz kezelése**
  - Mit: `device_revoked` válaszra `push-final` (a még fel nem töltött adatokkal), utána a tokenek és a titok törlése, és az app „nincs hozzárendelve” állapotba lép.
  - Kész, ha: Jest teszt a folyamatra.

- [ ] **M4-12 Helyi takarítás**
  - Mit: a nyugtázott bejegyzések és a feltöltött fotók törlése 7 nap után; a lánc utolsó eleme (`last_hash`) mindig megmarad.
  - Kész, ha: Jest teszt.
  - Spec: Szinkron protokoll / Push és média; Adatmegőrzés.

- [ ] **M4-13 Elfogadás**: tesztek a gap, fork, bad_hmac és idempotencia esetekre (backend és app); 2 óra repülőgép-üzemmód után minden adat hibátlanul a szerverre kerül, `verify_status = ok`; `device-test.md` frissítve (repülőgép-üzemmód, telefoncsere).

---

## M5 – `waypost` (+ backend): supervisor mód

Cél: egy telephely teljesen beállítható csak a telefonról; az offline végzett módosítások a hálózat visszatértekor végrehajtódnak.

### Séma és backend

- [x] **M5-01 Séma: konfigurációs CRUD végpontok** *(előrehozva az M2-16 – M2-21 elé)*
  - Mit: kérés- és válaszsémák a `/sites`, `/sites/{id}/users`, `/checkpoints`, `/routes`, `/routes/{id}/versions`, `/schedules`, `/users`, `/report-subscriptions` végpontokhoz; az `X-Acting-User` fejléc dokumentálása; minor verzió.
  - Kész, ha: a backend M2-es CRUD-tesztjei a sémaellenőrzéssel is zöldek.

- [ ] **M5-02 Backend: szerveroldali UUID elfogadása**
  - Mit: az összes létrehozó végpont elfogadja az app által generált UUID-t (az outbox miatt), és ugyanarra az ID-ra idempotens.
  - Kész, ha: feature tesztek.

### App – infrastruktúra

- [ ] **M5-03 Outbox**
  - Mit: minden supervisorművelet a helyi adatbázist frissíti és outbox-sort hoz létre (metódus, útvonal, törzs, idempotencia-kulcs; az ID-t az app generálja); FIFO kiküldés; 4xx (kivéve 401 és 429) esetén jelzés a supervisornak, és a következő pull felülírja a helyi állapotot; hálózati hibánál és 5xx-nél exponenciális visszatartás 5 mp-től 10 percig, jitterrel; telephelyi telefonon `X-Acting-User` fejléc.
  - Kész, ha: Jest tesztek (sorrend, visszatartás, 4xx, 401, 429).
  - Spec: Szinkron protokoll / Outbox.

- [ ] **M5-04 Supervisor mód a telephelyi telefonon PIN-nel**
  - Mit: ha a PIN egy hozzárendelt supervisoré, supervisor módba lép; az ő nevében mennek a kérések; a fejlécben „Supervisor” jelvény.

- [ ] **M5-05 Supervisor saját telefonja**
  - Mit: fiókkal, eszközhozzárendelés nélkül; nincs őr mód és nincs lánc; a pull a hozzárendelt telephelyeket hozza; kijelentkezés.

### App – képernyők

- [ ] **M5-06 Supervisor belépés (S1, `B-Login`)**: e-mail, jelszó, hibakezelés, a token mentése.

- [ ] **M5-07 Telephelyek (S2, `S-Telephelyek`)**: lista, új telephely.

- [ ] **M5-08 Telephely részletei (S3, `S-Telephely`)**: útvonalak, menetrendek, őrök, hozzárendelt telefon, jelentésbeállítások, „Telefon hozzárendelése”.

- [ ] **M5-09 Telefon hozzárendelése**
  - Mit: a valódi folyamat (felváltja az M3-06 fejlesztői képernyőt): `POST /devices/enroll`, a token és a titok mentése, a supervisortoken törlése erről a telefonról, azonnali teljes pull, utána a PIN-képernyő.
  - Spec: Azonosítás / Telephelyi telefon hozzárendelése.

- [ ] **M5-10 Telefon beállítása – ellenőrzőlista (`device-setup`)**: értesítések, pontos riasztás (Android), akkumulátor-optimalizálás kikapcsolva (Android), helymeghatározás, kamera, NFC; zöld pipák; minden tételhez a rendszerbeállítás megnyitása.

- [ ] **M5-11 Betanítás – domain**
  - Mit: piszkozat, amely csak mentéskor lesz új útvonalverzió; `walk_duration_s` = utolsó − első leolvasás; `walk_time_from_prev_s`; ugyanaz a címke nem lehet két ponté (helyi ellenőrzés és a szerver 409-e).
  - Kész, ha: Jest tesztek.
  - Spec: Állapotgépek / Betanítás.

- [ ] **M5-12 Betanítás – bejárás (S5, `S-Betanitas`)**: leolvasás (Androidon előtérbeli NFC, iOS-en gomb, QR), a rögzített pontok listája, eltelt idő, Mentés / Elvetés.

- [ ] **M5-13 Betanítás – pont adatai (S6, `S-PontAdatai`)**: név, utasítás, fotó.

- [ ] **M5-14 Útvonalverzió bejárás nélkül – domain**
  - Mit: átnevezés, utasítás, fotó, sorrend, pont kivétele is új verziót hoz létre; a mért idők a megmaradt pontokra átöröklődnek; sorrendváltozásnál `walk_time_from_prev_s = null`; új pont és címkecsere csak helyszíni leolvasással.
  - Kész, ha: Jest tesztek.

- [ ] **M5-15 Útvonal szerkesztése (S7, `S-Utvonal`)**: átnevezés, utasítás, fotó, sorrend húzással (react-native-draggable-flatlist), pont kivétele, sorrendtípus; „Új pont felvétele” → betanítás.

- [ ] **M5-16 QR-címke (`checkpoints/[id]/qr`)**: a pont QR-kódja nagyban, megosztás / nyomtatás (expo-print).

- [ ] **M5-17 Menetrend (S8, `S-Menetrend`)**: napok, lista vagy intervallum, időkeret a javasolt értékkel (M3-14), kikapcsolható; mentés után az ébresztések újraütemezése.

- [ ] **M5-18 Őrök és PIN-kódok (S9, `S-Orok`)**: létrehozás, telephelyhez rendelés, PIN generálása (egyszer megjelenítve) vagy cseréje, inaktiválás, a 409 kezelése.

- [ ] **M5-19 Jelentésbeállítások (S10, `S-Jelentesek`)**: előfizetés műszak / napi / heti / havi jelentésre.

- [ ] **M5-20 Kör részletei térképpel (S4, `S-KorReszletek`)** `⚠ Q1`: csak a design tartalmazza; a specifikációban nincs hozzá végpont (kör- és leolvasásadatok lekérése). Döntés kell: 1. lépcső (új végpont + séma) vagy később.

- [ ] **M5-21 Elfogadás**: egy telephely teljesen beállítható csak a telefonról (telephely, pontok betanítással, útvonal, menetrend, őrök, telefon-hozzárendelés, jelentés-előfizetés); repülőgép-üzemmódban végzett módosítások a hálózat visszatértekor végrehajtódnak; `device-test.md` frissítve.

---

## M6 – `laravel-waypost`: jelentések, figyelmeztetés, adatmegőrzés

### Előkészítés

- [ ] **M6-01 Séma: `GET /reports`**: a válasz (jelentéslista aláírt letöltési URL-ekkel); minor verzió.

- [ ] **M6-02 Menetrend-kibontás (PHP, `src/Schedule`)**
  - Mit: ugyanazok a szabályok, mint az appban (M3-13).
  - Kész, ha: a `schedule/test-vectors.json` minden esete zöld (Pest).

- [ ] **M6-03 Jelentésadat-összesítő**
  - Mit: egy időszakra és telephelyre: várt körök (menetrendből), tényleges körök, elmaradt (várt időpont kör nélkül), teljesített, hiányos; jelölések, események; a lánc állapota (hibás bejegyzések száma); „nem teljes adat” jelzés, ha az eszköz még nem szinkronizált az időszak vége óta. A „nap” a kezdő nap.
  - Kész, ha: unit tesztek fixture-ökkel (éjfélen átnyúló ablak, DST-éjszaka, telefon nélküli éjszaka).

- [ ] **M6-04 Aláírt fotó-URL-ek és `GET /reports`**
  - Mit: aláírt, lejáró URL-ek a fotókhoz (az adatmegőrzés végéig) és a tárolt PDF-ekhez; jelentésarchívum supervisor tokennel.
  - Kész, ha: feature tesztek (lejárt URL, idegen telephely).

### Jelentések

- [ ] **M6-05 Műszakjelentés**
  - Mit: a `shift_closed` feldolgozása indítja; legfeljebb 30 perc várakozás a hiányzó fotókra (késleltetett job); HTML e-mail a design `email/shift-report.blade.php` sablonjával; címzettek a `report_subscriptions` szerint; bejegyzés a `reports` táblába; egy kiküldött műszakjelentés nem megy ki újra.
  - Kész, ha: Pest tesztek `Mail::fake()`-kel (időben és későn érkező fotó, átadásos műszak, auto zárás).
  - Spec: Jelentések / Tartalom.

- [ ] **M6-06 Napi jelentés**: scheduler minden nap 10:00 telephelyi időben, az előző napról; HTML e-mail. Kész, ha: Pest tesztek (két különböző időzónájú telephely is helyes időben fut).

- [ ] **M6-07 PDF-alap (dompdf)**: sablon beágyazott bélyegképekkel (a fotók a törlés után is bizonyítékként megmaradnak), magyar ékezetes betűtípus.

- [ ] **M6-08 Heti jelentés**: hétfő 10:00, az előző hétfő–vasárnap; HTML e-mail + PDF; teljesítési arány, elmaradt és hiányos körök, események kategóriánként.

- [ ] **M6-09 Havi jelentés**: a hónap 1-je 10:00, az előző naptári hónap; HTML e-mail + PDF.

### Figyelmeztetés és megőrzés

- [ ] **M6-10 „Nincs adat” figyelmeztetés**
  - Mit: 15 percenkénti job: ha az utolsó várt kör határidejétől `no_data_alert_after_min` perc eltelt, és az eszköz `last_seen_at` értéke ennél régebbi, e-mail a supervisoroknak; menetrendi ablakonként legfeljebb egyszer.
  - Kész, ha: Pest tesztek (szól, nem szól, nem szól kétszer).

- [ ] **M6-11 Adatmegőrzési job**
  - Mit: telephelyenként `max(31, 2 × leghosszabb előfizetett időszak)` nap; naponta törli a régebbi láncbejegyzéseket, vetületeket, médiafájlokat és PDF-eket; a `devices.last_seq` és `last_hash` megmarad; a konfiguráció nem törlődik.
  - Kész, ha: Pest tesztek (31 és 62 napos eset, a lánc folytonossága törlés után is ellenőrizhető).

- [ ] **M6-12 Elfogadás**: Pest tesztek fixture-ökkel és `Mail::fake()`-kel zöldek; a PDF-ek és az e-mailek kézi átnézése rendben (mintapéldányok a workbench demóadataiból).

---

## M7 – Próbaidőszak (minden repo)

- [ ] **M7-01 Gazda-alkalmazás telepítése**: Laravel 13 gazda-alkalmazás a szerveren, `composer require waypost/laravel-waypost`, `waypost:install`, queue worker, scheduler (cron), levelezés, privát lemez, HTTPS, `waypost:create-supervisor`.
- [ ] **M7-02 App terjesztése**: EAS build, belső terjesztés Androidra, TestFlight iOS-re; az éles API-cím beállítása.
- [ ] **M7-03 Telephely beállítása a telefonról**: címkék felhelyezése, betanítás, menetrend, őrök, telefon-hozzárendelés, ellenőrzőlista zölden.
- [ ] **M7-04 Hét éjszaka próbaüzem**: napi ellenőrzés (jelentések megérkeztek, `verify_status`, jelölések, elmaradt körök); a hibák vezetése egy hibalistában.
- [ ] **M7-05 Lezárás**: 7 éjszaka adatvesztés nélkül; minden jelentés megérkezett; a hibalista és a `decisions.md` frissítve; a `device-test.md` utolsó futása Androidon és iPhone-on.

---

## Minden mérföldkő végén

- [ ] a `device-test.md` ellenőrzőlistája végigfuttatva egy Androidon és egy iPhone-on (ahol az adott funkció már létezik);
- [ ] az új döntések a `decisions.md`-ben;
- [ ] ha a séma változott: új verzió a `waypost-schema`-ban, CHANGELOG, és csak utána a két másik repo.

---

## Nyitott kérdések (a specifikáció és a design alapján)

Ezeket célszerű a megfelelő feladat előtt eldönteni és a `decisions.md`-be írni.

- **Q1 – Képernyők és útvonalak eltérése.** A design (`SCREENS.md`) más route-neveket használ (pl. `/(guard)/pin` vs. a specifikáció `(auth)/pin`-je, `/supervisor/...` vs. `(supervisor)/...`), és olyan képernyőket is tartalmaz, amelyek a specifikációban nincsenek: Műszakkezdés (G2), Ébresztés (G4), Kör térképpel (G6), Kör részletei (S4), Betanítás – pont adatai (S6). Melyik a mérvadó, és melyik képernyő tartozik az 1. lépcsőbe? Az S4-hez a szervertől lekért kör- és leolvasásadat is kellene, amire most nincs végpont. **Részben eldöntve (2026-10-28): az útvonalak a specifikáció csoportjai és nevei szerint; a csak a designban szereplő képernyőkről a saját feladatuknál (M3-30, M3-32, M3-34, M5-13, M5-20) születik döntés; részletek: `docs/decisions.md`.**
- **Q2 – Diagnosztikai esemény `chain_gap` / `chain_fork` esetén.** A specifikáció szerint az app „diagnosztikai eseményt küld”, de erre nincs se bejegyzéstípus, se végpont, és maga a lánc a hibás. Javaslat: egy külön, láncon kívüli `POST /devices/diagnostics` végpont (séma: M4-01).
- **Q3 – Törlések a pullban.** A `deleted` listához tudni kell, mi törlődött. Soft delete (`deleted_at`) csak a `users` és a `sites` táblán van; a `checkpoints`, `routes` és `schedules` táblán csak `active` mező van. Javaslat: `deleted_at` minden szinkronizált táblára, vagy egy közös törlésnapló-tábla. **Eldöntve (2026-10-28): `deleted_at` (soft delete) és `updated_at` minden szinkronizált táblán; részletek: `laravel-waypost/docs/decisions.md`.**
- **Q4 – Idempotencia-kulcsok tárolása.** Az adatmodellben nincs rá tábla. Javaslat: `waypost_idempotency_keys` (M2-04). **Eldöntve (2026-10-28): a javaslat szerint, hívónként egyedi kulccsal; részletek: `laravel-waypost/docs/decisions.md`.**
- **Q5 – DST-szabály a menetrendben.** Mi legyen a tavaszi váltáskor nem létező (02:30) és az őszi váltáskor kétszer előforduló helyi időponttal? És az intervallum lépései faliórás időpontok (20:00, 21:00 … helyi idő szerint) vagy valós eltelt percek? Javaslat: faliórás időpontok; a nem létező időpontot a váltás utáni első érvényes időre toljuk, a kétszer előfordulónál az elsőt vesszük. Ez a tesztvektorokat (M0-08) is meghatározza. **Eldöntve (2026-10-27): a javaslat szerint; részletek: `waypost-schema/docs/decisions.md`.**
- **Q6 – PIN-zárolás újraindítás után.** A zárolás az uptime-ot méri, ami újraindításkor nulláz. Javaslat: ha a boot ID megváltozott, a zárolás a teljes, eredeti időtartammal újraindul (így újraindítással nem lehet megkerülni). **A javaslat szerint megvalósítva (2026-10-29, M3-15), jóváhagyásra vár; részletek: `docs/decisions.md`.**
- **Q7 – Eszköztoken M3-ban.** Az M3 offline tesztjéhez hozzárendelt telefon kell, de a hozzárendelés felülete csak M5-ben készül. Javaslat: fejlesztői hozzárendelő képernyő (M3-06). **Eldöntve (2026-10-28): a javaslat szerint, `/dev/enroll`, csak fejlesztői buildben; részletek: `docs/decisions.md`.**
- **Q8 – Sanctum token gazdája.** Az eszköztoken a `Device` modellhez tartozzon (javaslat), vagy egy technikai felhasználóhoz? **Eldöntve (2026-10-28): a `Device`-hoz, a csomag saját tokentáblájában (`waypost_personal_access_tokens`); részletek: `laravel-waypost/docs/decisions.md`.**
- **Q9 – A supervisor saját telefonjának pullja.** Az összes hozzárendelt telephely adatát kapja, PIN-hashekkel együtt? Javaslat: igen, de a PIN-mezők nélkül (neki nincs szüksége offline PIN-ellenőrzésre). **Eldöntve (2026-10-28): a javaslat szerint, a CRUD-válaszokban és a pullban (M2-23); részletek: `laravel-waypost/docs/decisions.md`.**
- **Q10 – „A nap utolsó ütemezett köre” több útvonalnál.** Az automatikus műszakzárás a telephely összes útvonalának utolsó köréhez igazodik? Javaslat: igen, a legkésőbbi határidejű kör zárása + 60 perc. **A javaslat szerint megvalósítva (2026-10-29, M3-17), jóváhagyásra vár; részletek: `docs/decisions.md`.**
- **Q11 – Közös PIN-tesztvektor.** A specifikáció nem írja elő, de a PBKDF2-paraméterek eltérése csendes hibát okozna. Javaslat: egy PIN-vektor a `waypost-schema` repóba (pl. `pin/test-vectors.json`). **Eldöntve (2026-10-28): a javaslat szerint, `waypost-schema/pin/test-vectors.json`; részletek: `waypost-schema/docs/decisions.md`.**
- **Q12 – Az app neve.** A design „Őrjárat”, a specifikáció „Waypost”. Mi jelenjen meg a telefonon és az e-mailekben? **Eldöntve (2026-10-27): „Waypost”; bundle ID / package name `com.tamaslabs.waypost`; részletek: `docs/decisions.md`.**
- **Q13 – Rossz sorrend visszajelzése.** A specifikáció hibánál két rövid rezgést és piros jelzést ír; a design a rossz sorrendre „Warning” haptikát ad (mert a leolvasás számít). Javaslat: a designé.
- **Q14 – `chain_entries.type` adatbázis-típusa.** A 2. lépcső új típusokat hoz (`sos`); egy DB `enum` bővítése migrációt igényel. Javaslat: `string` oszlop, a validálás a sémában. **Eldöntve (2026-10-28): a javaslat szerint, minden felsorolásra; részletek: `laravel-waypost/docs/decisions.md`.**
