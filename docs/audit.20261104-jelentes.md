# Waypost app – teljes körű kódminőségi és specifikációs audit

- **Dátum:** 2026-11-04
- **Vizsgált állapot:** `main`, `1f22227` (a `origin/main` előtt 2 commit, ezek csak a `docs/tasks.md`-t érintik)
- **Szerződés:** `../waypost-schema` a `v0.5.0` tagen (a `.waypost-schema-version` `v0.4.0`-t vár, lásd WP-APP-005)
- **Megbízás:** [audit.20261104.md](audit.20261104.md)
- **Hatókör:** a `waypost` repó teljes tartalma (`src/`, `modules/`, `__tests__/`, `__mocks__/`, konfiguráció), a `waypost-schema` sémái és vektorai. A `laravel-waypost` belső működése nem tartozik ide; egyetlen helyen néztem bele, hogy egy szerződésbeli kérdést eldöntsek (WP-APP-010).
- **Módszer:** a specifikáció és a döntésnapló teljes elolvasása; kódolvasás modulonként; statikus ellenőrzések, a teljes tesztsor és két lefedettségi riport futtatása; mappaszintű függőségi gráf; két célzott próba a scratchpadben, ideiglenes tesztekkel, a projekt fájljainak módosítása nélkül.

A jelentés a forráskódot, a konfigurációt és a specifikációt nem módosította. Az egyetlen új fájl ez a jelentés.

---

## A. Vezetői összefoglaló

### Általános értékelés

A kód jó minőségű és fegyelmezett. A rétegek szét vannak választva, és ezt a lint gépileg ellenőrzi. A domain tiszta függvényekből áll. A láncírás egyetlen zár alatt, egy tranzakcióban történik. A szinkron lépései egymástól függetlenül tesztelhetők. Nincs `any`, `@ts-ignore`, `eslint-disable` vagy TODO. A döntések nyomon követhetők: a `docs/decisions.md` majdnem minden nem triviális választást indokol.

A fő kockázat nem a kódban van, hanem az elfogadásban: **egyetlen mérföldkő telefonos elfogadása sem futott le** (M1, M3, M4, M5), a `docs/device-test.md` futástáblája üres. Az NFC, az ébresztés, a monoton óra és a natív kriptográfia valódi telefonon, különösen iPhone-on, nem bizonyított. A specifikáció szerint ha az M1 nem működik, a munka megáll.

### A projekt műszaki állapota

| Ellenőrzés | Eredmény |
|---|---|
| `npm run typecheck` | hibátlan |
| `npm run lint` (benne `import/no-cycle` és rétegszabályok) | hibátlan |
| `npm run format:check` | hibátlan |
| `npm test` | **2 piros** / 1133 zöld / 5 kihagyott (129 csomagból 2 piros, 1 kihagyott) |
| Lefedettség (`domain` / `chain` / `sync`, sorok) | 100% / 98,8% / 97,6% – a 90%-os küszöb teljesül |
| Lefedettség a teljes `src/`-re (sorok) | 95,1% |
| `drizzle-kit check` és séma-eltérés-próba | rendben, nincs migrálatlan változás |
| `npx expo-doctor` | 1 ellenőrzés hibás: 20 csomag patch- vagy minor-eltérésben |
| `npm audit` | 47 (2 high, 44 moderate, 1 low), mind fejlesztői eszközláncban |

### A specifikációs megfelelőség összesítve

A C. fejezet 145 követelményéből: **127 MEGFELELŐ, 9 RÉSZLEGES, 1 NEM MEGFELELŐ, 1 HIÁNYZIK, 7 NEM ELLENŐRIZHETŐ**. A NEM ELLENŐRIZHETŐ tételek mind telefonos viselkedések: a monoton óra, az ébresztés pontossága, a valódi NFC- és QR-olvasás, valamint az M1, M3, M4 és M5 elfogadása.

### Legfontosabb kockázatok

1. **A telefonos elfogadás hiányzik** (WP-APP-001): a teljes M3–M5 olyan platformviselkedésre épül, amely valódi telefonon nem bizonyított.
2. **Egy kérésszintű hiba a push vagy a fotók lépésében a teljes szinkront elakasztja** (WP-APP-002): a konfiguráció (új PIN, menetrend) nem érkezik meg, a supervisorműveletek nem mennek ki, és a hiba minden szinkronnál megismétlődik.
3. **Az ébresztési keret sűrű menetrendnél csak órákra elég** (WP-APP-003): 15 perces körökkel 6 óra, 5 percesekkel 2 óra, ha közben az app nem kerül előtérbe.
4. **Éles buildben a hibák láthatatlanok** (WP-APP-008): az ütemező, az ébresztés és az NFC hibái csak fejlesztői buildben kerülnek a naplóba, nincs hibagyűjtés, és nincs ErrorBoundary. Az M7 hibalistája így csak a felhasználók beszámolóira épülhet.
5. **A tesztsor dátumfüggő** (WP-APP-004): egy teszt 2026-11-03 21:00 UTC óta piros, ezért a következő CI-futás is piros lesz.

### Javasolt továbblépés

1. Az M1 eszköztesztje Androidon és iPhone-on, még bármilyen új funkció előtt (J-07, `device-test.md` M1-es tételei). Utána az M3–M5 tételei.
2. A WP-APP-004 és a WP-APP-005 javítása, hogy a tesztsor és a CI újra zöld legyen.
3. A WP-APP-002 és a WP-APP-008 javítása az M7 próbaüzem előtt, mert ezek nélkül a próbaüzem hibái nehezen vizsgálhatók.
4. A WP-APP-003 eldöntése: specifikációmódosítás vagy más ütemezési stratégia.

---

## B. Pozitív megállapítások

### Lánc és kriptográfia

