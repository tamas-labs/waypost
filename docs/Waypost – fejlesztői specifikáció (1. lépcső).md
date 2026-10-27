# Waypost – fejlesztői specifikáció (1. lépcső)

Oct 27, 2026 · @Tamás BALINT

## Hogyan használd ezt a dokumentumot

Ez a dokumentum a Claude Code-nak szól: alapján kell megírni a Waypost 1. lépcsőjét, vagyis egy offline-first mobilappot és a hozzá tartozó Laravel backendet. A „miért” az alapspecifikációban van ([Waypost – alapspecifikáció](https://claude.ai/artifact/19hX1UP8NULGrrFThV7Ldb)), a „hogyan” ebben a dokumentumban.

Alapszabályok:

1. A munka a Mérföldkövek szakasz sorrendjében halad. Egy mérföldkő akkor kész, ha az elfogadási feltételei teljesülnek és a tesztek zöldek.
2. A 2. lépcső funkcióit (élő követés, SOS, diszpécser, élő riasztások) ne építsd meg, csak az adatmodellben és az API-ban ne zárd ki őket.
3. Ha valami nincs itt eldöntve, válaszd a legegyszerűbb megoldást, ami a dokumentum többi szabályával összhangban van, és jegyezd fel a `docs/decisions.md` fájlba (dátum, kérdés, döntés, indok).
4. A felhasználói felület minden szövege magyar. A kód, az azonosítók, a commitüzenetek és a kódkommentek angolok.
5. A kinézet a Claude Designban készülő design systemet követi. Amíg az nincs meg, egy egyszerű, sötét alaptémát használj, amelynek minden színe és mérete egyetlen témafájlban (`waypost/src/theme/tokens.ts`) van, hogy később egy helyen lehessen cserélni.
6. Az eszközön létrejövő adat soha nem módosul és nem törlődik a szinkron előtt; minden állapotváltozás új rekord vagy egyértelmű mezőfrissítés, amelyet a napló is rögzít.

A kulcsfogalmak (telephely, útvonal, menetrend, műszak, kör, leolvasás, esemény) jelentése az alapspecifikáció Fogalmak szakaszában van.

## Repo és technológiai stack

Három külön könyvtár (repo) van, mindegyik saját `CLAUDE.md` fájllal, amely erre a dokumentumra hivatkozik. A két alkalmazás közötti szerződés a `waypost-schema` repo: ha az API vagy a lánc formátuma változik, előbb ott kell módosítani, új verziószámmal, és csak utána a két másik repo kódjában.

| Könyvtár | Tartalom | Kinek kell |
| --- | --- | --- |
| `waypost-schema` | JSON Schema (draft 2020-12) az API kéréseihez, válaszaihoz, az entitásokhoz és a láncbejegyzésekhez; a lánc tesztvektorai | mindkettőnek: npm-csomagként az appnak, Composer-csomagként a backendnek |
| `laravel-waypost` | Laravel 13 csomag: a teljes backend (migrációk, modellek, API, jobok, e-mailek), egy tetszőleges Laravel 13 alkalmazásba telepíthető | a gazda-alkalmazásnak |
| `waypost` | Expo / React Native app | az őröknek és a supervisoroknak |

```text
waypost-schema/
  CLAUDE.md
  package.json             # npm-csomag: "@waypost/schema", TS típusgenerálással
  composer.json            # Composer-csomag: "waypost/schema"
  schemas/
    entities/              # site, user, checkpoint, route, route-version, schedule, ...
    api/                   # <végpont>.request.json, <végpont>.response.json, error.json
    chain/                 # entry.json, payload-<type>.json
  chain/test-vectors.json  # bemenet → canonical_json → hash példák
  schedule/test-vectors.json  # menetrend + dátum → várt időpontok (DST-vel)
  examples/                # érvényes és érvénytelen mintapéldányok minden sémához
  scripts/                 # sémaellenőrzés, TS típusok generálása (json-schema-to-typescript)
  CHANGELOG.md             # semver; törő változás = új major verzió és új /vN API

laravel-waypost/
  CLAUDE.md
  composer.json            # "waypost/laravel-waypost", függ: laravel 13, sanctum, waypost/schema
  config/waypost.php       # route prefix, middleware, tábla-előtag, storage disk, queue, mail
  database/migrations/
  routes/api.php
  src/
    WaypostServiceProvider.php
    Models/ Http/Controllers/ Http/Requests/ Policies/
    Chain/                 # kanonikus JSON, HMAC, ellenőrzés, vetületek
    Schedule/              # menetrend → várt körök (a jelentésekhez)
    Reports/ Jobs/ Mail/ Console/
  resources/views/         # e-mail és PDF sablonok
  tests/                   # Pest + Orchestra Testbench
  workbench/               # Testbench workbench a helyi futtatáshoz

waypost/
  CLAUDE.md
  app/                     # expo-router képernyők
  modules/waypost-clock/   # saját Expo-modul: monoton óra, boot ID
  src/
    db/ domain/ sync/ chain/ nfc/ qr/ alarms/ location/
    theme/tokens.ts
```

A backend csomag így kerül egy gazda-alkalmazásba: `composer require waypost/laravel-waypost`, majd `php artisan waypost:install` (konfiguráció publikálása, migrációk). Fejlesztés közben a séma helyi útvonalról jön: Composer `path` repository, illetve npm `file:../waypost-schema`.

A csomag szabályai:

- Minden tábla `waypost_` előtagot kap (konfigurálható), és a csomag nem nyúl a gazda-alkalmazás tábláihoz.
- A csomag saját felhasználói modellt használ (`Waypost\Models\User`, `waypost_users`), Sanctum tokenekkel. A gazda-alkalmazás `users` tábláját nem használja.
- Az útvonalak a konfigurált előtag alatt vannak (alapértelmezés: `api/waypost/v1`).
- A bemenő JSON-t a `waypost/schema` sémáival is ellenőrizni kell (opis/json-schema), a Laravel FormRequest csak az adatbázisfüggő szabályokat (létezés, egyediség) nézi.
- Az appban a hálózati réteg a sémákból generált TS típusokat használja, és fejlesztői módban (`__DEV__`) a válaszokat is ellenőrzi (Ajv).

| Réteg | Választás | Megjegyzés |
| --- | --- | --- |
| App keretrendszer | Expo (legfrissebb stabil SDK), TypeScript strict, expo-router | fejlesztői build (development build), Expo Go nem elég az NFC miatt |
| NFC | react-native-nfc-manager | config pluginnel; iOS: NFC Tag Reading entitlement |
| QR | expo-camera (barcode scanning) |  |
| Helyi DB | expo-sqlite + Drizzle ORM | migrációk a kódban, induláskor futnak |
| Ébresztés | expo-notifications | részletek a Mobilapp szakaszban |
| Helymeghatározás | expo-location (előtér) |  |
| Kriptográfia | react-native-quick-crypto (HMAC-SHA256, PBKDF2), expo-secure-store |  |
| Fotó | expo-image-picker vagy expo-camera, expo-image-manipulator | tömörítés: hosszabbik oldal 1600 px, JPEG 0,7 |
| Állapotkezelés | Zustand a UI-állapothoz; az igazság forrása a SQLite |  |
| App tesztek | Jest a `src/domain`, `src/chain`, `src/sync` modulokra |  |
| Backend | Laravel 13 csomag, PHP 8.4; a gazda-alkalmazás MySQL 8 vagy PostgreSQL 16 adatbázisát használja |  |
| API-azonosítás | Laravel Sanctum, kétféle token: supervisor és eszköz |  |
| Háttérfeladatok | Laravel queue (database driver induláskor), scheduler |  |
| PDF | barryvdh/laravel-dompdf |  |
| Fájlok | Laravel Storage, privát lemez; letöltés aláírt, lejáró URL-lel |  |
| Backend tesztek | Pest + Orchestra Testbench, PHPStan (Larastan) 8-as szint |  |

Az idők a szerveren UTC-ben tárolódnak, a telephely időzónája (`Europe/Budapest`) csak a menetrend értelmezéséhez és a megjelenítéshez kell. Az appban minden időbélyeg ISO 8601, UTC, ezredmásodperccel.

## Adatbázis

Minden elsődleges kulcs UUIDv7, mert az eszközön és offline is keletkezik adat. Az eszközön történt dolgok egyetlen igazságforrása a `chain_entries` tábla. A `shifts`, `rounds`, `scans` és `incidents` táblák ebből készülő vetületek, amelyeket a szerver a lánc feldolgozásakor tölt fel (lásd Láncolt napló). A konfigurációs táblákat (telephely, pont, útvonal, menetrend, felhasználó) a supervisor REST API-n keresztül módosítja.

```text
-- Konfiguráció
users            id, name, role enum(supervisor|guard), email? unique, password?,
                 pin_hash, pin_salt, pin_iterations, active bool, timestamps, deleted_at
sites            id, name, address?, timezone default 'Europe/Budapest',
                 no_data_alert_after_min int default 120, created_by → users, timestamps, deleted_at
site_user        site_id → sites, user_id → users            PK(site_id, user_id)
devices          id, site_id? → sites, name, platform enum(ios|android), app_version,
                 secret (encrypted cast), enrolled_by → users, enrolled_at, revoked_at?,
                 last_seen_at?, last_seq int default 0, last_hash char(64)?
checkpoints      id, site_id → sites, name, instruction? text, tag_type enum(nfc|nfc_dna|qr),
                 tag_uid? (hex, nagybetű, kettőspont nélkül), qr_payload?,
                 lat decimal(10,7), lng decimal(10,7), accuracy_m float,
                 photo_media_id? → media, active bool, timestamps
                 UNIQUE(site_id, tag_uid), UNIQUE(qr_payload)
routes           id, site_id → sites, name, order_mode enum(free|fixed),
                 current_version_id? → route_versions, active bool, timestamps
route_versions   id, route_id → routes, version int, walk_duration_s int?, created_by → users,
                 created_at                                    UNIQUE(route_id, version)
route_version_checkpoints
                 route_version_id → route_versions, checkpoint_id → checkpoints,
                 position int, walk_time_from_prev_s int?      PK(route_version_id, position)
schedules        id, route_id → routes, name, weekdays tinyint (bitmaszk: 1=hétfő … 64=vasárnap),
                 mode enum(list|interval), start_times json? (pl. ["20:00","21:00"]),
                 interval_from time?, interval_to time?, interval_every_min int?,
                 time_limit_min int? (null = nincs korlát), active bool, timestamps
report_subscriptions
                 id, user_id → users, site_id → sites, frequency enum(shift|daily|weekly|monthly)
                 UNIQUE(user_id, site_id, frequency)

-- Eszközről érkező adat
chain_entries    id, device_id → devices, seq int, type enum(shift_started|shift_closed|
                 round_opened|scan|incident|round_closed), payload json,
                 device_time datetime(3), uptime_ms bigint, boot_id string, gnss_time datetime(3)?,
                 ref_server_time datetime(3)?, ref_uptime_ms bigint?, ref_boot_id string?,
                 prev_hash char(64), hash char(64), received_at datetime(3),
                 verify_status enum(ok|bad_hmac|gap|fork), flags json
                 UNIQUE(device_id, seq), INDEX(device_id, received_at)
shifts           id, site_id, device_id, guard_id → users, started_at, ended_at?,
                 closed_by enum(guard|handover|auto)?, chain_entry_id
rounds           id, shift_id → shifts, route_version_id, schedule_id, scheduled_at, time_limit_min?,
                 started_at?, finished_at?, status enum(open|in_progress|completed|incomplete|missed)
scans            id, round_id? → rounds, checkpoint_id? → checkpoints,
                 method enum(nfc|qr|manual), scanned_at, lat?, lng?, accuracy_m?, is_mock bool,
                 flags json, note?, chain_entry_id
incidents        id, shift_id → shifts, category enum(vandalism|open_door|water|intruder|damaged_tag|other),
                 note?, occurred_at, lat?, lng?, nearest_checkpoint_id?, scan_id?, chain_entry_id
media            id, device_id?, owner_type, owner_id, sha256 char(64), mime, size_bytes,
                 path? (null, amíg nincs feltöltve), taken_at, uploaded_at?

-- Kimenő
reports          id, site_id, type enum(shift|daily|weekly|monthly), period_start, period_end,
                 generated_at, sent_at?, path?, recipients json
```

Az app SQLite adatbázisa ugyanezeket a táblákat tartalmazza a saját telephelyére szűrve, a következő eltérésekkel: a `users` táblában nincs `email` és `password`; a `devices` táblában csak a saját eszköz szerepel, a titkos kulcs a secure store-ban van, nem az adatbázisban; a `chain_entries` mellé egy `outbox` (küldendő REST-hívások) és egy `kv` (beállítások, pull kurzor, utolsó szerveridő) tábla kerül.

## Azonosítás

Háromféle belépés van: a supervisor fiókja e-mail-címmel és jelszóval (online), az eszköz tokenje (a telephelyi telefon), és a PIN, amellyel a telephelyi telefonon offline lehet belépni őrként vagy supervisorként.

### Supervisor fiók

- Az első supervisort egy artisan parancs hozza létre: `php artisan waypost:create-supervisor`. Regisztrációs felület nincs.
- `POST /auth/login` (email, password, device\_name) → Sanctum token `supervisor` képességgel (ability). A token nem jár le, kijelentkezéskor törlődik.
- A supervisor további supervisorokat és őröket hozhat létre, és hozzárendelheti őket a saját telephelyeihez. Csak azokat a telephelyeket látja és módosíthatja, amelyekhez a `site_user` táblában hozzá van rendelve. Ezt Laravel Policy-k érvényesítik.
- A supervisor saját telefonján az app supervisor fiókkal, eszközhozzárendelés nélkül fut. Itt nincs őr mód és nincs láncolt napló, de a betanítás és minden beállítás működik.

### Telephelyi telefon hozzárendelése

1. A supervisor a telephelyi telefonon belép a fiókjával, majd kiválasztja a „Telefon hozzárendelése ehhez a telephelyhez” műveletet.
2. Az app hívása: `POST /devices/enroll` (site\_id, name, platform, app\_version), supervisor tokennel.
3. A szerver létrehozza a `devices` rekordot, generál egy 32 bájtos véletlen titkos kulcsot, és visszaadja az eszköz ID-t, egy `device` képességű Sanctum tokent és a titkos kulcsot (base64). Ezeket a választ később soha többé nem adja ki.
4. Az app a tokent és a titkos kulcsot a secure store-ba menti, a supervisor tokenjét pedig törli erről a telefonról. Ezután azonnal teljes pull következik.
5. Ha egy telephelyhez új telefont rendelnek, a régit a szerver visszavonja (`revoked_at`). A visszavont eszköz kéréseire 401 a válasz, a még fel nem töltött adatait azonban még egyszer, egy külön végponton (`POST /sync/push-final`) feltöltheti.

### PIN-kód

- 6 számjegy. Ha a supervisor nem ad meg PIN-t az őrnek, a szerver generál egyet, és egyszer megmutatja.
- Tárolás: PBKDF2-HMAC-SHA256, 16 bájtos véletlen só, 100 000 iteráció. A hash, a só és az iterációszám a pull válasszal az eszközre kerül, így az ellenőrzés offline történik. A számítás a telefonon a react-native-quick-crypto natív implementációjával fut.
- 5 hibás próbálkozás után 5 perc zárolás, minden további hibánál a zárolás ideje duplázódik. A számláló a SQLite-ban van, és az eltelt időt a telefon bekapcsolása óta eltelt idővel (uptime) méri, nem az órával.
- Ugyanaz a PIN nem lehet két felhasználónál egy telephelyen belül, mert a PIN egyben az azonosító is. A szerver ezt a létrehozáskor ellenőrzi.
- A PIN a supervisor szerepet is hordozza: ha a beírt PIN egy hozzárendelt supervisoré, az app supervisor módba lép. A telephelyi telefonon a supervisor mód műveletei a kimenő sorba kerülnek, és a szerver az eszköz tokenjével, a `X-Acting-User` fejlécben megadott supervisor nevében fogadja el őket, de csak azon a telephelyen, amelyhez az eszköz tartozik.

## API-szerződés

REST, JSON, `/v1` előtag, Bearer token. Minden válasz tartalmazza a `server_time` mezőt (ISO 8601, UTC). Minden író kérés `Idempotency-Key` fejlécet visz (UUID); ugyanarra a kulcsra a szerver 24 órán át ugyanazt a választ adja vissza. A pontos sémák a `waypost-schema` repo `schemas/api/` könyvtárában vannak; ez a szakasz a kötelező minimum, amelyből a sémák készülnek. Az előtag a backend csomag konfigurációjától függ, alapértelmezésben `/api/waypost/v1`.

| Módszer és útvonal | Token | Mire való |
| --- | --- | --- |
| `POST /auth/login` | nincs | supervisor belépés |
| `POST /auth/logout` | supervisor | token törlése |
| `POST /devices/enroll` | supervisor | telephelyi telefon hozzárendelése |
| `GET /sync/pull?cursor=` | device vagy supervisor | konfigurációs változások a kurzor óta |
| `POST /sync/push` | device | láncbejegyzések feltöltése kötegben |
| `POST /sync/push-final` | visszavont device | utolsó feltöltés visszavonás után |
| `PUT /media/{id}` | device vagy supervisor | fotó feltöltése (multipart, sha256 mezővel) |
| `GET/POST/PATCH/DELETE /sites`, `/sites/{id}/users`, `/checkpoints`, `/routes`, `/routes/{id}/versions`, `/schedules`, `/users`, `/report-subscriptions` | supervisor, vagy device + `X-Acting-User` | beállítások |
| `GET /reports?site_id=` | supervisor | jelentésarchívum (aláírt letöltési URL-ekkel) |

### Pull

```json
// GET /api/waypost/v1/sync/pull?cursor=2026-10-27T10:00:00.000Z_01JB...
{
  "server_time": "2026-10-27T10:05:12.345Z",
  "cursor": "2026-10-27T10:05:12.345Z_01JC...",
  "has_more": false,
  "changes": {
    "sites": [{ "id": "...", "name": "Telephely A", "timezone": "Europe/Budapest" }],
    "users": [{ "id": "...", "name": "Kiss Péter", "role": "guard",
                "pin_hash": "base64", "pin_salt": "base64", "pin_iterations": 100000, "active": true }],
    "checkpoints": [], "routes": [], "route_versions": [], "route_version_checkpoints": [],
    "schedules": []
  },
  "deleted": { "users": ["..."], "checkpoints": [] }
}
```

A kurzor `updated_at` és `id` pár, átlátszatlan szövegként kezelendő. Üres kurzorral a teljes állapot jön. Egy oldal legfeljebb 500 rekord; ha `has_more` igaz, az app azonnal kéri a következőt.

### Push

```json
// POST /api/waypost/v1/sync/push
{
  "device_id": "...",
  "entries": [
    {
      "id": "...", "seq": 412, "type": "scan",
      "device_time": "2026-10-27T21:03:44.120Z", "uptime_ms": 86400123, "boot_id": "...",
      "gnss_time": "2026-10-27T21:03:43.000Z",
      "ref_server_time": "2026-10-27T19:58:02.511Z", "ref_uptime_ms": 82500000, "ref_boot_id": "...",
      "payload": { "scan_id": "...", "round_id": "...", "checkpoint_id": "...", "method": "nfc",
                   "tag_uid": "04A1B2C3D4E580", "lat_e7": 474979000, "lng_e7": 190402000, "accuracy_dm": 125,
                   "is_mock": false, "flags": [], "media_ids": [] },
      "prev_hash": "64 hex", "hash": "64 hex"
    }
  ]
}
// 200
{ "server_time": "...", "accepted": ["id", "..."], "last_seq": 412,
  "rejected": [{ "id": "...", "code": "chain_gap", "expected_seq": 411 }],
  "media_missing": ["media-id", "..."] }
```

Egy köteg legfeljebb 200 bejegyzés, `seq` szerint növekvő sorrendben. Már elfogadott bejegyzés újraküldése nem hiba: a szerver újra felveszi az `accepted` listába. A `media_missing` lista azokat a fotókat sorolja fel, amelyekre egy bejegyzés hivatkozik, de még nincsenek fent.

### Hibaformátum

```json
{ "error": { "code": "validation_failed", "message": "Ember által olvasható magyar szöveg",
             "details": { "field": ["..."] } } }
```

Kódok: `unauthenticated` (401), `device_revoked` (401), `forbidden` (403), `not_found` (404), `validation_failed` (422), `conflict` (409, pl. foglalt PIN vagy címke), `chain_gap` / `chain_fork` / `bad_hmac` (bejegyzésszinten a push válaszban), `rate_limited` (429).

## Szinkron protokoll

A szinkron két irányban fut, külön szabályokkal. A konfigurációt a szerver birtokolja, a láncbejegyzéseket az eszköz. Így nincs valódi ütközés: a lánc csak bővül, a konfigurációnál pedig a szerver dönt.

### Mikor fut

- az app indulásakor és előtérbe kerülésekor;
- minden láncbejegyzés után 2 másodperces késleltetéssel (több gyors leolvasás egy kötegbe kerül);
- amikor a hálózat elérhetővé válik (NetInfo esemény);
- műszak zárásakor;
- előtérben 5 percenként.

Egyszerre csak egy szinkron futhat (mutex). A sorrend mindig: push, média feltöltés, outbox (REST-hívások), pull.

### Push és média

- Az app a `chain_entries` táblából a még nem nyugtázott bejegyzéseket küldi `seq` szerint, 200-as kötegekben.
- Nyugtázáskor az app beállítja a `synced_at` mezőt. Nyugtázott bejegyzés 7 nap után törölhető, de a lánc utolsó eleme (a `last_hash`) mindig megmarad.
- A fotók a bejegyzések után mennek fel, egyesével, a `media_missing` lista és a helyi feltöltetlen lista alapján. A szerver ellenőrzi a sha256 lenyomatot.
- Ha a válaszban `chain_gap` vagy `chain_fork` szerepel, az app nem próbálja újra ugyanazt, hanem egy diagnosztikai eseményt küld, és a supervisor látja a jelentésben. Ilyen csak hibánál vagy manipulációnál fordulhat elő.

### Outbox (supervisor műveletek)

- Minden supervisor művelet először a helyi adatbázist frissíti, és egy outbox sort hoz létre (metódus, útvonal, törzs, idempotencia-kulcs). Az entitás UUID-jét mindig az app generálja.
- Az outbox FIFO sorrendben megy ki. Ha egy kérés 4xx hibát kap (kivéve 401 és 429), az app jelzi a supervisornak, és a következő pull felülírja a helyi állapotot.
- Újrapróbálkozás hálózati hibánál és 5xx válasz esetén: exponenciális visszatartás 5 másodperctől 10 percig, véletlen szórással (jitter).

### Pull

- A pull a kurzor szerint lapoz, és egy tranzakcióban felülírja a helyi konfigurációs rekordokat (upsert, ill. törlés a `deleted` lista alapján).
- Egy éppen futó kör nem vált útvonalverziót: a kör a megnyitáskor rögzített `route_version_id`-t használja végig.
- A menetrend változása után az app újraütemezi az ébresztéseket.
- A válasz `server_time` mezőjét az app elmenti a `kv` táblába, a hozzá tartozó uptime-mal együtt. Ebből becsüli a megbízható aktuális időt (lásd Láncolt napló).

## Láncolt napló

Minden eszköz egyetlen, 1-től folyamatosan számozott láncot vezet. Minden bejegyzés hordozza az előző lenyomatát, és az eszköz titkos kulcsával készült HMAC-ot. Ha egy bejegyzést utólag törölnek, beszúrnak, átírnak vagy átsorolnak, azt a szerver észleli. A bejegyzések sémája a `waypost-schema` repo `schemas/chain/` könyvtárában van, a tesztvektorok a `chain/test-vectors.json` fájlban; ezeket az app és a backend tesztjei is használják.

### Bejegyzés és lenyomat

```text
entry = {
  id, device_id, seq, type, payload,
  device_time,            // eszközóra, ISO 8601 UTC, ezredmásodperc
  uptime_ms, boot_id,     // monoton óra és rendszerindítás-azonosító (saját natív modul)
  gnss_time,              // csak Androidon, GPS-forrású helyadatnál; különben null
  ref_server_time, ref_uptime_ms, ref_boot_id,   // az utolsó sikeres szinkron szerverideje és uptime-ja
  prev_hash               // első bejegyzésnél 64 db '0'
}
hash = hex( HMAC-SHA256( key = device_secret, message = canonical_json(entry) ) )
```

- `canonical_json`: RFC 8785 (JCS) szerint, vagyis ábécérendbe rendezett kulcsok, szóközök nélkül, UTF-8. A hash-elt adatban nem lehet lebegőpontos szám, mert a JS és a PHP eltérően írhatja ki. Ezért a koordináta `lat_e7` / `lng_e7` (fok × 10⁷, egész szám), a pontosság `accuracy_dm` (deciméter, egész szám).
- A `null` mezők benne maradnak a JSON-ban (`"gnss_time":null`), nem hagyhatók el.
- A monoton órát egy kis saját Expo-modul (`app/modules/waypost-clock`) adja. Androidon `SystemClock.elapsedRealtime()` és `Settings.Global.BOOT_COUNT`, iOS-en `clock_gettime(CLOCK_MONOTONIC)` (alvás alatt is számol) és a `kern.boottime` alapján képzett azonosító.
- A bejegyzés és a hozzá tartozó vetületrekord (pl. `scans`) egy SQLite tranzakcióban jön létre. Az egymást követő `seq` kiosztását egy globális írási zár védi.

### Bejegyzéstípusok és payload

| type | payload mezők |
| --- | --- |
| `shift_started` | shift\_id, guard\_id, site\_id |
| `shift_closed` | shift\_id, closed\_by (guard / handover / auto) |
| `round_opened` | round\_id, shift\_id, route\_version\_id, schedule\_id, scheduled\_at, time\_limit\_min |
| `scan` | scan\_id, round\_id?, checkpoint\_id?, method, tag\_uid?, qr\_payload?, ndef\_raw?, lat\_e7?, lng\_e7?, accuracy\_dm?, is\_mock, flags\[\], note?, media\_ids\[\] |
| `incident` | incident\_id, shift\_id, category, note?, lat\_e7?, lng\_e7?, accuracy\_dm?, nearest\_checkpoint\_id?, scan\_id?, media\_ids\[\] |
| `round_closed` | round\_id, status (completed / incomplete / missed), finished\_at |

A fotó sha256 lenyomata a `media_ids` mellett a payloadba is bekerül (`media: [{id, sha256}]`), így egy utólag kicserélt fotó is kiderül.

### Szerveroldali ellenőrzés

A szerver eszközönként, `seq` sorrendben dolgozza fel a bejegyzéseket, egy zárolt tranzakcióban:

1. `seq` = `devices.last_seq + 1`, különben `gap`. A bejegyzés eltárolódik, de a vetületbe csak akkor kerül, ha a hiány pótlódik.
2. `prev_hash` = `devices.last_hash`, különben `fork`.
3. Az újraszámolt HMAC egyezik, különben `bad_hmac`.
4. Ha mindhárom rendben, `verify_status = ok`; a szerver frissíti a `last_seq` és `last_hash` értéket, és alkalmazza a bejegyzést a vetületekre (idempotensen, a payload ID-k alapján).

### Jelölések (flags)

A jelölések nem blokkolnak, csak megjelennek a jelentésben.

| Jelölés | Feltétel | Ki állítja |
| --- | --- | --- |
| `manual` | kézi rögzítés címke nélkül | app |
| `out_of_order` | kötött sorrendnél nem a várt pont | app |
| `out_of_round` | nincs nyitott kör, vagy a pont nem része a kör útvonalának | app |
| `unknown_tag` | a címke egyik ponthoz sem tartozik | app |
| `mock_location` | Androidon a helyadat hamisított forrásból jött | app |
| `time_suspect` | ha `boot_id` = `ref_boot_id`, a becsült idő (`ref_server_time + uptime_ms − ref_uptime_ms`) és a `device_time` eltérése több mint 2 perc; vagy a `gnss_time` és a `device_time` eltérése több mint 2 perc | szerver |
| `too_fast` | két egymást követő leolvasás közt kevesebb idő telt el, mint a betanításkor mért gyalogidő 40%-a (csak ha a két pont a betanított sorrendben is egymás után következik) | szerver |
| `far_from_checkpoint` | a leolvasás helye több mint max(50 m, 3 × pontosság) távolságra van a betanított helytől, és mindkét pontosság 50 m alatti | szerver |
| `late_sync` | a bejegyzés a műszak zárása után több mint 12 órával érkezett | szerver |

Az NTAG 424 DNA aláírásának ellenőrzése nem része az 1. lépcsőnek. A nyers NDEF tartalom (`ndef_raw`) azonban eltárolódik, hogy később vissza lehessen nézni.

## Állapotgépek és üzleti szabályok

Ezek a szabályok az app `src/domain` moduljában, tiszta TypeScript függvényekként élnek: bemenet az állapot, az aktuális idő és az esemény, kimenet a létrehozandó láncbejegyzések. Így UI és eszköz nélkül tesztelhetők. A kör állapotainak ábrája az alapspecifikációban van.

### Menetrend → körök (időpontok)

- A menetrendet a telephely időzónájában kell értelmezni (nyári/téli időszámítás váltását is kezelve).
- `list` módban a `start_times` minden eleme egy kör.
- `interval` módban `interval_from`-tól `interval_every_min` lépésközzel, `interval_to`-ig, mindkét véget beleértve. Például 20:00–08:00, 60 perc: 13 kör.
- Ha `interval_to` ≤ `interval_from`, az időablak átnyúlik éjfélen, és a kezdő napjához tartozik. A `weekdays` szűrés a kezdő napra vonatkozik (a pénteki 20:00–08:00 ablak a szombat reggeli köröket is tartalmazza).
- Az időkeret alapértéke új menetrendnél: `ceil(walk_duration_s × 1,5 / 300) × 5` perc a jelenlegi útvonalverzió alapján. Ha nincs mért érték, 20 perc. A supervisor felülírhatja vagy kikapcsolhatja (`null`).

### Műszak

1. PIN-belépés őrként: ha nincs nyitott műszak, `shift_started`.
2. Ha van nyitott műszak, és ugyanaz az őr lép be, a műszak folytatódik. Ha másik őr lép be, előbb `shift_closed` jön (`closed_by = handover`; a nyitott körök előtte a szokott szabály szerint zárulnak), aztán `shift_started`.
3. Zárás az őr döntésével: PIN újrabeírása, összegző képernyő, `shift_closed` (`guard`). Ha van nyitott kör, figyelmeztetés után az is zárul.
4. Automatikus zárás: a nap utolsó ütemezett körének zárása után 60 perccel `shift_closed` (`auto`).
5. Műszak nélkül nem nyílik kör. Ha ütemezett időpontban nincs belépett őr, az ébresztő szól, és belépésre kér. Ha senki nem lép be, a kör az eszközön nem keletkezik; a jelentésben a szerver a menetrendből számolja ki, hogy elmaradt.

### Kör

- **Megnyitás:** az ütemezett időpontban, ha van nyitott műszak (`round_opened`, állapot `open`). Az app egy „ütemező lépést” futtat induláskor, előtérbe kerüléskor, minden ébresztés-értesítéskor és előtérben 30 másodpercenként. Ha egy időpont kimaradt (pl. az app nem futott), később is megnyílik az eredeti `scheduled_at` értékkel; ha a határideje is lejárt, azonnal zárul is.
- **Folyamatban:** az első érvényes leolvasás után (`started_at`).
- **Határidő:** `scheduled_at + time_limit_min`. Ha nincs időkeret, a határidő ugyanazon útvonal következő körének időpontja; a nap utolsó körénél pedig `scheduled_at` + 60 perc.
- **Zárás:** ha az útvonalverzió minden pontja megvan (a kézi rögzítés is számít), azonnal `completed`, a határidőtől függetlenül. A határidőnél: ha van leolvasás, `incomplete`, ha nincs, `missed`.
- Egy útvonalnak egyszerre legfeljebb egy nyitott köre lehet. Ha új időpont érkezik, miközben az előző kör még nyitva van, az előző a fenti szabály szerint zárul.

### Leolvasás

1. **Feloldás:** NFC-nél a címke UID-ja (hex, nagybetű) alapján keresünk pontot a telephelyen; QR-nél a teljes payload alapján. A QR payload formátuma `waypost:cp:<checkpoint_id>:<16 karakteres véletlen kód>`. Ha nincs találat, a leolvasás `unknown_tag` jelöléssel rögzül, és a képernyőn hiba jelenik meg.
2. **Ismétlés:** ha a pont ebben a körben már megvan, nem keletkezik új bejegyzés; az app kiírja, hogy „Már leolvasva 21:03-kor”.
3. **Körön kívül:** ha nincs nyitott kör, vagy a pont nem része az útvonalverziónak, a leolvasás `round_id = null` értékkel és `out_of_round` jelöléssel rögzül.
4. **Kötött sorrend:** a várt pont a legkisebb `position`-ú, még le nem olvasott pont. Eltérésnél `out_of_order` jelölés, de a leolvasás számít.
5. **Kézi rögzítés:** az őr kiválasztja a pontot az útvonal listájából; a fotó és a megjegyzés kötelező. Ebből egy `scan` (`method = manual`, `manual` jelölés) és egy `incident` (`damaged_tag`, `scan_id`-val) bejegyzés lesz.
6. **Helyadat:** a leolvasás nem vár a GPS-re. Az app az utolsó ismert pozíciót használja, ha az 60 másodpercnél frissebb; különben legfeljebb 5 másodpercig kér újat, és ha addig sem jön, helyadat nélkül rögzít.

### Betanítás

- A betanítás egy piszkozat, amely csak a mentéskor válik új útvonalverzióvá. Mérés: `walk_duration_s` = utolsó leolvasás − első leolvasás; `walk_time_from_prev_s` két egymást követő leolvasás között.
- Ugyanaz a címke nem tartozhat két ponthoz egy telephelyen (409 `conflict`).
- Bejárás nélküli módosítás (átnevezés, utasítás, fotó, sorrend, pont kivétele) is új verziót hoz létre; ilyenkor a mért idők a megmaradt pontokra átöröklődnek, a sorrendváltozásnál pedig a `walk_time_from_prev_s` null lesz. Új pont vagy címkecsere csak helyszíni leolvasással lehetséges.

## Mobilapp

Az app három állapotban indulhat: nincs hozzárendelve (csak supervisor belépés), telephelyi telefon (PIN-képernyő) vagy supervisor saját telefonja (telephelylista). A navigáció expo-routerrel készül, három csoportban: `(auth)`, `(guard)`, `(supervisor)`. A kinézetet a későbbi design system adja; itt csak a tartalom és a viselkedés van rögzítve.

### Képernyők

| Útvonal | Képernyő | Tartalom és műveletek |
| --- | --- | --- |
| `(auth)/login` | Supervisor belépés | e-mail, jelszó |
| `(auth)/pin` | PIN-belépés | telephely neve, 6 jegyű PIN-billentyűzet, szinkronállapot; zárolás esetén visszaszámlálás |
| `(guard)/home` | Műszak kezdőlap | következő kör visszaszámlálással; az éjszaka körei idővonalon, állapottal; gombok: Esemény rögzítése, Műszak zárása |
| `(guard)/round/[id]` | Kör folyamatban | pontlista (leolvasva időponttal / hátralévő), hátralévő idő, nagy „Leolvasás” gomb (iOS-en ez nyitja az NFC-t), QR gomb, „Címke nem olvasható” (kézi rögzítés); a képernyő nem alszik el (expo-keep-awake) |
| `(guard)/scan-result` | Visszajelzés | siker: pont neve, utasítása, haptikus jelzés; hiba: ismeretlen címke, már leolvasva, rossz sorrend |
| `(guard)/manual/[checkpointId]` | Kézi rögzítés | kötelező fotó (csak kamera, galéria nem) és megjegyzés |
| `(guard)/incident/new` | Esemény | kategória, megjegyzés, 0–5 fotó (csak kamera) |
| `(guard)/shift/close` | Műszakzárás | összegzés: körök állapota, események száma, feltöltetlen tételek; PIN-nel megerősítve |
| `(supervisor)/sites` | Telephelyek | lista, új telephely |
| `(supervisor)/sites/[id]` | Telephely | útvonalak, menetrendek, őrök, hozzárendelt telefon, jelentésbeállítások, „Telefon hozzárendelése” |
| `(supervisor)/routes/[id]/train` | Betanítás | leolvasás → név, utasítás, fotó; a rögzített pontok listája, eltelt idő; Mentés / Elvetés |
| `(supervisor)/routes/[id]/edit` | Útvonal szerkesztése | átnevezés, utasítás, fotó, sorrend (húzással), pont kivétele, sorrend típusa; „Új pont felvétele” a betanítás képernyőre visz |
| `(supervisor)/checkpoints/[id]/qr` | QR-címke | a pont QR-kódja nagyban, megosztás/nyomtatás (expo-print) |
| `(supervisor)/schedules/[id]` | Menetrend | napok, lista vagy intervallum, időkeret a javasolt értékkel |
| `(supervisor)/users` | Őrök és supervisorok | létrehozás, telephelyhez rendelés, PIN generálása vagy cseréje, inaktiválás |
| `(supervisor)/device-setup` | Telefon beállítása | ellenőrzőlista zöld pipákkal: értesítések, pontos riasztás (Android), akkumulátor-optimalizálás kikapcsolva (Android), helymeghatározás, kamera, NFC bekapcsolva; minden tételhez a megfelelő rendszerbeállítás megnyitása |

Minden képernyő tetején ott van a szinkronállapot jelzője: online, offline, vagy „N tétel vár feltöltésre”. Megnyomva megjelenik az utolsó sikeres szinkron ideje és egy „Szinkron most” gomb.

### Ébresztés

- Az app mindig a következő 36 óra köreit ütemezi helyi értesítésként, legfeljebb 48 darabot (az iOS 64-es korlátja alatt). Minden körhöz két értesítés tartozik: az ütemezett időpontban, és ha addig nem indult el, 5 perccel később egy emlékeztető. Az emlékeztetőt az app törli, amint a kör elindul.
- Az újraütemezés induláskor, pull után, műszakkezdéskor és minden értesítés megérkezésekor fut, és mindig az egész listát cseréli.
- Android: külön értesítési csatorna (`rounds`, MAX fontosság, saját riasztáshang, rezgés), pontos riasztás engedély és kivétel az akkumulátor-optimalizálás alól. Ha valamelyik hiányzik, a PIN-képernyőn figyelmeztető sáv jelenik meg.
- iOS: `timeSensitive` megszakítási szint (Time Sensitive Notifications jogosultság), saját hang.
- Az értesítésre koppintva a kör képernyője nyílik meg, vagy ha nincs belépett őr, a PIN-képernyő.

### NFC és QR

- Android: a kör képernyőjén és a betanításkor az app előtérben figyeli a címkéket (`registerTagEvent`), gomb nélkül. Más képernyőn a leolvasott címke nem csinál semmit.
- iOS: a „Leolvasás” gomb nyit egy NFC-munkamenetet „Tartsd a telefont a címkéhez” szöveggel. Sikeres olvasás után a munkamenet bezárul.
- Mindkét platformon kiolvassuk a címke UID-ját és a nyers NDEF tartalmat (ha van). A címkékre nem írunk.
- A QR-olvasó egy teljes képernyős kameranézet; csak a `waypost:cp:` előtagú kódokat fogadja el.
- Siker: rövid rezgés (expo-haptics) és hang. Hiba: két rövid rezgés és piros visszajelzés.

## Jelentések, figyelmeztetések és adatmegőrzés

Minden jelentés a szerveren készül, queue-jobból, a vetülettáblákból és a menetrendből. Az elmaradt köröket a szerver a menetrendből számolja (várt időpontok, amelyekhez nincs kör), így az is látszik, ha a telefon egyáltalán nem működött. A menetrend kibontása a PHP-ban és a TS-ben ugyanazokkal a szabályokkal történik; ehhez a `waypost-schema` repo `schedule/test-vectors.json` fájlja közös tesztvektorokat ad (menetrend + dátum → várt időpontok, DST-váltással együtt).

A „nap” a menetrendekben a kezdő nap: a hétfő 20:00 és kedd 08:00 közötti körök a hétfőhöz tartoznak. Minden időpont a telephely időzónájában jelenik meg.

| Jelentés | Indító esemény | Időszak | Formátum |
| --- | --- | --- | --- |
| Műszak | a `shift_closed` bejegyzés feldolgozása, utána legfeljebb 30 perc várakozás a hiányzó fotókra | a műszak | HTML e-mail |
| Napi | scheduler, minden nap 10:00 (telephelyi idő) | az előző nap | HTML e-mail |
| Heti | scheduler, hétfő 10:00 | az előző hétfő–vasárnap | HTML e-mail + PDF |
| Havi | scheduler, a hónap 1. napja 10:00 | az előző naptári hónap | HTML e-mail + PDF |

### Tartalom

- **Műszakjelentés:** őr neve, kezdés, zárás és annak módja; körönként a tervezett és tényleges kezdés, az időtartam és az állapot; a pontok időponttal, igazolási móddal és jelölésekkel; a hiányzó pontok; az események fotó-bélyegképekkel (aláírt link, amely az adatmegőrzés végéig él); a lánc állapota (rendben / hibás bejegyzések száma).
- **Napi:** telephelyenként a várt, teljesített, hiányos és elmaradt körök száma, a jelölések és események listája.
- **Heti és havi:** a napi adatok összesítve, teljesítési arány (teljesített / várt körök), az elmaradt és hiányos körök listája, események kategóriánként. A PDF a fotókat beágyazott bélyegképként tartalmazza, így a törlés után is bizonyíték marad.
- Ha egy időszak adatai még nem érkeztek meg teljesen (a telefon nem szinkronizált), a jelentés ezt a tetején jelzi; egy már kiküldött műszakjelentés a később érkező adatok miatt nem megy ki újra, a napi, heti és havi összesítők viszont már a teljes adatból készülnek.

A címzettek a `report_subscriptions` alapján az adott telephely supervisorai. Minden kiküldött jelentés bekerül a `reports` táblába. Az e-mailek szövege magyar, a feladó a csomag konfigurációjából jön.

### „Nincs adat” figyelmeztetés

Egy 15 percenként futó job telephelyenként megnézi: ha az utolsó várt kör határidejétől `no_data_alert_after_min` perc eltelt, és az eszköz `last_seen_at` értéke ennél régebbi, e-mailt küld a supervisoroknak. Egy menetrendi ablakra legfeljebb egyszer.

### Adatmegőrzés

- Megőrzési idő telephelyenként: `max(31, 2 × leghosszabb előfizetett időszak napokban)`, ahol műszak = 1, napi = 1, heti = 7, havi = 31 nap. Havi jelentésnél tehát 62 nap, minden más esetben 31 nap.
- Egy naponta futó job törli az ennél régebbi láncbejegyzéseket, vetületrekordokat, médiafájlokat és tárolt PDF-eket. A `devices.last_seq` és `last_hash` megmarad, így a lánc folytonossága törlés után is ellenőrizhető.
- A konfigurációs adatok (pontok, útvonalverziók, menetrendek) nem törlődnek automatikusan.
- A telefon a nyugtázott láncbejegyzéseket és fotókat 7 nap után törli.

## Mérföldkövek

A sorrend kötelező, mert minden lépés az előzőre épül. Az M1 prototípus kockázatcsökkentés: ha az NFC vagy az ébresztés valamelyik platformon nem úgy működik, ahogy itt le van írva, a munka megáll, és a specifikációt kell módosítani.

| # | Repo | Tartalom | Elfogadási feltétel |
| --- | --- | --- | --- |
| M0 | `waypost-schema` | entitás-, API- és láncsémák a pull, push, enroll és login végpontokhoz; lánc- és menetrend-tesztvektorok; TS típusgenerálás | minden példa validál (az érvénytelenek elbuknak); a TS típusok lefordítanak; npm- és Composer-csomagként telepíthető |
| M1 | `waypost` | prototípus fejlesztői builddel: NFC UID és QR olvasás, ütemezett értesítés, `waypost-clock` modul | egy Androidon és egy iPhone-on: címke- és QR-olvasás működik; 3 órán át 15 percenkénti értesítés pontosan szól zárolt képernyőn, háttérben és bezárt appal is; az uptime alvás alatt is nő |
| M2 | `laravel-waypost` | migrációk, modellek, `waypost:install`, `waypost:create-supervisor`, login, konfigurációs CRUD Policy-kkel, enroll, pull | Pest feature teszt minden végpontra (jogosultsággal együtt); a válaszok megfelelnek a sémáknak; PHPStan 8 hibamentes |
| M3 | `waypost` | SQLite és migrációk, pull, PIN-belépés, műszak, menetrend-kibontás, kör-állapotgép, leolvasás (NFC, QR, kézi), esemény, lánc, ébresztés | Jest: a domain és a lánc tesztjei zöldek, a közös tesztvektorokkal együtt; telefonon egy 5 perces körökkel beállított, 1 órás műszak teljesen offline végigvihető |
| M4 | mindkettő | push, médiafeltöltés, láncellenőrzés, vetületek, jelölések, push-final | tesztek a gap, fork, bad\_hmac és idempotencia esetekre; 2 óra repülőgépüzemmód után minden adat hibátlanul a szerverre kerül, `verify_status = ok` |
| M5 | `waypost` (+ backend) | supervisor mód: belépés, telephelyek, telefon hozzárendelése és beállítási ellenőrzőlista, betanítás, útvonal szerkesztése, QR-nyomtatás, menetrend, őrök és PIN-ek, jelentés-előfizetések, outbox | egy telephely teljesen beállítható csak a telefonról; offline végzett módosítások a hálózat visszatérte után végrehajtódnak |
| M6 | `laravel-waypost` | műszak-, napi, heti, havi jelentés; „nincs adat” figyelmeztetés; adatmegőrzési job | Pest tesztek fixture-ökkel és `Mail::fake()`-kel; a PDF-ek kézi átnézése rendben |
| M7 | mind | próbaidőszak egy telephelyen | 7 éjszaka adatvesztés nélkül; minden jelentés megérkezik; a hibalista és a `decisions.md` frissítve |

## Tesztelés és a 2. lépcső előkészítése

A két legkönnyebben elcsúszó rész a lánc lenyomata és a menetrend kibontása, mert mindkettő két nyelven, kétszer van megírva. Ezért mindkettőt a `waypost-schema` közös tesztvektorai ellenőrzik, az app és a backend tesztjeiben is.

### Automatikus tesztek

- `waypost-schema`: minden sémához érvényes és érvénytelen példa; CI-ben validálás.
- `waypost`: Jest, legalább 90% lefedettség a `src/domain`, `src/chain` és `src/sync` modulokra; TypeScript strict; ESLint hibamentes.
- `laravel-waypost`: Pest + Orchestra Testbench; feature teszt minden végpontra, jogosultsági esetekkel; unit tesztek a láncellenőrzésre, a jelölésekre és a menetrend-kibontásra; PHPStan 8-as szint.

### Kézi eszközteszt

A `waypost/docs/device-test.md` ellenőrzőlista, amelyet minden mérföldkő végén egy Androidon és egy iPhone-on végig kell futtatni:

- [ ] ébresztés zárolt képernyőn, némított telefonon és bezárt appal;
- [ ] újraindítás műszak közben: a műszak folytatódik, az ébresztések újraütemeződnek;
- [ ] az óra kézi átállítása műszak közben: a szerver `time_suspect` jelölést ad;
- [ ] repülőgép-üzemmód egy teljes kör alatt, majd szinkron;
- [ ] ismeretlen címke, dupla leolvasás, rossz sorrend (kötött módban), kézi rögzítés;
- [ ] műszakváltás másik őr PIN-jével;
- [ ] telefoncsere: a régi visszavonása, `push-final`, az új hozzárendelése;
- [ ] alacsony akkumulátor és energiatakarékos mód (Android).

### A 2. lépcső előkészítése

A 2. lépcsőt most nem kell megépíteni, de ezek ne zárják ki:

- a `chain_entries.type` bővíthető legyen (pl. `sos`); a helykövetési pontok viszont külön táblába és külön végpontra kerülnek majd, nem a láncba;
- az API verziózott (`/v1`), új funkció új végpontként érkezik;
- az élő riasztások telephelyenként és típusonként kapcsolhatók lesznek, alapértelmezésben kikapcsolva; ehhez később egy `alert_settings` tábla jön;
- a push-értesítésekhez (Expo Push) az eszköz és a supervisor push tokenje később a `devices`, illetve egy új tábla mezőjeként kerül be;
- a websocket (Laravel Reverb) csak a diszpécserfelülethez kell, az app szinkronja továbbra is REST marad.