- **Saját, motorfüggetlen RFC 8785 megvalósítás:** a kulcsok UTF-16 kódegységenként rendezettek, és a lebegőpontos számot, a biztonságos tartományon kívüli egészt, a magányos surrogate-et és az `undefined`-ot kivétellel elutasítja ([canonical-json.ts:30-76](../src/chain/canonical-json.ts#L30-L76)). A sztring-escape nem a `JSON.stringify`-ra épül, így a kimenet Hermesen is ugyanaz ([canonical-json.ts:10](../src/chain/canonical-json.ts#L10)).
- **Egy író, egy zár, egy tranzakció:** a `seq` kiosztása egy globális ígéretlánc alatt történik, hibánál sem akad el ([writer.ts:119-126](../src/chain/writer.ts#L119-L126)). A bejegyzés, a vetület és a fotósor egy SQLite-tranzakcióban jön létre ([writer.ts:139-187](../src/chain/writer.ts#L139-L187)). Az `appendDecidedEntries` a döntést is a zár alatt hozza meg, így két szabály nem dönthet ugyanarról a körről egyszerre ([writer.ts:211-225](../src/chain/writer.ts#L211-L225)).
- **A visszavonási jelző ellenőrzése a tranzakción belül** ([writer.ts:142-143](../src/chain/writer.ts#L142-L143)): így az utolsó feltöltés biztosan a lánc végéig ér.
- **Egész számok a hash-elt adatban:** `toE7`, `toAccuracyDm`, „fél felfelé” kerekítés `-0` nélkül ([payloads.ts:185-201](../src/chain/payloads.ts#L185-L201)).
- **A közös vektorok használata:** lánchash, láncösszefűzés, menetrend-kibontás DST-vel, időkeret-alapérték és PIN ([hmac.test.ts:9-22](../src/chain/hmac.test.ts#L9-L22), [schedule.test.ts:8-10](../src/domain/schedule.test.ts#L8-L10), [schedule.test.ts:79-84](../src/domain/schedule.test.ts#L79-L84)).
- **A fotó lenyomata a payloadban, és a sor egyezést ellenőriz** ([media.ts:251-276](../src/chain/media.ts#L251-L276)). A natív `digest` mindkét platformon kisbetűs hexet ad (Kotlin `toHexString`, Swift `%02hhx`), ez megfelel a séma `hash` mintájának.
- **A natív óra a specifikáció szerint:** Androidon `elapsedRealtime()` és `BOOT_COUNT`, iOS-en `CLOCK_MONOTONIC` és `kern.bootsessionuuid` (a `kern.boottime` csak tartalék, mert az órával mozoghat) ([WaypostClockModule.swift](../modules/waypost-clock/ios/WaypostClockModule.swift), [WaypostClockModule.kt](../modules/waypost-clock/android/src/main/java/com/tamaslabs/waypost/clock/WaypostClockModule.kt)).

### Adatbázis

- **Tudatosan nincs idegen kulcs:** egy pullból érkező törlés soha nem kaszkádolhat az eszközön keletkezett adatba ([schema.ts:1-5](../src/db/schema.ts#L1-L5)).
- **WAL és `synchronous = FULL`:** egy rögzített láncbejegyzés túléli az áramszünetet ([open.ts:21-22](../src/db/open.ts#L21-L22)).
- **Szinkron adatbázis-API a JS-szálon:** a tranzakciók nem szakadhatnak meg egy `await`-tel, a párhuzamos írás így szerkezetileg kizárt.
- **A migrációk generáltak, és a séma nem tér el tőlük:** a `drizzle-kit check` rendben van, és egy másolatban futtatott `generate` sem talált változást.

### Szinkron

- **A vezérlő nem ismeri a hálózatot:** egyszerre egy szinkron fut, a közben érkező kérések egy következő futásba olvadnak, és a vezérlő sosem dob kivételt ([controller.ts:48-122](../src/sync/controller.ts#L48-L122)).
- **A push nem kerül végtelen ciklusba:** ha egy válasz nem viszi előre az első bejegyzést, a ciklus kilép ([push.ts:234-235](../src/sync/push.ts#L234-L235)). A pull is kilép, ha a kurzor nem mozdul ([pull.ts:82](../src/sync/pull.ts#L82)).
- **A pull minden oldala egy tranzakcióban kerül az adatbázisba**, a kurzorral és a szerveridővel együtt ([pull.ts:303-331](../src/sync/pull.ts#L303-L331)).
- **A várakozó outbox-rekordok védelme:** a pull sem felülírni, sem törölni nem tudja őket ([pull.ts:107-116](../src/sync/pull.ts#L107-L116)). A futó kör pontjai törléskor inaktívak maradnak ([pull.ts:92-105](../src/sync/pull.ts#L92-L105)).
- **Az outbox a specifikáció szerint:** FIFO a `rowid` szerint, így az óra visszaállítása sem keveri össze a sorrendet ([outbox.ts:105-113](../src/sync/outbox.ts#L105-L113)); a visszatartás exponenciális, 5 mp és 10 perc között, ±20% szórással ([outbox.ts:46-50](../src/sync/outbox.ts#L46-L50)); az idempotencia-kulcs újrapróbálkozáskor is ugyanaz.

### Domain

- **Tiszta függvények:** a `schedulerStep`, a `guardLogin`, a `resolveScan` és a `manualScan` bemenete az állapot, az idő és az esemény, a kimenete a piszkozatok listája ([rounds.ts:106](../src/domain/rounds.ts#L106), [shift.ts:209](../src/domain/shift.ts#L209), [scan.ts:181](../src/domain/scan.ts#L181)). A lint a domaint csak a `time/zone`, `time/timestamp` és `chain/payloads` futásidejű elérésére engedi ([eslint.config.js](../eslint.config.js)).
- **DST-feloldás egy helyen:** a nem létező időpont a váltás pillanatára esik, a kétszer előfordulónál az első számít (Q5) ([zone.ts:242-255](../src/time/zone.ts#L242-L255)). A próba (F. fejezet) mindkét átállási éjszakán helyes köröket adott.
- **A határidő-index a négyzetes költség ellen** (J-12, [deadline.ts:155-196](../src/domain/deadline.ts#L155-L196)).

### Azonosítás és biztonság

- **PBKDF2 natívan, a JS-szálon kívül**, és közös vektorral tesztelve ([pin.ts:21-30](../src/auth/pin.ts#L21-L30)). A zárolás uptime-alapú, újraindításkor teljes hosszal újraindul (Q6) ([pin-lockout.ts:27-46](../src/domain/pin-lockout.ts#L27-L46)).
- **Secure store `AFTER_FIRST_UNLOCK` hozzáféréssel**, és előbb a titok, csak utána a token kerül bele ([credentials.ts:57](../src/device/credentials.ts#L57), [credentials.ts:92-94](../src/device/credentials.ts#L92-L94)).
- **Az indulás kitakarítja a maradékot:** a Keychainben maradt régi eszköztitkot és a telephelyi telefonon maradt supervisortokent ([startup.ts:250-260](../src/auth/startup.ts#L250-L260)).
- **Az Android-mentés az adatbázist nem viszi:** az `expo-secure-store` mentési szabályai csak a `sharedpref` tartományt veszik fel ([AndroidManifest.xml:20](../android/app/src/main/AndroidManifest.xml#L20), `node_modules/expo-secure-store/android/src/main/res/xml/*`).

### Felület és szerkezet

- **A navigáció a munkamenetből következik:** `Stack.Protected`, egyetlen hozzáférési függvény ([access.ts](../src/navigation/access.ts), [app-stack.tsx](../src/navigation/app-stack.tsx)). A munkamenetet csak a `session.ts` írhatja, ezt a lint ellenőrzi.
- **A szöveg és a szín gépileg ellenőrzött:** a lint tiltja a beégetett feliratot és színt ([eslint.config.js](../eslint.config.js)).
- **React Compiler bekapcsolva** ([app.json](../app.json) `experiments.reactCompiler`), ezért kézi `memo` nem kell.
- **Az Android NFC az egész appban reader módban fut, és csak a kör és a betanítás képernyője kapja meg a címkét** ([tag-events.ts](../src/nfc/tag-events.ts), [use-tag-reader.ts](../src/nfc/use-tag-reader.ts)), pontosan a specifikáció szerint.

### Tesztek

- **Valódi SQLite a tesztekben** (better-sqlite3, [db/testing.ts](../src/db/testing.ts)), így a tranzakciók, az indexek és a nyers SQL is fut.
- **Hamis API a szinkrontesztekhez** ([sync/testing.ts](../src/sync/testing.ts)), és egy e2e próba a futó backend ellen ([site-setup.e2e.test.ts](../__tests__/e2e/site-setup.e2e.test.ts)).
- **Kevés csak lefedettségért írt teszt:** a vizsgált tesztek a viselkedést ellenőrzik (pl. a revocation teszt a kérések sorrendjét, a kötegek méretét és a végállapotot), nem a megvalósítás részleteit.

---

## C. Specifikációs megfelelőségi mátrix

Jelölés: **M** = MEGFELELŐ, **R** = RÉSZLEGES, **NM** = NEM MEGFELELŐ, **H** = HIÁNYZIK, **NE** = NEM ELLENŐRIZHETŐ.

### C.1 Repo és technológiai stack

| Követelmény | Állapot | Érintett fájlok | Megjegyzés |
|---|---|---|---|
| Expo (legfrissebb stabil), TS strict, expo-router | M | `package.json`, `tsconfig.json` | SDK 58; `strict` és `noUncheckedIndexedAccess`. Az expo-doctor 20 patch/minor eltérést jelez (WP-APP-017). |
| react-native-nfc-manager config pluginnel, iOS entitlement | M | `app.json` | `selectIdentifiers: D2760000850101` (NTAG 424 DNA), NDEF-entitlement kikapcsolva. |
| expo-camera QR | M | `src/qr/qr-scanner.tsx` | |
| expo-sqlite + Drizzle, migrációk induláskor | M | `src/db/open.ts`, `src/db/database.ts` | |
| expo-notifications | M | `src/alarms/` | |
| expo-location (előtér) | M | `src/location/location.ts`, `app.json` | Háttér-engedély kifejezetten kikapcsolva. |
| react-native-quick-crypto, expo-secure-store | M | `src/chain/hmac.ts`, `src/auth/pin.ts`, `src/device/credentials.ts` | |
| Fotó: tömörítés 1600 px, JPEG 0,7 | M | `src/photo/photo.ts:15-16` | Csak kamera (expo-camera), galéria nincs. |
| Zustand a UI-állapothoz, SQLite az igazság | M | `src/auth/session.ts`, `src/sync/status.ts` | |
| Hálózati típusok a sémából, `__DEV__` Ajv-ellenőrzés | M | `src/api/client.ts:110-179` | Élesben nincs ellenőrzés; ez megfelel a specifikációnak, a kockázata: WP-APP-002. |
| `waypost-clock` saját modul | M | `modules/waypost-clock` | |
| A séma a közös szerződés, verziózva | R | `.waypost-schema-version`, `__tests__/schema-package.test.ts` | Helyben v0.5.0, rögzítve v0.4.0 (WP-APP-005). |

### C.2 Adatbázis

| Követelmény | Állapot | Érintett fájlok | Megjegyzés |
|---|---|---|---|
| Minden elsődleges kulcs UUIDv7 | M | `src/id/uuidv7.ts`, minden író | Az outbox sorrendje szándékosan `rowid` (döntés). |
| A `chain_entries` az egyetlen igazságforrás, a vetületek ebből | M | `src/chain/projection.ts` | |
| A táblák a szerverét követik, a megadott eltérésekkel | M | `src/db/schema.ts` | `accuracy_dm` az `accuracy_m` helyett (séma-döntés), `users` e-mail és jelszó nélkül, `devices` titok nélkül. |
| `outbox` és `kv` tábla | M | `src/db/schema.ts:270-296`, `src/db/kv.ts` | A komment a sorrendről elavult (WP-APP-013). |
| `UNIQUE(device_id, seq)` | M | `src/db/schema.ts:172` | |
| A titkos kulcs nem az adatbázisban van | M | `src/device/credentials.ts` | |
| Az eszközön keletkezett adat a szinkron előtt nem módosul és nem törlődik | M | `src/sync/cleanup.ts`, `src/sync/revocation.ts`, `src/sync/pull.ts` | Csak nyugtázott bejegyzés és feltöltött fotó törlődik, 7 nap után; a lánc utolsó eleme marad; a visszavont telefon feltöltetlen bejegyzései maradnak. A supervisorműveletek (konfiguráció) 4xx-nél és kijelentkezéskor eldobódnak; ez a specifikáció szerint helyes, mert azok nem eszközadatok. |
| Tranzakciók és félbeszakadt írás | M | `writer.ts`, `pull.ts`, `outbox.ts`, `push.ts` | Minden többlépéses írás egy szinkron tranzakcióban van. |
| Adatmegőrzés a telefonon (7 nap) | M | `src/sync/cleanup.ts:17-85` | A megbízható idő szerint, naponta legfeljebb egyszer. |

### C.3 Azonosítás

| Követelmény | Állapot | Érintett fájlok | Megjegyzés |
|---|---|---|---|
| Három indulási állapot | M | `src/auth/startup.ts`, `src/navigation/access.ts` | |
| Supervisor online belépés | M | `src/auth/supervisor.ts:44-54`, `(auth)/login.tsx` | |
| Supervisor saját telefonja: nincs őr mód, nincs lánc | M | `src/navigation/access.ts`, `src/sync/runtime.ts:56` | |
| Telefon hozzárendelése (enroll, a titok mentése, teljes pull) | M | `src/auth/supervisor.ts:103-127`, `src/auth/enrollment.ts` | Egy szűk megszakadási ablakkal (WP-APP-014). |
| A supervisortoken törlése a hozzárendelés után | M | `src/auth/supervisor.ts:116`, `src/auth/startup.ts:252` | |
| Visszavont eszköz: 401, push-final | M | `src/sync/revocation.ts`, `src/sync/runtime.ts:134-146` | |
| 6 jegyű PIN | M | `src/auth/pin.ts:14` | |
| Ha nincs PIN, a szerver generál | R | `src/domain/pin-generate.ts` | Az app generál (döntés, M5-18); a szerveroldali generálás nincs használva. |
| PBKDF2-HMAC-SHA256, 16 bájtos só, 100 000 iteráció, offline | M | `src/auth/pin.ts:15-50` | A natív futás nem ellenőrzött (NE, WP-APP-001). |
| 5 hiba után 5 perc, utána duplázódik | M | `src/domain/pin-lockout.ts` | |
| A számláló a SQLite-ban, uptime-mal mérve | M | `src/auth/pin.ts:84-89`, `kv` `pin.lockout` | |
| A PIN egyedi a telephelyen | M | `src/auth/pin.ts:56-74`, `src/supervisor/guards.ts` | Előzetes helyi ellenőrzés, és a szerver 409-ének kezelése. |
| A supervisor-PIN supervisor módot nyit, a műveletek `X-Acting-User`-rel | M | `src/guard/login.ts:202-205`, `src/auth/session.ts:201-205`, `src/sync/outbox.ts:99-101` | |
| A supervisor- és az őr mód elkülönítése | M | `src/navigation/access.ts`, `src/auth/session.ts:204` | Supervisor módon kívül az `actingUserId` kivételt dob. |

### C.4 API-szerződés

| Követelmény | Állapot | Érintett fájlok | Megjegyzés |
|---|---|---|---|
| Bearer token, `/v1` előtag | M | `src/api/client.ts:124`, `src/api/config.ts` | |
| `Idempotency-Key` minden írásnál | M | `src/api/client.ts:125` | Az outbox a saját, tartós kulcsát küldi. |
| A hibaformátum típusos hibaként | M | `src/api/client.ts:63-88`, `src/api/errors.ts` | |
| A végpontok listája | M | `src/api/endpoints.ts`, `src/api/config-calls.ts` | A `GET /reports` az appban nem kell (a jelentések e-mailben érkeznek). |
| A push kötegek legfeljebb 200, `seq` szerint | M | `src/sync/push.ts:139-166` | |
| A pull lapozása, legfeljebb 500 rekord, `has_more` | M | `src/sync/pull.ts:60-85` | |
| A `media_missing` kezelése | M | `src/sync/push.ts:233`, `src/sync/media.ts:44-57` | |
| A payload `media_ids` mezője | M (séma szerint) | `src/chain/payloads.ts:227` | A séma döntése szerint csak `media: [{id, sha256}]` van (`waypost-schema` decisions, 2026-10-27); a specifikáció szövege e tekintetben elavult. |

### C.5 Szinkron protokoll

| Követelmény | Állapot | Érintett fájlok | Megjegyzés |
|---|---|---|---|
| Indítók: indulás, előtér, láncbejegyzés után 2 mp, NetInfo, műszakzárás, előtérben 5 percenként | M | `src/sync/runtime.ts:180-213`, `src/guard/shift-close.ts:93`, `src/guard/scheduler.ts:35` | |
| Mutex | M | `src/sync/controller.ts:89-97` | |
| Sorrend: push → média → outbox → pull | M | `src/sync/controller.ts:8` | Egy lépés hibája a további lépéseket is leállítja (WP-APP-002). |
| A `synced_at` beállítása nyugtázáskor | M | `src/sync/push.ts:213-223` | |
| A nyugtázott bejegyzés 7 nap után törölhető, az utolsó marad | M | `src/sync/cleanup.ts:22-31` | |
| A fotók a bejegyzések után, egyesével | M | `src/sync/media.ts:59-84` | Csak nyugtázott bejegyzés fotója (döntés). |
| `chain_gap` / `chain_fork`: nincs újraküldés, diagnosztikai esemény | M | `src/sync/push.ts:172-211`, `243-256` | `POST /devices/diagnostics` (Q2). |
| Az outbox FIFO; az entitás UUID-ját az app generálja | M | `src/sync/outbox.ts:66-96`, `105-113` | |
| 4xx (kivéve 401, 429): jelzés a supervisornak, a pull felülírja | M | `src/sync/outbox.ts:199-221` | A függő hívások is kimennek (WP-APP-015). |
| Újrapróbálás 5 mp-től 10 percig, jitterrel | M | `src/sync/outbox.ts:46-50` | Csak az outboxra; a push és a média visszatartás nélkül a következő szinkronnal próbálkozik újra (5 percenként, illetve eseményre). |
| A pull egy tranzakcióban, upsert és törlés | M | `src/sync/pull.ts:303-331` | |
| A futó kör nem vált útvonalverziót | M | `src/domain/scan.ts:68-78`, `src/sync/pull.ts:92-105` | J-09. |
| Menetrendváltozás után újraütemezés | M | `src/alarms/round-alarms.ts:176-178` | |
| A `server_time` és az uptime mentése | M | `src/time/trusted-time.ts:50-53`, `src/sync/pull.ts:322` | |

### C.6 Láncolt napló

| Követelmény | Állapot | Érintett fájlok | Megjegyzés |
|---|---|---|---|
| 1-től folyamatos `seq` eszközönként | M | `src/chain/writer.ts:144-159` | Új hozzárendelésnél 1-től (döntés). |
| `prev_hash`, az első 64 db `0` | M | `src/chain/hmac.ts:10`, `writer.ts:153` | |
| HMAC-SHA256, kisbetűs hex | M | `src/chain/hmac.ts:13-21` | A vektorokon zöld; a natív futás csak Android-emulátoron igazolt (döntésnapló, M4-13). |
| RFC 8785 kanonikus JSON | M | `src/chain/canonical-json.ts` | |
| A `null` mezők benne maradnak | M | `src/chain/payloads.ts`, `canonical-json.ts:49`, `68` | Az `undefined` hiba. |
| Nincs lebegőpontos szám | M | `canonical-json.ts:54-55`, `payloads.ts:192-201` | |
| `waypost-clock`: monoton óra, boot ID | NE | `modules/waypost-clock` | A kód a specifikáció szerinti, de az alvás alatti növekedés és a boot ID viselkedése telefonon nem bizonyított (C2–C4 üres). |
| `gnss_time` csak Androidon, GPS-forrásnál | R | `src/location/location.ts:53-68`, `WaypostClockModule.kt` | A GPS-szolgáltató 60 mp-en belüli saját utolsó fixe áll a fixé helyett, mert a fused location nem mondja meg a forrást (dokumentált közelítés). |
| `ref_*` mezők | M | `src/time/trusted-time.ts:59-64` | |
| A bejegyzés és a vetület egy tranzakcióban; globális írási zár | M | `src/chain/writer.ts` | |
| A fotó SHA-256-ja a payloadban | M | `src/chain/media.ts`, `src/photo/photo.ts:56` | |
| A nyers NDEF eltárolása | R | `src/nfc/tag.ts:122-143` | A bájtsor a feldolgozott rekordokból újraépített, nem a címke eredeti bájtjai. A legtöbb címkénél azonos, de nem garantált (INFO). |
| `manual`, `out_of_order`, `out_of_round`, `unknown_tag`, `mock_location` jelölés | M | `src/domain/scan.ts`, `src/chain/payloads.ts:271-290` | |

### C.7 Állapotgépek és üzleti szabályok

| Követelmény | Állapot | Érintett fájlok | Megjegyzés |
|---|---|---|---|
| A szabályok tiszta TS függvények | M | `src/domain/*` | A lint ellenőrzi. |
| Menetrend a telephely időzónájában, DST-vel | M | `src/domain/schedule.ts`, `src/time/zone.ts` | Vektorokkal; a próba (F. fejezet) mindkét átállási éjszakán helyes. |
| `list` mód | M | `src/domain/schedule.ts:36-43` | |
| `interval` mód, mindkét vég benne | M | `src/domain/schedule.ts:45-52` | Azonos kezdő- és záróidőnél hibás (WP-APP-010; a szerver és a szerkesztő ezt kizárja). |
| Éjfélen átnyúló ablak a kezdő naphoz, a `weekdays` a kezdő napra | M | `src/domain/schedule.ts:49`, `59-79` | |
| Időkeret-alapérték `ceil(walk × 1,5 / 300) × 5`, különben 20 | M | `src/domain/deadline.ts:142-145` | Vektorokkal. |
| Műszakkezdés PIN-nel | M | `src/domain/shift.ts:209-221`, `src/guard/login.ts` | |
| Folytatás ugyanazzal az őrrel | M | `src/domain/shift.ts:211` | |
| Műszakváltás (a nyitott körök zárása, `handover`, új műszak) | M | `src/domain/shift.ts:215-220` | |
| Zárás az őr döntésével, PIN-nel, összegzéssel | M | `src/guard/shift-close.ts`, `(guard)/shift/close.tsx` | |
| Automatikus zárás 60 perccel az utolsó kör után | M | `src/domain/rounds.ts:77-90`, `172` | A legkésőbbi határidő + 60 perc (Q10). |
| Műszak nélkül nem nyílik kör | M | `src/domain/rounds.ts:107-108` | |
| A kör megnyitása az időpontban | M | `src/domain/rounds.ts:132-166` | |
| Az ütemező indításkor, előtérben, értesítéskor és előtérben 30 mp-enként | M | `src/guard/scheduler.ts:54-78` | Háttérben nem fut (a specifikáció sem kéri). |
| A kimaradt időpont az eredeti `scheduled_at`-tel, lejárt határidőnél azonnal zárul | M | `src/domain/rounds.ts:132-171` | |
| Folyamatban az első leolvasás után | M | `src/chain/projection.ts:66-74` | |
| Határidő: időkeret; nélküle a következő kör; az utolsónál +60 perc | M | `src/domain/deadline.ts:192-196` | |
| Zárás: minden pont megvan → `completed`; a határidőnél `incomplete` / `missed` | M | `src/domain/rounds.ts:20-24`, `src/domain/scan.ts:158-163` | |
| Útvonalanként legfeljebb egy nyitott kör | M | `src/domain/rounds.ts:122-141` | |
| Az útvonalverzió rögzítése a megnyitáskor | M | `src/domain/rounds.ts:135-148` | |
| Leolvasás: NFC UID, QR a teljes payloaddal | M | `src/domain/scan.ts:54-60` | |
| Ismétlés: nincs új bejegyzés, „Már leolvasva” | M | `src/domain/scan.ts:106-108`, `128-135` | |
| Körön kívül: `round_id = null`, `out_of_round` | M | `src/domain/scan.ts:137-141` | |
| Kötött sorrend: a legkisebb hiányzó pozíció; eltérésnél `out_of_order`, de számít | M | `src/domain/scan.ts:101-104` | |
| Kézi rögzítés: `scan` (`manual`) és `incident` (`damaged_tag`), kötelező fotó és megjegyzés | M | `src/domain/scan.ts:220-247` | |
| Helyadat: 60 mp-nél frissebb, különben legfeljebb 5 mp | R | `src/location/location.ts:70-91`, `src/guard/scan.ts:50-54` | A visszajelzés nem vár; a rögzítés (és az időbélyege) igen, és közben a következő olvasás elvész (WP-APP-011). |
| Eseményrögzítés (kategória, megjegyzés, 0–5 fotó) | M | `src/domain/scan.ts:273-288`, `(guard)/incident/new.tsx` | |
| Betanítás piszkozatként, mért idők | M | `src/domain/training.ts`, `src/supervisor/training.ts` | |
| Ugyanaz a címke nem lehet két ponton | M | `src/domain/training.ts:387` | És a szerver 409-e. |
| Bejárás nélküli módosítás új verzió; idők öröklése; sorrendváltozásnál `null` | M | `src/domain/route-edit.ts:157-200` | |

### C.8 Mobilapp: képernyők

| Követelmény | Állapot | Érintett fájlok | Megjegyzés |
|---|---|---|---|
| expo-router, `(auth)`, `(guard)`, `(supervisor)` csoportok | M | `src/app/`, `src/navigation/app-stack.tsx` | |
| `(auth)/login`, `(auth)/pin` (zárolás visszaszámlálással) | M | `src/app/(auth)/` | |
| `(guard)/home` | M | `src/app/(guard)/home.tsx` | |
| `(guard)/round/[id]`, keep-awake, „Címke nem olvasható” | M | `src/app/(guard)/round/[id].tsx:165` | |
| `(guard)/scan-result` | M | `src/app/(guard)/scan-result.tsx` | |
| `(guard)/manual/[checkpointId]` | M (más útvonalon) | `src/app/(guard)/manual/index.tsx` | Paraméterrel (döntés, M3-36). |
| `(guard)/incident/new` | M | | |
| `(guard)/shift/close` | M | | |
| `(supervisor)/sites`, `sites/[id]` | M | | |
| `routes/[id]/train`, `routes/[id]/edit` (húzással) | M | | |
| `checkpoints/[id]/qr` (expo-print) | M | `src/qr/label.ts` | |
| `schedules/[id]` | M (más útvonalon) | `routes/[id]/schedule.tsx` | Döntés. |
| `(supervisor)/users`: **őrök és supervisorok**, létrehozás, hozzárendelés, PIN, inaktiválás | **R** | `sites/[id]/guards.tsx`, `src/supervisor/guards.ts` | Őrökre kész; supervisor létrehozása és telephelyhez rendelése hiányzik (WP-APP-007). |
| `(supervisor)/device-setup` ellenőrzőlistája | M | `src/device/readiness.ts`, `device-setup.tsx` | |
| Szinkronjelző minden képernyő tetején, részletek, „Szinkron most” | R | `src/components/screen-header.tsx:41`, `sync-status-indicator.tsx` | A két teljes képernyős QR-olvasón nincs (`(guard)/qr.tsx`, `train/qr.tsx`); ez a kameranézet miatt elfogadható. |
| Egy telephely teljesen beállítható a telefonról | R | | Őrökkel igen, további supervisorral nem (WP-APP-007). Telefonon nem próbálták ki (WP-APP-001). |

### C.9 Ébresztés

| Követelmény | Állapot | Érintett fájlok | Megjegyzés |
|---|---|---|---|
| A következő 36 óra körei, legfeljebb 48 | R | `src/domain/alarms.ts:223-265` | A 48-as keret sűrű menetrendnél a 36 órát nem fedi le (WP-APP-003). |
| Körönként két értesítés, az emlékeztető törlése a kör indulásakor | M | `src/domain/alarms.ts:259-262`, `src/alarms/round-alarms.ts:120-132` | |
| Újraütemezés indításkor, pull után, műszakkezdéskor, minden értesítéskor; a teljes lista cseréje | M | `src/alarms/round-alarms.ts:171-209`, `87-96` | A különbség cseréje, hogy épp esedékes értesítés ne vesszen el. Az „értesítéskor” csak futó appnál működik. |
| Android `rounds` csatorna, MAX, saját hang, rezgés | M | `src/alarms/channel.ts` | Riasztás-hangerővel. |
| Pontos riasztás (`alarmClock`) és akkumulátor-kivétel | M | `round-alarms.ts:82`, `src/alarms/permissions.ts`, `modules/waypost-power` | |
| Figyelmeztető sáv a PIN-képernyőn | M | `src/app/(auth)/pin.tsx:144-155` | |
| iOS `timeSensitive`, saját hang | M | `round-alarms.ts:80`, `app.json` entitlement | |
| Értesítésre: a kör, vagy belépett őr nélkül a PIN-képernyő | M | `src/alarms/active-alarms.ts`, `src/navigation/use-alarm-screen.ts` | A design G4 ébresztőképernyőjén át (döntés, M3-32). |
| A tényleges pontosság zárolt képernyőn, bezárt appal, 3 órán át | **NE** | | E1–E9 üres (WP-APP-001). |

### C.10 NFC és QR

| Követelmény | Állapot | Érintett fájlok | Megjegyzés |
|---|---|---|---|
| Android: figyelés a kör és a betanítás képernyőjén, gomb nélkül; máshol semmi | M | `src/nfc/tag-events.ts`, `use-tag-reader.ts` | |
| iOS: munkamenet gombra, szöveggel, siker után bezárul | M | `src/nfc/reader.ts:57-72` | |
| UID (nagybetűs hex) és nyers NDEF; nincs írás | M | `src/nfc/tag.ts`, `src/chain/payloads.ts:216-219` | Írás sehol nincs. |
| QR teljes képernyőn, csak `waypost:cp:` | M | `src/qr/payload.ts:23-25`, `scan-filter.ts` | |
| Siker: rezgés és hang; hiba: két rezgés, piros | M | `src/feedback/`, `src/guard/scan.ts:126-130` | A rossz sorrend figyelmeztetés (Q13). |
| Valódi címkék és kamera mindkét platformon | **NE** | | N1–N6, Q1–Q5 üres. |

### C.11 Tesztelés és mérföldkövek

| Követelmény | Állapot | Érintett fájlok | Megjegyzés |
|---|---|---|---|
| Jest ≥ 90% a `domain`, `chain`, `sync` mappára | M | `package.json` `coverageThreshold` | Sorokra 100 / 98,8 / 97,6%; elágazásokra 97,2 / 98,0 / 92,5%. |
| TS strict, ESLint hibamentes | M | | |
| A közös vektorok a tesztekben | M | | |
| A tesztsor zöld | **NM** | `src/sync/revocation.test.ts:187`, `__tests__/schema-package.test.ts:10` | 2 piros (WP-APP-004, WP-APP-005). |
| `device-test.md` minden mérföldkő végén, Androidon és iPhone-on | **H** | `docs/device-test.md:15-24` | Egyik futás sincs kitöltve (WP-APP-001). |
| M1 elfogadás | NE | | Pipálva, a gazda döntésével, telefonos futás nélkül (decisions 2026-10-28). |
| M3 elfogadás (1 órás offline műszak 5 perces körökkel) | NE | | Pipálva, telefonos futás nélkül (decisions 2026-11-01). |
| M4 elfogadás (2 óra repülőgép-üzemmód) | NE | | Backend elleni Node-próba és emulátor igen, telefon nem (decisions 2026-11-02). |
| M5 elfogadás | NE | | e2e a futó backend ellen; telefonon nem. |

### C.12 A 2. lépcső előkészítése

| Követelmény | Állapot | Érintett fájlok | Megjegyzés |
|---|---|---|---|
| A `chain_entries.type` bővíthető | M | `src/db/schema.ts:159` (`text`), `projection.ts:118-122` | Egy új típus a vetületben fordítási hibát ad (`never`), ez jó. |
| A helykövetés külön táblában, nem a láncban | M | | Semmi nem zárja ki. |
| Verziózott API | M | `src/api/config.ts` | |
| Push-token később | M | | Semmi nem zárja ki; `enableRemoteNotifications: false`. |
| A websocket csak a diszpécserhez kell | M | | A szinkron REST. |

---

## D. Hibajegyzék

A súlyosság a megbízás 11. pontja szerint. A „Bizonyosság” jelentése: **bizonyított** = futtatással vagy egyértelmű kódrészlettel igazolt; **valószínű** = a kód alapján várható, de a kiváltó körülményt nem idéztem elő; **vizsgálandó** = további mérés vagy eszköz kell hozzá.

### HIGH

**WP-APP-001 – Egyik mérföldkő telefonos elfogadása sem történt meg**

- Súlyosság: HIGH
- Kategória: Specifikációs megfelelőség / elfogadás
- Érintett fájl: [docs/device-test.md](device-test.md), [docs/tasks.md](tasks.md)
- Sorszám: device-test.md 15–24 (a futástábla), tasks.md 108 (M1-08), decisions.md 133–144, 588–593, 643–649
- Probléma leírása: Az M1-08, M3-40, M4-13 és M5-21 ki van pipálva, de a `device-test.md` futástáblájának mind a nyolc sora üres. A döntésnapló szerint ez a gazda tudatos döntése volt.
- Miért probléma? A specifikáció szerint az M1 kockázatcsökkentés: „ha az NFC vagy az ébresztés valamelyik platformon nem úgy működik… a munka megáll”. Az M3–M5 teljes egésze erre épül. Jesttel nem ellenőrizhető: a natív PBKDF2 és HMAC (a Jestben a `node:crypto` fut), az uptime alvás alatt, a boot ID, az iOS ISO-DEP olvasás (NTAG 424 DNA), az ébresztés zárolt képernyőn és bezárt appal, a Hermes `Intl` DST-adatai, az ütemező költsége gyenge telefonon.
- Milyen következménye lehet? Egy platformhiba csak a próbaüzemben (M7) derül ki, amikor már egy telephely működése függ tőle.
- Kapcsolódó specifikációs követelmény: Mérföldkövek (M1, M3, M4, M5); Tesztelés / Kézi eszközteszt.
- Javasolt megoldás: A `device-test.md` M1-es tételei Androidon és iPhone-on (J-07), utána az M3–M5 tételei. Ha valamelyik `❌`, a specifikáció módosítása.
- Javítási prioritás: 1
- Bizonyosság: bizonyított.

**WP-APP-002 – Egy lépés tartós hibája elakasztja a teljes szinkront, a konfiguráció sem érkezik**

- Súlyosság: HIGH
- Kategória: Szinkronizáció / hibakezelés
- Érintett fájl: [src/sync/controller.ts](../src/sync/controller.ts), [src/sync/push.ts](../src/sync/push.ts), [src/sync/media.ts](../src/sync/media.ts), [src/chain/writer.ts](../src/chain/writer.ts), [src/api/client.ts](../src/api/client.ts)
- Sorszám: controller.ts:68, push.ts:231, media.ts:80, writer.ts:174-177, client.ts:110
- Probléma leírása: A vezérlő a lépéseket sorban futtatja, és az első kivételnél megáll (`for (step of SYNC_STEPS) await steps[step](ctx);`). A push minden nem 2xx választ továbbdob, tehát egy kérésszintű 400/403/413/422-t is. A fotók lépése egy fotó 5xx-ére megáll. Az outbox 401-nél és 5xx-nél dob. Utána sem az outbox, sem a pull nem fut. A hiba minden szinkronnál megismétlődik, és nincs visszatartás.
- Miért probléma? Éles buildben a láncbejegyzés nincs sémán ellenőrizve (a `schemaErrors` csak `__DEV__`-ben fut, writer.ts:174). Ha egy bejegyzés csak élesben sérti a sémát, a szerver a teljes köteget 422-vel utasíthatja el, és ugyanaz a köteg minden szinkronnál újra elmegy. Ugyanez történik, ha egy fotó feltöltése a szerveren tartósan 500-at ad. A pull és az outbox a push-tól és a fotóktól független, mégis velük együtt áll le.
- Milyen következménye lehet? A lánc nem kerül fel a szerverre. A telephelyi telefon nem kapja meg az új PIN-eket, menetrendeket és pontokat, a supervisor módosításai nem mennek ki. A jelzőn csak „Szinkronhiba” látszik.
- Kapcsolódó specifikációs követelmény: Szinkron protokoll (Mikor fut, Push és média, Outbox, Pull).
- Javasolt megoldás: (1) A push és a fotók hibája ne állítsa le a pullt: a pull a konfigurációt hozza, nem függ a feltöltéstől. Az outbox maradhat a push után. (2) A kérésszintű 4xx a pushnál legyen külön ág: diagnosztika, és az érintett köteg kezelése a `chain_gap` mintájára. (3) Mérlegelendő a láncbejegyzések sémaellenőrzése éles buildben is: ez olcsó, és egy hibás bejegyzés már íráskor kiderülne.
- Javítási prioritás: 3
- Bizonyosság: a mechanizmus bizonyított (kód). Hogy a szerver ad-e kérésszintű 4xx-et a pushra, vizsgálandó.

### MEDIUM

**WP-APP-003 – A 48-as ébresztési keret sűrű menetrendnél csak néhány órát fed le**

- Súlyosság: MEDIUM
- Kategória: Értesítések / specifikációs ellentmondás
- Érintett fájl: [src/domain/alarms.ts](../src/domain/alarms.ts), [src/alarms/round-alarms.ts](../src/alarms/round-alarms.ts)
- Sorszám: alarms.ts:223-226, 253-264; round-alarms.ts:186-188
- Probléma leírása: Minden körhöz két értesítés tartozik (kör és emlékeztető), a lista az első 48-nál megáll. Az újraütemezés csak futó appnál történik (előtérbe kerülés, értesítés megérkezése, láncbejegyzés, pull). Bezárt vagy háttérben lévő appnál nincs JS, ami újraütemezne.
- Miért probléma? 15 perces köröknél a 48 értesítés 24 kört, azaz 6 órát fed le; 5 percesnél 2 órát; óránkéntinél kb. 24 órát. A specifikáció 36 órát kér 48-as felső korláttal, ez sűrű menetrendnél ellentmondás. Az emlékeztetők a keret felét a távoli körökre is elhasználják.
- Milyen következménye lehet? Ha az őr egy hosszú szakaszon nem nyitja meg az appot – épp az az eset, amikor az ébresztés a legfontosabb –, a keret kifogy, és az ébresztők elhallgatnak.
- Kapcsolódó specifikációs követelmény: Mobilapp / Ébresztés.
- Javasolt megoldás: Döntés kell (`decisions.md`): pl. emlékeztető csak a következő néhány körhöz, a többi körhöz csak a fő értesítés; vagy a horizont igazítása a kerethez. A specifikáció 36 órás mondatát hozzá kell igazítani.
- Javítási prioritás: 4
- Bizonyosság: valószínű (a számítás a kódból következik; a próba szerint óránkénti menetrendnél a 48-as keret 36 órán belül betelik, F. fejezet).

**WP-APP-004 – Dátumfüggő teszt: a revocation teszt 2026-11-03 21:00 UTC óta piros**

- Súlyosság: MEDIUM
- Kategória: Tesztelés
- Érintett fájl: [src/sync/revocation.test.ts](../src/sync/revocation.test.ts), [src/sync/cleanup.ts](../src/sync/cleanup.ts), [src/sync/runtime.ts](../src/sync/runtime.ts)
- Sorszám: revocation.test.ts:187; cleanup.ts:78-84; runtime.ts:115
- Probléma leírása: A teszt bejegyzései `synced_at = 2026-10-27T21:00Z`-vel kerülnek nyugtázásra. A sikeres szinkron utáni takarítás (`cleanUpIfDue`) a valódi órát olvassa, mert a tesztben nincs időreferencia. 2026-11-03 21:00 UTC óta a bejegyzések 7 napnál régebbiek, ezért a 201-ből 200 törlődik, és az `expect(...).toHaveLength(201)` elbukik.
- Miért probléma? A CI utolsó zöld futása (M5-21) ezelőtt volt; a következő push után a CI piros lesz, és a valódi regressziók elvesznek a zajban. A termékkód viselkedése helyes: nyugtázott bejegyzés 7 nap után törölhető.
- Milyen következménye lehet? Hamis riasztás; ugyanilyen időzített bomba más tesztben is lehet.
- Kapcsolódó specifikációs követelmény: Tesztelés (Jest zöld).
- Javasolt megoldás: A teszt rögzített órát adjon a takarításnak (pl. `jest.useFakeTimers({ now })` vagy a `readClock` beinjektálása a runtime-nak). Egy keresés a többi, `Date.now`-tól függő tesztre.
- Javítási prioritás: 2
- Bizonyosság: bizonyított (futtatva: `Expected length: 201, Received length: 1`).

**WP-APP-005 – A helyi sémaverzió eltér a rögzítettől**

- Súlyosság: MEDIUM
- Kategória: Szerződés / függőségkezelés
- Érintett fájl: [.waypost-schema-version](../.waypost-schema-version), [__tests__/schema-package.test.ts](../__tests__/schema-package.test.ts)
- Sorszám: schema-package.test.ts:10
- Probléma leírása: A `../waypost-schema` a `v0.5.0` tagen áll (új: jelentésarchívum), az app `v0.4.0`-t rögzít. A teszt piros. A CI a rögzített tagen fut, ezért ott zöld.
- Miért probléma? Helyben a tesztek más szerződés ellen futnak, mint a CI-ben. A `file:` függőség maga nem rögzít verziót, ezt a próba pótolja, és most jelez.
- Milyen következménye lehet? Egy törő sémaváltozás helyben észrevétlen maradhat, vagy fordítva.
- Kapcsolódó specifikációs követelmény: Repo és technológiai stack („előbb ott kell módosítani, új verziószámmal”).
- Javasolt megoldás: Vagy a `../waypost-schema` visszaállítása a `v0.4.0` tagre a fejlesztéshez, vagy az app átállítása `v0.5.0`-ra (a `.waypost-schema-version` frissítése, ha az app a 0.5.0-val is zöld: a próba szerint az, a 2 piros tesztből egyik sem a sémától függ).
- Javítási prioritás: 2
- Bizonyosság: bizonyított.

**WP-APP-006 – Újra kialakult a mappaszintű függőségi kör**

- Súlyosság: MEDIUM
- Kategória: Architektúra
- Érintett fájl: [src/chain/writer.ts](../src/chain/writer.ts), [src/device/credentials.ts](../src/device/credentials.ts), [src/device/readiness.ts](../src/device/readiness.ts), [src/alarms/round-alarms.ts](../src/alarms/round-alarms.ts), [src/auth/supervisor.ts](../src/auth/supervisor.ts), [src/sync/runtime.ts](../src/sync/runtime.ts)
- Sorszám: writer.ts:8; readiness.ts:7-16; round-alarms.ts:16-24; supervisor.ts:13-17; runtime.ts:12; outbox.ts:17
- Probléma leírása: Futásidejű importokból számolva egy erősen összefüggő komponens van: {`alarms`, `auth`, `chain`, `device`, `domain`, `guard`, `nfc`, `sync`}. A fő élek:
  - `chain → device` (a titok: `credentials.ts`);
  - `device → alarms` / `nfc` / `location` / `photo` (a „Telefon beállítása” ellenőrzőlistája: `readiness.ts`);
  - `alarms → chain`, `guard`, `sync`, `auth`;
  - `auth ↔ sync` (`supervisor.ts` a `sync`-et, a `sync` a `session`-t hívja).

  Fájlszinten nincs kör (a lint `import/no-cycle` szabálya zöld).
- Miért probléma? A J-16 ezt a kört megszüntette; az M5-10 a `readiness.ts`-t a `credentials.ts` mellé tette a `device/` mappába, és ezzel a kör visszajött. A `device` egyszerre alacsony (titok) és magas szintű (engedélyek, ellenőrzőlista) réteg. Az `auth/supervisor.ts` szinkron-orkesztrációt végez.
- Milyen következménye lehet? A rétegek határai elmosódnak; egy új él könnyen fájlszintű kört okoz.
- Kapcsolódó specifikációs követelmény: Repo és technológiai stack (mappák); CLAUDE.md rétegszabályok.
- Javasolt megoldás: A `readiness.ts` egy magasabb rétegbe (pl. `src/setup/`) vagy a `hooks/`-ba; a `device/` csak a hitelesítő adatokat tartsa. A kijelentkezés és a hozzárendelés orkesztrációja `auth/`-ból egy saját helyre. Egy lint-szabály a `device → alarms|nfc|location|photo` élre.
- Javítási prioritás: 6
- Bizonyosság: bizonyított (gráf a forrásból).

**WP-APP-007 – Supervisorok létrehozása és telephelyhez rendelése hiányzik**

- Súlyosság: MEDIUM
- Kategória: Funkcionális hiány
- Érintett fájl: [src/supervisor/guards.ts](../src/supervisor/guards.ts), [src/app/(supervisor)/sites/[id]/guards.tsx](../src/app/(supervisor)/sites/[id]/guards.tsx)
- Sorszám: guards.ts:87, 138, 214-218
- Probléma leírása: A képernyő és a modul csak őrt hoz létre és rendel hozzá (`role: 'guard'`). Supervisor felvételére, telephelyhez rendelésére vagy felfüggesztésére nincs felület. A supervisor csak a saját PIN-jét módosíthatja.
- Miért probléma? A specifikáció `(supervisor)/users` sora („Őrök és supervisorok: létrehozás, telephelyhez rendelés, PIN generálása vagy cseréje, inaktiválás”) és az *Azonosítás* („A supervisor további supervisorokat és őröket hozhat létre”) ezt kéri. A döntésnapló (M5-18) a hiányt nem rögzíti, csak az őr eltávolítását és átnevezését.
- Milyen következménye lehet? Egy második supervisor csak a webes felületen vagy artisan paranccsal vehető fel, és nem kap PIN-t a telephelyi telefonra az appból. Az M5 „teljesen beállítható a telefonról” feltétele csak egy supervisorral teljesül.
- Kapcsolódó specifikációs követelmény: Mobilapp / Képernyők (`(supervisor)/users`); Azonosítás / Supervisor fiók.
- Javasolt megoldás: Döntés a `decisions.md`-be: vagy a funkció pótlása (a `createUser` hívás `role: 'supervisor'`-ral, e-mail és jelszó a szerver sémája szerint), vagy a specifikáció szűkítése.
- Javítási prioritás: 7
- Bizonyosság: bizonyított.

**WP-APP-008 – Éles buildben a háttérhibák láthatatlanok; nincs ErrorBoundary és hibagyűjtés**

- Súlyosság: MEDIUM
- Kategória: Hibakezelés / üzemeltethetőség
- Érintett fájl: [src/guard/scheduler.ts](../src/guard/scheduler.ts), [src/alarms/round-alarms.ts](../src/alarms/round-alarms.ts), [src/nfc/tag-events.ts](../src/nfc/tag-events.ts), [src/hooks/use-scan-recorder.ts](../src/hooks/use-scan-recorder.ts), [src/app/_layout.tsx](../src/app/_layout.tsx)
- Sorszám: scheduler.ts:42-46; round-alarms.ts:154-158, 190-193; tag-events.ts:113-115; use-scan-recorder.ts:55-57
- Probléma leírása: Az ütemező lépésének, az újraütemezésnek, a csatorna létrehozásának és az NFC-figyelés indításának hibája csak `if (__DEV__) console.warn`-t kap. Éles buildben semmi nem marad róla: nincs helyi hibanapló, nincs hibagyűjtő szolgáltatás, és egyik route sem exportál `ErrorBoundary`-t.
- Miért probléma? Az ütemező egyetlen lépésben dönt minden útvonalról, ezért egy kivétel az összes kör nyitását és zárását, valamint az automatikus műszakzárást is megakasztja (lásd a WP-APP-010 próbáját). A felületen ebből semmi nem látszik.
- Milyen következménye lehet? Az M7 próbaüzemben a „körök nem nyílnak” vagy a „nem szól az ébresztő” hibák oka nem deríthető ki.
- Kapcsolódó specifikációs követelmény: M7 („a hibalista … frissítve”).
- Javasolt megoldás: Egy kis helyi hibanapló (pl. a `kv` táblában vagy egy körkörös táblában, a legutóbbi N hiba), amely a „Fejlesztői eszközök” vagy a szinkron részletei között megnézhető, és később diagnosztikaként felküldhető; root `ErrorBoundary`. Hibagyűjtő szolgáltatás bevezetése csak döntéssel.
- Javítási prioritás: 3
- Bizonyosság: bizonyított (kód).

**WP-APP-009 – A képernyők között duplikált UI-elemek, nagy képernyőfájlok**

- Súlyosság: MEDIUM
- Kategória: Karbantarthatóság / DRY
- Érintett fájl: [guards.tsx](../src/app/(supervisor)/sites/[id]/guards.tsx), [schedule.tsx](../src/app/(supervisor)/routes/[id]/schedule.tsx), [train/index.tsx](../src/app/(supervisor)/routes/[id]/train/index.tsx), [edit.tsx](../src/app/(supervisor)/routes/[id]/edit.tsx), [device-setup.tsx](../src/app/(supervisor)/device-setup.tsx), [reports.tsx](../src/app/(supervisor)/sites/[id]/reports.tsx)
- Sorszám: guards.tsx:479 és schedule.tsx:465 (`SheetFrame`); `SectionTitle` négy fájlban; `SummaryRow` háromban
- Probléma leírása: Az alsó lap (`SheetFrame`) két, majdnem azonos példányban él; a `SectionTitle` négyben, a `SummaryRow` háromban. A legnagyobb képernyők 468–590 sorosak (`schedule.tsx` 590, `guards.tsx` 588, `train/index.tsx` 520, `edit.tsx` 468).
- Miért probléma? A design változása több helyen javítandó; a képernyők állapot- és nézetlogikája egy fájlban keveredik. Az üzleti szabályok jól ki vannak emelve (`domain/`, `supervisor/*-view.ts`), a duplikáció csak a nézetet érinti.
- Milyen következménye lehet? Eltérő viselkedésű lapok (pl. a biztonságos terület kezelése), lassabb módosítás.
- Kapcsolódó specifikációs követelmény: DESIGN_HANDOFF 5 (közös komponensek); Clean Code.
- Javasolt megoldás: `components/sheet.tsx` és `components/section-title.tsx`; a nagy képernyőkből a lapok külön fájlba (a `src/app` alá nem, mert ott csak route lehet).
- Javítási prioritás: 9
- Bizonyosság: bizonyított.

### LOW

**WP-APP-010 – Azonos kezdő- és záróidejű intervallumnál két kör nyílik ugyanarra az időpontra, és az ütemező elakad**

- Súlyosság: LOW
- Kategória: Domain / robusztusság
- Érintett fájl: [src/domain/schedule.ts](../src/domain/schedule.ts), [src/domain/rounds.ts](../src/domain/rounds.ts)
- Sorszám: schedule.ts:49, 103; rounds.ts:131-166, 174
- Probléma leírása: `interval_from = interval_to` esetén az ablak 24 óra, mindkét véggel együtt, így a következő nap kezdő időpontja két napba is bekerül (két slot ugyanazzal a `roundKey`-jel). Az ütemező a `known` halmazt a lépés közben nem bővíti, ezért mindkettőt megnyitja. A második nyitás az elsőt ugyanabban a pillanatban zárja; a rendezés (zárás a nyitás előtt) miatt a `round_closed` megelőzi a saját `round_opened`-jét, a vetület „Unknown round” hibát dob, a tranzakció visszagördül, és az ütemező minden lépése elbukik.
- Miért probléma? A séma ezt az értéket megengedi. A szerver elutasítja (`laravel-waypost` `ScheduleController.php:122`), és az app szerkesztője is (`schedule-edit.ts:238`, `same_from_to`), ezért a gyakorlati kockázat alacsony. A hiba viszont mutatja, hogy egyetlen hibás menetrend az összes útvonal ütemezését megállítja (WP-APP-008).
- Milyen következménye lehet? Ha egy ilyen menetrend mégis a telefonra kerül, egyetlen kör sem nyílik, és a műszak nem zárul automatikusan.
- Kapcsolódó specifikációs követelmény: Menetrend → körök; Kör.
- Javasolt megoldás: A séma zárja ki (`waypost-schema`, új verzió), vagy a `windowMinutes` hagyja el a záró időpontot, ha az egybeesik a kezdővel. Az ütemező a megnyitott slot kulcsát vegye fel a `known` halmazba.
- Javítási prioritás: 10
- Bizonyosság: bizonyított (próba: két `round_opened` ugyanarra a `scheduled_at`-re, a `round_closed` előttük).

**WP-APP-011 – A leolvasás a helyadatra vár: késik az időbélyeg, és közben a következő olvasás elvész**

- Súlyosság: LOW
- Kategória: Domain / UX
- Érintett fájl: [src/guard/scan.ts](../src/guard/scan.ts), [src/hooks/use-scan-recorder.ts](../src/hooks/use-scan-recorder.ts)
- Sorszám: scan.ts:50-54; use-scan-recorder.ts:44, 49-53
- Probléma leírása: A visszajelzés azonnali (J-11), de a bejegyzés csak a helyadat után íródik (legfeljebb 5 mp). A `scanned_at` és a `device_time` ezért a rögzítés ideje, nem az érintésé. Ha közben lejár a határidő, a kör zárul, és a leolvasás körön kívüli lesz (a kód ezt észreveszi és újra jelez). Amíg egy rögzítés fut, a következő olvasást a `busy` jelző szó nélkül eldobja.
- Miért probléma? Beltérben, friss fix nélkül ez lehet az általános eset. Két közeli pontnál az őr a második címkét hiába érinti. A specifikáció: „a leolvasás nem vár a GPS-re”.
- Milyen következménye lehet? Néhány másodperces időeltolódás; határidő közelében körön kívüli leolvasás; elveszett második érintés.
- Kapcsolódó specifikációs követelmény: Állapotgépek / Leolvasás 6.
- Javasolt megoldás: Az óra kiolvasása az érintés pillanatában (a `readClock` értéke az olvasáskor, nem a rögzítéskor), és sorba állítás az eldobás helyett. Ha az időbélyeg és a lánc időrendje ütközne, döntés a `decisions.md`-be.
- Javítási prioritás: 8
- Bizonyosság: valószínű (kód; eszközön mérendő).

**WP-APP-012 – Nincs DST-teszt az ütemező, a határidő, az automatikus zárás és az ébresztés szintjén**

- Súlyosság: LOW
- Kategória: Tesztelés
- Érintett fájl: `src/domain/rounds.test.ts`, `src/domain/alarms.test.ts`, `src/domain/shift.test.ts`
- Sorszám: –
- Probléma leírása: A DST-t csak a menetrend-kibontás közös vektorai fedik. Az ütemező, a határidő (a következő kör időpontja), az automatikus zárás és az ébresztési terv átállási éjszakán nincs tesztelve.
- Miért probléma? A specifikáció a DST-t kiemeli. A próba (F. fejezet) szerint a viselkedés most helyes, de ezt semmi nem rögzíti.
- Milyen következménye lehet? Egy későbbi optimalizálás (J-12 második fele) észrevétlenül elronthatja.
- Kapcsolódó specifikációs követelmény: Menetrend → körök; Tesztelés.
- Javasolt megoldás: Két teszt a próba mintájára (2026-03-28/29 és 2026-10-24/25): a megnyitott körök száma és ideje, az automatikus zárás ideje, az ébresztések ideje.
- Javítási prioritás: 11
- Bizonyosság: bizonyított (hiány).

**WP-APP-013 – Elavult komment: az outbox sorrendje**

- Súlyosság: LOW
- Kategória: Dokumentáció
- Érintett fájl: [src/db/schema.ts](../src/db/schema.ts)
- Sorszám: 269
- Probléma leírása: A komment szerint az outbox „id (UUIDv7) order”-ben megy, a kód viszont `rowid` szerint ([outbox.ts:105-113](../src/sync/outbox.ts#L105-L113)), és a döntés is ezt rögzíti.
- Miért probléma? Félrevezető a következő fejlesztőnek.
- Milyen következménye lehet? Egy „javítás” visszaállíthatja az óraérzékeny sorrendet.
- Kapcsolódó specifikációs követelmény: Szinkron protokoll / Outbox (FIFO).
- Javasolt megoldás: A komment javítása.
- Javítási prioritás: 12
- Bizonyosság: bizonyított.

**WP-APP-014 – A hozzárendelés megszakadása elveszítheti az egyszer kiadott titkot**

- Súlyosság: LOW
- Kategória: Adatkezelés
- Érintett fájl: [src/auth/supervisor.ts](../src/auth/supervisor.ts), [src/auth/enrollment.ts](../src/auth/enrollment.ts), [src/auth/startup.ts](../src/auth/startup.ts)
- Sorszám: supervisor.ts:113-119; enrollment.ts:160-170; startup.ts:250-259
- Probléma leírása: A `POST /devices/enroll` után a sorrend: a supervisortoken törlése, a futó szinkron megvárása, a fiók adatainak törlése, majd a titok és a token mentése, végül az eszközsor. Ha az app ezek között áll le, a következő indulás vagy nem talál semmit, vagy titkot talál `device.id` nélkül, és azt törli. A szerver a titkot többször nem adja ki, és a telephely előző telefonját már visszavonta.
- Miért probléma? Néhány száz ezredmásodperces ablak, de a következménye kellemetlen.
- Milyen következménye lehet? A telephely telefon nélkül marad, amíg a supervisor újra be nem jelentkezik és újra hozzá nem rendeli (ez újabb eszközt hoz létre).
- Kapcsolódó specifikációs követelmény: Azonosítás / Telephelyi telefon hozzárendelése.
- Javasolt megoldás: A válasz mentése (secure store és `device.id`) közvetlenül az enroll után, a takarítás előtt; a takarítás pótolható induláskor.
- Javítási prioritás: 13
- Bizonyosság: valószínű.

**WP-APP-015 – A 4xx-szel elutasított outbox-hívás függő hívásai is kimennek**

- Súlyosság: LOW
- Kategória: Szinkronizáció / UX
- Érintett fájl: [src/sync/outbox.ts](../src/sync/outbox.ts)
- Sorszám: 281-284
- Probléma leírása: Ha pl. egy útvonal létrehozása 422-t kap, az utána sorba állított verzió és menetrend is kimegy, és várhatóan szintén elutasítódik. A supervisor több elutasítást lát egy hibáért.
- Miért probléma? Zajos visszajelzés. Adatvesztés nincs: a teljes pull helyreállítja a szerver állapotát.
- Milyen következménye lehet? A supervisor nem látja, melyik hiba az eredeti.
- Kapcsolódó specifikációs követelmény: Szinkron protokoll / Outbox.
- Javasolt megoldás: A `record_ids` alapján az elutasított rekordtól függő későbbi hívások eldobása egy összevont jelzéssel.
- Javítási prioritás: 14
- Bizonyosság: valószínű.

**WP-APP-016 – Supervisortoken 401 a saját telefonon: nincs újra-bejelentkezés, csak az outbox elvetése**

- Súlyosság: LOW
- Kategória: Szinkronizáció / UX
- Érintett fájl: [src/sync/outbox.ts](../src/sync/outbox.ts), [src/auth/supervisor.ts](../src/auth/supervisor.ts)
- Sorszám: outbox.ts:266; supervisor.ts:56-59, 66-82
- Probléma leírása: Ha a supervisortokent a szerveren törlik, minden szinkron 401-gyel áll le (az outbox vár, a pull sem fut). Kiút csak a kijelentkezés, amely a még el nem küldött műveleteket eldobja (a képernyő előtte figyelmeztet).
- Miért probléma? Egy offline végzett beállítás elveszhet, ha közben a token megszűnt.
- Milyen következménye lehet? Ismételt adatbevitel.
- Kapcsolódó specifikációs követelmény: Szinkron protokoll / Outbox; M5 („offline végzett módosítások … végrehajtódnak”).
- Javasolt megoldás: 401-nél újra-bejelentkezés a fiók adatainak és az outboxnak a megtartásával (azonos fióknál).
- Javítási prioritás: 15
- Bizonyosság: valószínű.

**WP-APP-017 – Függőségek: SDK-eltérés, nem használt csomag, sablonmaradványok**

- Súlyosság: LOW
- Kategória: Függőségkezelés
- Érintett fájl: [package.json](../package.json), [app.json](../app.json)
- Sorszám: –
- Probléma leírása:
  - Az `expo-doctor` szerint 20 csomag patch- vagy minor-eltérésben van (pl. `react-native` 0.88.0 a várt 0.88.1 helyett, `react-native-safe-area-context` 5.10.1 a ~5.11.1 helyett).
  - Az `expo-glass-effect` sehol nincs használva.
  - Az `app.json` `extra.router.asyncRoutes.web: true`, pedig web nincs.
  - Az ikonok, a splash és a hangok helyőrzők (CLAUDE.md).
- Miért probléma? Apró eltérések; az M7 kiadás előtt a helyőrzők cserélendők.
- Milyen következménye lehet? Ismert, a patch-ben javított hibák; felesleges natív modul a buildben.
- Kapcsolódó specifikációs követelmény: Expo (legfrissebb stabil SDK).
- Javasolt megoldás: `npx expo install --check`; az `expo-glass-effect` eltávolítása; a sablonbeállítás törlése.
- Javítási prioritás: 16
- Bizonyosság: bizonyított.

### INFO

**WP-APP-018 – Az `npm audit` találatai mind fejlesztői eszközláncban vannak**

- Súlyosság: INFO
- Kategória: Biztonság / függőségek
- Érintett fájl: package-lock.json
- Sorszám: –
- Probléma leírása: 47 találat (2 high: `zod` az `eslint-plugin-react-hooks`-on és az `@expo/cli`-n át, és maga az `@expo/cli`; 44 moderate: `jest`, `eslint`, `glob`, `minimatch`, `esbuild` a `drizzle-kit` alatt; 1 low: `deepmerge`). Futásidejű appcsomag nincs érintve.
- Miért probléma? Nem kerül a telefonra; a fejlesztői gépen és a CI-ben számít.
- Milyen következménye lehet? Elméleti kockázat a fejlesztői környezetben (pl. az `esbuild` dev szerver).
- Kapcsolódó specifikációs követelmény: –
- Javasolt megoldás: Az SDK-frissítéssel együtt kezelni; az `npm audit --omit=dev` legyen a CI része.
- Javítási prioritás: –
- Bizonyosság: bizonyított.

**WP-APP-019 – A PIN-ellenőrzők és az outbox nyílt PIN-jei a telefon adatbázisában**

- Súlyosság: INFO
- Kategória: Biztonság
- Érintett fájl: [src/db/schema.ts](../src/db/schema.ts), [src/supervisor/guards.ts](../src/supervisor/guards.ts)
- Sorszám: schema.ts:27-37, 270-290; guards.ts:214-218
- Probléma leírása: A telephely PIN-ellenőrzői (PBKDF2, 100 000 iteráció) a nem titkosított SQLite-ban vannak, ahogy a specifikáció előírja. Egy 6 jegyű PIN tere 10⁶, így aki az adatbázisfájlt megszerzi, GPU-val percek alatt minden PIN-t visszafejt. A várakozó PIN-csere hívásának törzsében a PIN nyíltan áll, amíg el nem megy (döntés, M5-18). Az Android-mentés az adatbázist nem viszi (B. fejezet); az iOS a dokumentumkönyvtárat az iCloud-mentésbe teszi.
- Miért probléma? Valódi támadáshoz root, jailbreak vagy a mentéshez hozzáférés kell, ezért ez elméleti kockázat. A specifikáció offline PIN-ellenőrzésének velejárója.
- Milyen következménye lehet? Egy ellopott és feltört telefonról a telephely PIN-jei megismerhetők.
- Kapcsolódó specifikációs követelmény: Azonosítás / PIN-kód.
- Javasolt megoldás: Tudomásul venni és rögzíteni a `decisions.md`-ben; ha kell, iOS-en a fájl kizárása a mentésből (`isExcludedFromBackup`), Androidon `allowBackup: false` kifejezetten (most csak a secure store szabályai miatt marad ki).
- Javítási prioritás: –
- Bizonyosság: bizonyított (a tárolás); a kockázat elméleti.

**WP-APP-020 – Éles buildben a válaszok és a láncbejegyzések nincsenek sémán ellenőrizve**

- Súlyosság: INFO
- Kategória: Biztonság / robusztusság
- Érintett fájl: [src/api/client.ts](../src/api/client.ts), [src/chain/writer.ts](../src/chain/writer.ts)
- Sorszám: client.ts:110, 170-179; writer.ts:174-177
- Probléma leírása: A specifikáció szerint a válaszok ellenőrzése csak `__DEV__`. Élesben a válasz típusa csak `as` cast. Egy hiányzó lista a pullban a tranzakcióban kivételt dob (visszagördül), a pushnál a válasz feldolgozása bukik el.
- Miért probléma? A szerver megbízható fél, és HTTPS-en fut (Android és iOS alapból tiltja a nyílt HTTP-t a release buildben), ezért valódi injection-kockázat nincs. A hibás válasz viszont nehezen diagnosztizálható (WP-APP-008).
- Milyen következménye lehet? Egy szerverhiba „Váratlan hiba” lesz, ok nélkül.
- Kapcsolódó specifikációs követelmény: Repo és technológiai stack (`__DEV__` Ajv).
- Javasolt megoldás: Legalább a láncbejegyzés és a push-válasz ellenőrzése éles buildben is (WP-APP-002).
- Javítási prioritás: –
- Bizonyosság: bizonyított.

**WP-APP-021 – A nyers NDEF a feldolgozott rekordokból újraépített**

- Súlyosság: INFO
- Kategória: Specifikációs pontosság
- Érintett fájl: [src/nfc/tag.ts](../src/nfc/tag.ts)
- Sorszám: 122-143, 228-241
- Probléma leírása: A platformok a parsolt rekordokat adják, az app ebből építi vissza a bájtsort (rövid rekord, ha a payload elfér, darabolás nélkül). Ha a címke hosszú rekordot használ rövid payloadhoz, vagy darabolt, a `ndef_raw` eltér az eredetitől.
- Miért probléma? A specifikáció „nyers” tartalmat kér a későbbi NTAG 424 DNA ellenőrzéshez. A SUN-ellenőrzés az URL tartalmán múlik, ezért ez valószínűleg elég, de nem bitre azonos.
- Milyen következménye lehet? Egy későbbi, bájtszintű ellenőrzés hamis eltérést jelezhet.
- Kapcsolódó specifikációs követelmény: Láncolt napló / Jelölések (utolsó bekezdés).
- Javasolt megoldás: Döntés a `decisions.md`-be („normalizált NDEF”), vagy natív olvasás a nyers bájtokkal.
- Javítási prioritás: –
- Bizonyosság: bizonyított (kód).

---

## E. Architekturális értékelés

### Rétegek szétválasztása

| Réteg | Felelősség | Értékelés |
|---|---|---|
| `domain/` | menetrend, határidő, műszak, kör, leolvasás, betanítás, szerkesztés, nézetmodellek | Tiszta, I/O nélkül; a lint védi. Futásidőben csak a `chain/payloads`-ot és két időmodult éri el. A `payloads` is tiszta építő, ezért ez elfogadható, de a domain így a lánc formátumát is ismeri. |
| `chain/` | kanonikus JSON, HMAC, író, vetület | Jól körülhatárolt; a felette lévő rétegeket nem éri el (lint). Egyetlen felfelé mutató éle a `device/credentials` (WP-APP-006). |
| `db/` | séma, kv, nyitás | Vékony; a `kv` típusos kulcsai jók. |
| `sync/` | vezérlő, lépések, outbox, pull, revocation, cleanup | A vezérlő és a lépések szétválasztása mintaszerű (a vezérlő nem ismer hálózatot). A `runtime.ts` a kötőszövet (228 sor), ez rendben. |
| `guard/`, `supervisor/` | a domain és az adatbázis között, a képernyők adatai | Jó minta: a képernyő csak `load…` és `save…` függvényt hív; a szövegek `*-view.ts`-ben. |
| `auth/` | munkamenet, PIN, hozzárendelés | Az `auth/supervisor.ts` szinkron-orkesztrációt is végez (`whenSyncIdle`, `clearOutbox`, `deleteConfiguration`), ez a kör egyik oka (WP-APP-006). |
| `device/` | titok és tokenek; készenlét; előtér | Két különböző szintű felelősség egy mappában (WP-APP-006). |
| `app/` | route-fájlok | A képernyőkben kevés az üzleti logika, de sok a nézeti duplikáció, és néhány fájl nagy (WP-APP-009). |

### SOLID

- **SRP:** a domain, a lánc és a szinkronlépések szinten jó. Sérül: `device/` (titok és engedélyek), `auth/supervisor.ts` (belépés, kijelentkezés, hozzárendelés és szinkron-orkesztráció), a nagy képernyők.
- **OCP:** új bejegyzéstípus a `never`-ágon fordítási hibát ad (projection.ts:118-122), ez jó. Új szinkronlista a `SYNCED_LISTS` táblázatba kerül (pull.ts:191-255), ez kiterjeszthető. Az outbox válaszkezelése táblázatos (`RESPONSE_RECORDS`, outbox.ts:123-139).
- **LSP:** a `Database` típus egyaránt kiszolgálja az expo-sqlite-ot és a better-sqlite3-at (database.ts:14), helyettesíthetően. Egyetlen cast van (database.ts:20), megindokolva.
- **ISP:** a kontextusobjektumok szűkek (`PushContext`, `MediaContext`, `OutboxContext`), a lépések csak azt kapják, ami kell.
- **DIP:** a vezérlő kontextust és lépéseket kap (controller.ts:21-29); a `ReadClock` és a `readSecret` injektálható (writer.ts:107-113). Gyenge pont: a runtime-ok (`startSync`, `startScheduler`, `startRoundAlarms`) modulszintű változókban tartják az állapotot, és a `useSession`-t közvetlenül olvassák. Ez a WP-APP-004 egyik oka: a takarítás órája nem injektálható a runtime-on át.

### Függőségi struktúra és körök

- Fájlszinten nincs futásidejű kör (`import/no-cycle` zöld).
- Mappaszinten egy nagy kör van (WP-APP-006). Ez nem futási hiba, hanem a rétegek eróziójának jele.

### Kódduplikáció

- Üzleti szabály duplikációját nem találtam: a határidő, a slotok és a záró állapot egy-egy függvény (`deadlineOf`, `expectedSlots`, `closingStatus`), és mindenki ezeket hívja (rounds.ts, shift.ts, alarms.ts, shift-view.ts). A PBKDF2 egy helyen van (`pinHash`), a UID-normalizálás is (`normalizeTagUid`, a lánc, az NFC és a domain is ezt használja).
- A nézeti duplikáció: WP-APP-009.

### Túlzott komplexitás

- A `pull.ts` (339 sor) és az `outbox.ts` (335 sor) összetett, de az összetettség a valódi esetekből jön (várakozó rekordok, szerveroldali türelmi idő, verziószám-ütközés), és mindegyiket döntés indokolja.
- A `confirmed.ts` (a szerver türelmi idejének kerülőútja, M5-21) egy szerveroldali sajátosság kliensoldali kompenzációja. Működik, de a hosszú távú tisztább megoldás a szerver oldalán van (a döntésnapló ezt mérlegelte).

### Refaktorálási lehetőségek (javaslat, nem végrehajtva)

1. A `readiness.ts` kiköltöztetése a `device/`-ból (WP-APP-006).
2. A fiók-életciklus (kijelentkezés, hozzárendelés) orkesztrációja egy saját modulba.
3. Közös `Sheet`, `SectionTitle`, `SummaryRow` komponens (WP-APP-009).
4. A runtime-ok órájának és munkamenetének injektálása, hogy a tesztek idő-függetlenek legyenek (WP-APP-004).

---

## F. Tesztelési eredmények

### Lefutott ellenőrzések

| Parancs | Eredmény |
|---|---|
| `npm run typecheck` | 0 hiba |
| `npm run lint` | 0 hiba |
| `npm run format:check` | minden fájl rendben |
| `npx jest --coverage` (a projekt beállításával) | 129 csomag: 126 zöld, 2 piros, 1 kihagyott; 1140 teszt: 1133 zöld, 2 piros, 5 kihagyott; ~96 mp |
| `npx jest --coverage` a teljes `src/`-re | ugyanaz az eredmény |
| `npx drizzle-kit check` | rendben |
| `drizzle-kit generate` a séma másolatán (scratchpad) | „No schema changes” |
| `npx expo-doctor` | 19/20; a csomagverziók ellenőrzése hibás (WP-APP-017) |
| `npm audit` | WP-APP-018 |
| Mappaszintű függőségi gráf (saját szkript) | WP-APP-006 |
| `gh run list` | az utolsó 5 CI-futás zöld (M5-16 – M5-21) |

### Sikertelen tesztek

1. `src/sync/revocation.test.ts` – „goes through its last upload at the first device_revoked …”: `Expected length: 201, Received length: 1` (WP-APP-004).
2. `__tests__/schema-package.test.ts` – „../waypost-schema is checked out at the tag …”: `Expected: "v0.4.0", Received: "v0.5.0"` (WP-APP-005).

A kihagyott csomag az e2e (`__tests__/e2e/site-setup.e2e.test.ts`), amely `E2E_URL` nélkül szándékosan kimarad.

### Lefedettség

| Mappa | Utasítás | Elágazás | Függvény | Sor |
|---|---:|---:|---:|---:|
| `src/domain` | 99,5% | 97,2% | 100% | 100% |
| `src/chain` | 99,0% | 98,0% | 100% | 98,8% |
| `src/sync` | 96,6% | 92,5% | 94,2% | 97,6% |
| teljes `src/` | 94,0% | 88,4% | 92,4% | 95,1% |

A küszöb alatti, de nem küszöbös mappák: `src/db` 72,7% sor (a `open.ts` és a migráció a Jestben nem fut), `src/app/_layout.tsx` 5,9% (az indítás és a runtime-ok elindítása), `src/app/dev` 39,7%. A szinkron leggyengébb fájljai: `cleanup.ts` 77,8% elágazás (a törlési hibák ága), `pending.ts` 70% elágazás, `media.ts` 84,2% elágazás.

### Célzott próbák (scratchpad, a projekt módosítása nélkül)

1. **Azonos kezdő- és záróidejű intervallum** (`interval_from = interval_to = 20:00`): a következő napi 20:00 két slotban szerepel (start_day 11-03 és 11-04). Az ütemező két `round_opened`-et ad ugyanarra a `scheduled_at`-re, és egy `round_closed`-et az első nyitás elé rendez (WP-APP-010).
2. **DST-éjszakák** (20:00–08:00 óránként, időkeret nélkül, a demó B útvonalával):
   - 2026-10-24/25: 13 éjszakai kör, a kétszer előforduló 02:00-ból csak az első; 15 nyitás, 15 zárás, 1 automatikus műszakzárás.
   - 2026-03-28/29: 12 éjszakai kör (a nem létező 02:00 a 03:00-ba olvad); 14 nyitás, 14 zárás, 1 automatikus műszakzárás.

   Az ébresztési terv mindkét esetben 48 elemre vágott (WP-APP-003 illusztrációja).

### Hiányzó tesztek

- DST az ütemező, a határidő, az automatikus zárás és az ébresztés szintjén (WP-APP-012).
- A szinkron viselkedése, ha a push vagy a fotók lépése tartósan hibázik, és ilyenkor a pull is kimarad (WP-APP-002): a viselkedés így is tesztelhető, de nincs mögötte döntés.
- A `_layout.tsx` indítási sorrendje (adatbázis → munkamenet → runtime-ok), és a sikertelen migráció képernyője.
- Párhuzamos leolvasás rögzítés közben (WP-APP-011).

### Nem megfelelő tesztek

- Dátumfüggő teszt (WP-APP-004). Más, a valódi órát olvasó teszt is lehet; a teljes sor egy jövőbeli dátummal (`faketime`) futtatva kiderítené.
- A HMAC- és a PBKDF2-tesztek a `react-native-quick-crypto` Jest-mockján, a `node:crypto`-n futnak (`jest.setup.ts`). A vektorok így a JS-oldali formátumot igazolják, a natív megvalósítást nem.

### Nem ellenőrizhető területek

- Minden natív viselkedés valódi telefonon: NFC (NTAG21x, NTAG 424 DNA, iOS ISO-DEP), QR kamerával, ébresztés zárolt képernyőn és bezárt appal, `timeSensitive`, a monoton óra alvás alatt, a boot ID, a Hermes `Intl` időzóna-adatai, a natív PBKDF2 és HMAC iOS-en, a teljesítmény gyenge Android-telefonon (WP-APP-001).
- A backend tényleges válaszai a WP-APP-002 kiváltó eseteire (kérésszintű 4xx a pushra).
- Memóriaszivárgás és renderelési költség eszközön (React Compiler mellett a kód alapján nincs gyanús minta; minden figyelő és intervallum leiratkozik).

---

## G. Javasolt javítási sorrend

| # | Mit kell javítani? | Miért? | Érintett modulok | Függőség | Igazoló teszt |
|---:|---|---|---|---|---|
| 1 | Az M1, majd az M3–M5 telefonos elfogadása (WP-APP-001) | A specifikáció szerint ettől függ a folytatás | `docs/device-test.md` | – | A `device-test.md` kitöltött futásai, Androidon és iPhone-on |
| 2 | A dátumfüggő teszt és a sémaverzió (WP-APP-004, WP-APP-005) | Zöld tesztsor és CI nélkül a regressziók nem látszanak | `src/sync/revocation.test.ts`, `src/sync/runtime.ts`, `.waypost-schema-version` | – | `npm test` zöld egy jövőbeli rendszerdátummal is |
| 3 | A szinkronlépések hibáinak elszigetelése, éles sémaellenőrzés a láncnál (WP-APP-002) és helyi hibanapló, ErrorBoundary (WP-APP-008) | Egy tartós hiba ne akassza el a konfigurációt; a próbaüzem hibái legyenek kivizsgálhatók | `src/sync/controller.ts`, `push.ts`, `media.ts`, `src/chain/writer.ts`, `src/guard/scheduler.ts`, `src/alarms/round-alarms.ts`, `src/app/_layout.tsx` | Döntés a `decisions.md`-ben; a laravel-waypost push-viselkedésének ismerete | Szinkronteszt: a push 422-t ad, a pull mégis lefut; a hibanapló teszte; DEV-ben és élesben is elutasított hibás bejegyzés |
| 4 | Az ébresztési keret stratégiája (WP-APP-003) | Sűrű menetrendnél ne fogyjon el az ébresztés | `src/domain/alarms.ts`, specifikáció | Döntés és specifikációmódosítás | Domain-teszt: 15 perces menetrend, 12 órás éjszaka, a terv minden körhöz ad főértesítést |
| 5 | A leolvasás időbélyege és a második érintés (WP-APP-011) | Pontos idő; ne vesszen el olvasás | `src/guard/scan.ts`, `src/hooks/use-scan-recorder.ts` | 1. (eszközmérés) | Teszt: két olvasás egy rögzítés alatt, mindkettő rögzül, az érintés idejével |
| 6 | A mappakör megszüntetése (WP-APP-006) | Rétegtisztaság | `src/device/`, `src/auth/supervisor.ts` | – | A gráfszkript üres SCC-t ad; új lint-szabály |
| 7 | Supervisorok kezelése, vagy a specifikáció szűkítése (WP-APP-007) | Specifikációs hiány | `src/supervisor/guards.ts`, képernyő | Döntés | Képernyő- és outbox-teszt `role: 'supervisor'`-ral |
| 8 | A WP-APP-011 utáni UX-finomítás és a WP-APP-015, WP-APP-016 | Jobb visszajelzés | `src/sync/outbox.ts`, `src/auth/supervisor.ts` | – | Outbox-teszt: függő hívások összevont elutasítása; 401 utáni újra-bejelentkezés megtartott outboxszal |
| 9 | Közös lap- és címkomponensek (WP-APP-009) | DRY | `src/components/`, a supervisorképernyők | – | A meglévő képernyőtesztek zöldek maradnak |
| 10 | Az egyenlő intervallumhatár (WP-APP-010) | Védekező domain | `waypost-schema`, `src/domain/schedule.ts`, `rounds.ts` | Sémaverzió, ha a séma változik | Domain-teszt a próba mintájára |
| 11 | DST-tesztek (WP-APP-012) | Regresszióvédelem | `src/domain/*.test.ts` | – | Maguk a tesztek |
| 12 | Elavult komment (WP-APP-013) | Dokumentáció | `src/db/schema.ts` | – | – |
| 13 | A hozzárendelés mentési sorrendje (WP-APP-014) | Az egyszeri titok védelme | `src/auth/supervisor.ts`, `enrollment.ts` | – | Teszt: megszakítás a lépések között, az indulás után a telefon hozzárendelt |
| 14–16 | Függőségek, sablonmaradványok, mentési beállítások (WP-APP-017, -018, -019) | Higiénia, M7 előtt | `package.json`, `app.json` | SDK-frissítés | `npx expo-doctor` zöld; `npm audit --omit=dev` 0 |

---

## H. Összesített értékelés

| Terület | Értékelés (0–10) | Indoklás |
|---|---:|---|
| Specifikációs megfelelőség | 7 | Kódszinten szinte minden követelmény teljesül, sok döntés indokolt eltéréssel; hiányzik a supervisorok kezelése, és egyetlen mérföldkő telefonos elfogadása sem történt meg. |
| Architektúra | 8 | Tiszta domain, egyetlen láncíró, injektálható szinkronvezérlő, gépileg ellenőrzött rétegek; a mappaszintű kör levon. |
| Clean Code | 8 | Beszédes nevek, pontos kommentek, nincs `any`, TODO vagy elnyomott lint-szabály; a nagy képernyők és a nézeti duplikáció levonnak. |
| SOLID | 7 | Az OCP, az ISP és a DIP a magban jó; az SRP a `device/`-ban, az `auth/supervisor.ts`-ben és a nagy képernyőkben sérül; a runtime-ok modulszintű állapota gyengíti a DIP-et. |
| TypeScript típusbiztonság | 9 | `strict` és `noUncheckedIndexedAccess`, a séma típusai mindenhol; kevés, indokolt cast (35) és non-null assertion (46). |
| Adatkezelés | 8 | Tranzakciók, WAL + FULL, idegen kulcs nélküli védelem, a „szinkron előtt nem törlődik” szabály betartva; kis rés a hozzárendelésnél. |
| Szinkronizáció | 7 | Helyes sorrend, mutex, idempotencia, FIFO, jitter, végtelen ciklus elleni védelem; egy tartós lépéshiba viszont a teljes szinkront elakasztja. |
| Kriptográfia és adatvédelem | 8 | Saját, szigorú JCS; HMAC és PBKDF2 natívan, vektorokkal; secure store; a natív futás csak Android-emulátoron igazolt, és a 6 jegyű PIN offline visszafejthetősége a specifikáció velejárója. |
| Hibakezelés | 6 | Típusos API-hibák, átgondolt 4xx/5xx-szabályok; éles buildben viszont a háttérhibák nyom nélkül eltűnnek, nincs ErrorBoundary. |
| Tesztelhetőség | 8 | Valódi SQLite, hamis API, injektálható óra a domainben, 1140 teszt; a runtime-ok órája nem injektálható, ezért dátumfüggő teszt keletkezett. |
| Teljesítmény | 7 | A J-12 indexe után a domain lineáris; a React Compiler be van kapcsolva; az ütemező és a `useLiveQuery` költsége gyenge telefonon nem mért. |
| Karbantarthatóság | 7 | Kiváló döntésnapló és CLAUDE.md; a nézeti duplikáció és néhány 500 sor feletti képernyő levon. |
| Bővíthetőség | 8 | Új bejegyzéstípus, új szinkronlista és új végpont kis változtatással felvehető; a 2. lépcsőnek nincs architekturális akadálya. |
