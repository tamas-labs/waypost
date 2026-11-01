# Javítási terv: M1 és M3 audit

- **Forrás:** [audit-m1-m3.md](audit-m1-m3.md)
- **Készült:** 2026-10-31, a `main` `c46e9a6` állapotára. Az audit hivatkozásait és a hibák kódját ezen ellenőriztük.
- **Cél:** az M3 lezárható legyen (M3-39, M3-40), az M1 elfogadása megtörténjen, és az M4/M5 tiszta alapra épüljön.

## Mi változott az audit óta

Az audit a sémarepó commitolt állapotát (`M0-10`) nézte. A `../waypost-schema` munkakönyvtárában viszont **commit nélkül** ott van minden, ami hiányzott, ezért helyben más a kép:

| Ellenőrzés | Audit | Most, a helyi sémával |
|---|---|---|
| `npm run typecheck` | 20 hiba | Hibátlan |
| `npm run lint` | Hibátlan | Hibátlan |
| `npm test` | 5 csomag, 10 teszt piros | 1 csomag, 1 teszt piros (682 tesztből) |
| Lefedettség (`domain` / `chain` / `sync`, utasítás) | 99,5 / 98,5 / 96,2% | Ugyanaz |
| Sémarepó saját tesztjei | – | Zöldek (57 teszt, 67 séma) |

Ebből három dolog következik:

1. **Az 1. blokkoló kisebb, de sürgősebb.** A munka kész, csak nincs kiadva. Egy lemezhiba vagy egy `git clean` elvinné, és a `laravel-waypost` commitolt kódja is erre épül (pl. `ErrorCode`, `Sync/Pull`).
2. **Új hiba:** a `__tests__/shift-close-screen.test.tsx` „does not take another guard’s PIN” tesztje teljes futásban kétszer egymás után elbukott, önmagában kétszer átment. Valószínű ok: a tesztben a `getByText` nem vár a PBKDF2 végére. A `pin-screen.test.tsx` ugyanezt már `findByText`-tel és időkorláttal kezeli.
3. **A 3. hiba két külön okból áll.** A négyzetes költség a `deadlineOf`-ból jön, de az `Intl` hívások nem: `Intl` csak a `src/time/zone.ts`-ben van, tehát a menetrend-kibontás adja őket. A `Map`-es index ezért a mért `Intl`-számot nem csökkenti.

## Sorrend és indoka

Az audit sorrendjétől két ponton térünk el: a CI és a Prettier előrébb kerül, és az M1 telefonos próbája az üzleti javítások elé.

| Fázis | Tartalom | Kapu a továbblépéshez |
|---|---|---|
| **0.** | Zöld alap és védőháló | Friss checkouton minden zöld, a CI is |
| **1.** | M1 telefonos próba, Hermes-mérés | `device-test.md` M1 kitöltve, nincs `❌` |
| **2.** | Üzleti hibák | Az 1–5. hibának van regressziós tesztje |
| **3.** | Függőségek rendbetétele | `import/no-cycle` és rétegszabály a lintben |
| **4.** | M3 lezárása | M3-39, M3-40 kipipálva |
| **5.** | Refaktor az M5 előtt | Az M5 kezdete előtt kész |

- **A CI azért jön előre,** mert a piros állapot pont azért maradhatott észrevétlen, mert semmi nem jelezte. A javítások már védőháló mellett készülnek.
- **A Prettier azért jön előre,** mert később minden nyitott javítással ütközne, most viszont egyetlen, viselkedést nem érintő commit.
- **Az M1-próba azért jön előre,** mert ez a legnagyobb nyitott kockázat. Ha az NFC vagy az ébresztés nem úgy működik, ahogy feltételeztük, a specifikáció változik (M1-08: STOP-pont), és a ráépülő javítások egy része fölösleges lenne. A prototípus-képernyők már készen vannak, és az M1-es próba nem függ a 2. fázis javításaitól.

## Munkaszabályok

- Egy feladat egy commit (a nagyobbaknál egy PR), az itteni sorrendben. A 2. fázis feladatai egymástól függetlenek, azon belül a sorrend szabadon változtatható.
- Üzleti hibánál **előbb a bukó regressziós teszt**, utána a javítás.
- Minden feladat végén `npm run typecheck`, `npm run lint` és `npm test` zöld, a viselkedést érintő döntés a `decisions.md`-be kerül.
- A commitüzenet angol. Heredocból vagy `-F` fájlból add át, mert a csonka üzeneteket valószínűleg az idézőjel nélküli backtick okozta (`(G10, )`).

---

## 0. fázis – Zöld alap és védőháló

### [x] J-01 A `waypost-schema` 0.2.0 kiadása

**Méret:** kicsi. **Repó:** `waypost-schema`, `laravel-waypost`. **Hibajegy:** 1. blokkoló.

1. A munkakönyvtár áttekintése és commitolása. A sémarepó tesztjei már zöldek.
2. `package.json`: `0.2.0`. `CHANGELOG.md`: az `[Unreleased]` tartalma `[0.2.0]` alá. A változás visszafelé kompatibilis (opcionális `reset` mező, új hibakódok, új sémák), ezért minor.
3. `v0.2.0` tag és GitHub Release; a kiadási jegyzet a CHANGELOG szakasza.
4. `laravel-waypost/composer.json`: `"waypost/schema": "^0.2"` és `versions: { "waypost/schema": "0.2.0" }`. A `^0.1` a 0.2.0-t **nem** engedi be, ezt nem lehet kihagyni. Utána `composer update waypost/schema` és a backend tesztjei.

**Kész, ha:** a sémarepó munkakönyvtára tiszta, és mindkét fogyasztó zöld a kiadott taggel, friss checkouton is.

### [x] J-02 A bizonytalan PIN-teszt javítása

**Méret:** kicsi. **Fájl:** `__tests__/shift-close-screen.test.tsx`.

A PIN-es eredményt váró ellenőrzések `findBy…`-ra váltanak a `pin-screen.test.tsx` mintájára (`CHECK_TIMEOUT_MS`). Végig kell nézni a fájl többi, `confirm()` utáni szinkron ellenőrzését is.

**Eltérés a tervtől:** a `findBy…` helyett a `confirm()` a `closeShiftWithPin` promise-ára vár. Hamis időzítőkkel a `findBy…` időkorlátja hamis időt számol: a 10 másodperc valójában kb. 13 ms volt, a PBKDF2 viszont valós időben fut.

**Kész, ha:** a teljes `npm test` háromszor egymás után zöld.

### [x] J-03 A sémaverzió rögzítése az appban

**Méret:** kicsi. **Fájlok:** `.waypost-schema-version` (új), `__tests__/schema-package.test.ts`.

A `file:` függőség maradhat (a specifikáció ezt írja elő), de a verziót nem rögzíti. Az új fájl tartalma `v0.2.0`, a teszt pedig elbukik, ha a csomag `version` mezője ettől eltér. A CI ugyanebből a fájlból tudja, melyik taget kell kivennie.

**Kész, ha:** régi sémával a teszt érthető üzenettel bukik.

### [x] J-04 CI

**Méret:** kicsi. **Fájl:** `.github/workflows/ci.yml`. **Hibajegy:** „Nincs CI”.

- Kiveszi a `waypost` és a `waypost-schema` repót egymás mellé, a sémát a J-03 tagjén. Ha a sémarepó privát, ehhez olvasási jog kell (deploy key vagy finomhangolt token secretben), amit a repó gazdájának kell beállítania.
- Futtatja: `npm ci`, `npm run typecheck`, `npm run lint`, `npm run test:coverage`.

A sémarepó nyilvános, ezért külön olvasási jog nem kellett.

**Kész, ha:** a `main`-en és a PR-eken fut, és egy szándékosan elrontott típussal piros lesz.

### [x] J-05 Prettier

**Méret:** kicsi, de nagy diff. **Fájlok:** `.prettierrc`, `package.json`, `eslint.config.js`, CI. **Hibajegy:** 73 hosszú sor.

- `printWidth: 140`. A kód ma ~180 karakterre van tördelve, a 140 megszünteti a legrosszabbakat, és a Drizzle-láncokat sem robbantja szét.
- Külön commit, csak formázással; a hash bekerül a `.git-blame-ignore-revs`-be.
- A CI-ba `prettier --check`.

**Kész, ha:** a formázó commit után minden ellenőrzés zöld, és nincs benne más változás.

---

## 1. fázis – M1 telefonos próba és Hermes-mérés

**Előfeltétel a gazdától:** Android-telefon és iPhone, Apple Developer fiók, NTAG21x és NTAG 424 DNA címke, nyomtatott QR-kód. Ha az iPhone most nem elérhető, az Android-futás így is értékes, de az M1-08 és az M3-40 addig nyitott marad.

### [x] J-06 Mérőképernyő a prototípusok közé

**Méret:** kicsi. **Fájl:** `src/app/prototype/` alatt új képernyő. **Hibajegy:** 3. hiba.

Futtatja és időzíti a `schedulerStep`, `shiftHome`, `alarmPlan`, `roundAlarmInfo` függvényt az audit három menetrendjével (óránként; 5 percenként 20:00–08:00; 5 percenként 00:00–23:55), és külön a `slotsBetween`-t. Így látszik, hogy a kibontás vagy a határidő-számítás viszi az időt. Ide tartozik a natív modul miatt szükséges új dev build is, ha kell.

### [ ] J-07 Az M1 elfogadása (M1-08)

**Méret:** közepes, a 3 órás ébresztéspróba miatt. **Végzi:** a gazda telefonon.

1. `device-test.md` M1-es tételei: C (óra), N (NFC), Q (QR), E és Á (ébresztés), mindkét telefonon.
2. A J-06 mérése a gyengébb Android-telefonon; az eredmény a `device-test.md`-be.
3. Az M1-08 mellé megjegyzés a `tasks.md`-be, a `decisions.md` 2026-10-28-as döntése mellé pedig a tényleges eredmény.

**Kész, ha:** a futástábla kitöltve, és nincs `❌`. **Ha van `❌`: STOP**, előbb a specifikáció módosul, és ezt a tervet is újra kell nézni.

---

## 2. fázis – Üzleti hibák

### [x] J-08 Egységes időalap a projekcióban

**Méret:** közepes. **Súly:** magas. **Hibajegy:** 1. hiba.

**Hiba:** a projekció a falióra szerinti `device_time`-ot tárolja, a szabályok pedig a megbízható `now`-val hasonlítják össze ([rounds.ts:116](../src/domain/rounds.ts#L116), [shift.ts:205](../src/domain/shift.ts#L205)).

**Javítás:**

- `src/time/trusted-time.ts`: új `entryTrustedTime(entry)`, amely az `estimateTrustedTime`-ot hívja a bejegyzés saját `ref_*`, `uptime_ms`, `boot_id` és `device_time` mezőivel.
- [projection.ts](../src/chain/projection.ts): mind az öt helyen (`started_at`, `ended_at`, a kör `started_at`-je, `scanned_at`, `occurred_at`) ezt használja, nem csak a műszaknál. Különben a kijelzett leolvasási idő és a határidő továbbra is más órát követne. A 28. sor kommentje is módosul.
- A lánc nem változik: a `device_time` megmarad, a szerver ebből számolja a `time_suspect` jelölést. Séma- és adatbázis-migráció nem kell, éles adat még nincs.

**Regressziós teszt** (az audit két futtatott esete):

- az óra 30 percet siet, belépés valós 20:05-kor: a 20:00-s kör megnyílik, nem „elmaradt”;
- az óra 60 percet késik, belépés valós 21:05-kor: nem jön létre azonnal elmaradt 20:00-s kör;
- hivatkozás nélkül vagy más boot után a `device_time` az érték.

**Ami megmarad:** ha a műszak szerveridővel indult, majd a telefon újraindul hálózat nélkül és rossz az órája, a `started_at` szerveridő, a `now` falióra lesz. Friss hivatkozás nélkül ez nem oldható meg; ezt a `decisions.md`-be kell írni, és a `device-test.md` F8 tételének futtatásakor figyelni.

**Tovább vinni:** a [projection.ts](../src/chain/projection.ts) fejléce szerint a szerver ugyanezeket a projekciókat építi. Az M4 szerveroldali feladatához fel kell venni, hogy a backend ugyanezt a számítást használja, különben a telefon és a jelentés eltérhet. Ezt a `tasks.md`-be kell beírni, a kód most nem változik ott.

### [x] J-09 A futó kör inaktív pontja

**Méret:** kicsi. **Súly:** közepes. **Hibajegy:** 2. hiba.

**Javítás** ([scan.ts:46](../src/domain/scan.ts#L46), [scan.ts:121](../src/domain/scan.ts#L121)): a `resolveScan` két lépésben keres.

1. A nyitott körök útvonalverzióinak pontjai között, az `active` mezőtől függetlenül.
2. Ha nincs találat, a többi aktív pont között, ahogy eddig.

Ha egy címke egy inaktív és egy aktív ponthoz is tartozik (az index nem egyedi), a futó kör verziója nyer. A `nearestCheckpoint` nem változik.

**Regressziós teszt:** a futó kör inaktívvá tett pontja `recorded`, és a kör címkeolvasással befejezhető; verzión kívüli inaktív pont továbbra is `unknown_tag`.

**Ezzel együtt ellenőrizni (az audit nem nézte):** a pull a `deleted.checkpoints` pontjait fizikailag törli ([pull.ts:125](../src/sync/pull.ts#L125)), a verzió pontlistája viszont megmarad. Teszt kell arra, mi történik, ha futó kör közben törölt pont vagy `reset` oldal érkezik. Ha a kör ettől befejezhetetlen lesz vagy eltűnik, az külön feladat és külön döntés.

### [x] J-10 A lejárt kör `finished_at` értéke

**Méret:** kicsi. **Súly:** alacsony. **Hibajegy:** 5. hiba.

**Javítás** ([shift.ts:25](../src/domain/shift.ts#L25)): a `closeOpenRounds` körönként `min(határidő, now)` értéket ad, ahogy az ütemező.

**Regressziós teszt:** átadásnál és őri zárásnál is 23:30 helyett 20:20; még le nem járt körnél marad a `now`.

### [x] J-11 Azonnali visszajelzés leolvasáskor

**Méret:** kicsi. **Súly:** közepes. **Hibajegy:** 4. hiba.

**Javítás:** a kimenetelhez nem kell helyadat, ezért szétválik a döntés és a rögzítés.

- `src/guard/scan.ts`: új `previewTagRead(db, read)`, amely a `resolveScan`-t hely nélkül futtatja, és nem ír semmit.
- [use-scan-recorder.ts:41](../src/navigation/use-scan-recorder.ts#L41): `playFeedback(scanFeedback(preview))` azonnal, utána a `recordTagRead`, majd a navigáció.
- Ha a tényleges döntés eltér az előnézettől (a várakozás alatt zárult egy kör), az eredményképernyő a tényleges kimenetet mutatja. Ha az írás bukik, a hibajelzés szól, mint eddig.

A „további olvasás elvész” viselkedés marad: a dupla érintés ellen kell. A `decisions.md` érintett bekezdése frissül, és a próbán figyelni kell, zavar-e beltérben.

**Regressziós teszt:** soha be nem fejeződő `currentLocation` mellett a `playFeedback` már lefutott.

### [ ] J-12 Az ütemező gyorsítása

**Méret:** kicsi, az `Intl`-résszel közepes. **Súly:** közepes. **Hibajegy:** 3. hiba.

1. **Mindig:** a `deadlineOf` és a `roundDeadline` ne keressen végig minden slotot. Egyszer felépített index (`schedule_id|scheduled_at` és `route_id|start_day` szerint), amit az `autoCloseTime`, a `schedulerStep` és a `shiftHome` továbbad. A közös menetrend-vektorok és a domain tesztjei védik a viselkedést.
2. **Csak ha a J-06 indokolja:** ha a `schedulerStep` a gyengébb Android-telefonon 100 ms fölött van, az `Intl`-hívások csökkentése (a zóna eltolásának gyorsítótárazása, vagy a kibontás memoizálása).

**Kész, ha:** a J-06 képernyőn mért idő kisebb, és az eredmény a `device-test.md`-ben van.

**Állapot (2026-11-01):** az 1. pont kész, Node-ban mérve 6–17-szer gyorsabb (`decisions.md`). Nyitott: a telefonos mérés (J-07), és annak alapján a 2. pont.

---

## 3. fázis – Függőségek rendbetétele

Egy kis PR-be fér. Sorrendben, mert a J-17 csak a többi után kapcsolható be.

### [x] J-13 A `chain → sync` él megszüntetése

**Méret:** kicsi. **Hibajegy:** 6. hiba, „a legrosszabb él”.

- [writer.ts](../src/chain/writer.ts): a 13. és a 97. sor törlése.
- [runtime.ts](../src/sync/runtime.ts): a `startSync` feliratkozik az `onChainEntries` eseményre, és a `stop`-ban leiratkozik. A fejléckomment is módosul.

**Regressziós teszt:** ha a figyelő kivételt dob, az `appendChainEntries` nem utasítódik el, a bejegyzés megvan. Új bejegyzés után továbbra is frissül a számláló, és 2 mp múlva indul a szinkron.

### [x] J-14 A két típusszintű fájlkör

**Méret:** kicsi.

- A `ChainEntryDraft` a `payloads.ts`-be kerül, az importok követik.
- A `PullSummary` a `sync/events.ts`-be kerül.

### [x] J-15 A `guard ↔ alarms` kör

**Méret:** kicsi.

A [readiness.ts](../src/guard/readiness.ts) és a tesztje az `src/device/` mappába kerül. A `shift-start` képernyő és két képernyőteszt mockja követi. A CLAUDE.md *Szerkezet* szakasza is frissül.

### [x] J-16 A `{domain, chain, auth}` mappakör és a `db` típusélei

**Méret:** kicsi.

- `src/auth/credentials.ts` → `src/device/credentials.ts`. Nincs belső függősége, így a `chain` többé nem függ az `auth`-tól.
- `src/api/validation.ts` → `src/schema/validation.ts`. Szintén levél, így megszűnik a `chain → api` él.
- A `ThemePreference` típus a `theme/tokens.ts`-be kerül, így a `db/kv.ts` nem ér el React-providert.
- A `db/kv.ts` → `domain/pin-lockout` csak típusimport, ez marad, dokumentált kivétellel.

A `domain → chain/payloads` él marad: a specifikáció szerint a domain kimenete a piszkozat, és a `payloads.ts` a J-14 után nem függ a writertől.

### [x] J-17 Szabályok a lintben

**Méret:** kicsi.

- `import/no-cycle` bekapcsolása. Az `eslint-plugin-import` és a TS-resolver már telepítve van. Ki kell próbálni, felismeri-e az `@/` aliast, és mennyit lassít.
- Rétegszabály `no-restricted-imports`-szal, legalább ezekre: a `domain` csak a `time/zone`, `time/timestamp`, `chain/payloads` fájlt éri el; a `chain` nem éri el a `sync`, `guard`, `api`, `auth` mappát; a `db` futásidőben nem éri el a `domain`-t.
- Ha a szabály bevezetése új kört mutat, azt itt kell megszüntetni, kivételt nem veszünk fel.

**Kész, ha:** szándékosan visszarakott `chain → sync` import esetén a lint piros.

---

## 4. fázis – M3 lezárása

### [x] J-18 M3-39 pipálása

`npm run test:coverage` zöld a kiadott sémával, a CI is. A `tasks.md`-ben pipa, a megjegyzés frissül.

### [ ] J-19 M3-40: 1 órás offline műszak telefonon

**Méret:** közepes. **Végzi:** a gazda telefonon.

- `device-test.md` „M3 – Elfogadás”, F1–F9, és a korábbi M3-as tételek (I, T, E, kézi, esemény, zárás), mindkét telefonon. Az új dev build tartalmazza a 2. fázis javításait.
- Külön is figyelendő: átállított óra melletti belépés (J-08), beltéri leolvasás visszajelzése (J-11), a kezdőlap és az ütemező gördülékenysége 5 perces köröknél (J-12).

**Kész, ha:** a futástábla kitöltve és nincs `❌`; az M3-40 kipipálva. A talált hibák itt kapnak új `J-` azonosítót, és a pipa előtt javulnak.

**Állapot (2026-11-01):** az M3-40 a gazda döntése szerint a telefonos futás előtt kipipálva (`decisions.md`). Ez a feladat nyitott marad: a futás hátravan, és a benne talált hibák itt kapnak új `J-` azonosítót.

---

## 5. fázis – Refaktor az M5 előtt

Csak zöld CI mellett, viselkedésváltozás nélkül, egyenként külön commitban. Az M4 közben is végezhető, ha nem ütközik a szinkronnal.

| # | Feladat | Érintett hely |
|---|---|---|
| [x] J-20 | Egyetlen `normalizeTagUid`, validálva. **Ezzel kezdjük,** mert két eltérő viselkedésű változat van | [payloads.ts:76](../src/chain/payloads.ts#L76), [tag.ts:38](../src/nfc/tag.ts#L38) |
| [x] J-21 | `useLiveQuery`: élő betöltő hook | `home`, `alarm`, `round`, `shift/close`, `pin` |
| [x] J-22 | `usePinEntry`: PIN-beírás és beküldés | [pin.tsx:104](../src/app/%28auth%29/pin.tsx#L104), [close.tsx:83](../src/app/%28guard%29/shift/close.tsx#L83) |
| [x] J-23 | Közös űrlaphook: helyadat, mentés, `busy`, `mounted` | [manual/index.tsx:93](../src/app/%28guard%29/manual/index.tsx#L93), [incident/new.tsx:55](../src/app/%28guard%29/incident/new.tsx#L55) |
| [x] J-24 | `loadGuardStateNow` (a tervben `withGuardState`; visszatérési értékkel egyszerűbb, mert a hívók másképp kezelik a `null`-t): óra és `loadGuardState` egy helyen | 8 `guard` fájl és az ébresztés |
| [x] J-25 | Nézetmodellek kiemelése: `nextRound`, `shiftDay`, `shiftHome`, `shiftSummary` új `domain/shift-view.ts`-be; a `guard/login.ts` szétválasztása | [shift.ts](../src/domain/shift.ts), [login.ts](../src/guard/login.ts) |
| [x] J-26 | A [round/[id].tsx](../src/app/%28guard%29/round/%5Bid%5D.tsx#L141) és a többi 70–100 soros route-komponens szétbontása, a hatszintes ternáris megszüntetése | 7 route-komponens |
| [x] J-27 | Közös előtér-figyelő és intervallum | [scheduler.ts:60](../src/guard/scheduler.ts#L60), [runtime.ts:108](../src/sync/runtime.ts#L108), `alarms` |
| [x] J-28 | Apróbb közösítés: titok-regex, `roundKey()`, `isClosed()`, `tabular` stílus, közös `dev`/`prototype` layout | Az audit *Duplikáció* táblája |
| [x] J-29 | Rossz helyen lévő segédek: `trustedNowMs`, `userName`, `routeNameAmongSeveral`, `use-scan-recorder`, `use-pin-lock` | Az audit *Clean Code* szakasza |
| [x] J-30 | Kis tisztítás: mágikus szám ([rounds.ts:68](../src/domain/rounds.ts#L68)), mellékhatás a `map`-ben ([shift.ts:206](../src/domain/shift.ts#L206)) | `domain` |
| [x] J-31 | `useSession` írása egy helyről, a képernyők és a `guard` réteg nem írja közvetlenül | [login.ts:76](../src/guard/login.ts#L76), [shift-close.ts:82](../src/guard/shift-close.ts#L82), [home.tsx:54](../src/app/%28guard%29/home.tsx#L54) |
| [x] J-32 | A [pull.ts](../src/sync/pull.ts) kézi táblalistái egy leírótáblából, mert az M5 új táblákkal bővíthet | [pull.ts](../src/sync/pull.ts) |

---

## Amit nem javítunk

| Audit-tétel | Döntés | Indok |
|---|---|---|
| Magyar és csonka commitüzenetek a múltban | A történetet nem írjuk át | A közzétett hash-ek megmaradnak; innentől angol, lásd *Munkaszabályok* |
| ISP: a szabályok a teljes `GuardState`-et kapják | Marad | Tiszta függvények, a tesztek fixture-rel futnak; a szűkítés csak zajt adna |
| A `writer.ts` több felelőssége | Marad a J-13 után | Egy tranzakció lépései, a szétszedés a láncíró egyszerűségét rontaná |
| `loadGuardState` hossza | Marad, amíg nem kell hozzányúlni | Egyetlen olvasó függvény, tesztelt; a J-24 az ismétlődő hívásait kezeli |
| `getDatabase()` mint service locator | Marad | Egy adatbázis van, a függvények többsége már paraméterben kapja |
| A helyadat és az `uuidv7` nem injektálható | Marad | A `jest.mock` itt elég, és a CLAUDE.md is ezt a mintát írja le |
| `dev` és `prototype` route-ok a release bundle-ben | Az M7-02-nél nézzük újra | A `Stack.Protected` zárja őket, élesítés előtt elég eldönteni |
| Fejléc-szinkronjelző a kézi képernyőn; dokumentált eltérések | Marad | Tudatos, a `decisions.md`-ben rögzített döntések |

## Ellenőrzőlista az audithoz

Minden auditmegállapítás itt van, hogy semmi ne vesszen el.

| Audit-tétel | Feladat |
|---|---|
| 1. blokkoló: séma | J-01, J-03 |
| 2. blokkoló: M1 elfogadás | J-07 |
| 1. hiba: időalap | J-08 |
| 2. hiba: inaktív pont | J-09 |
| 3. hiba: ütemező | J-06, J-12 |
| 4. hiba: visszajelzés | J-11 |
| 5. hiba: `finished_at` | J-10 |
| 6. hiba: `notifyChainEntry` | J-13 |
| Fájlszintű típuskörök | J-14 |
| Mappakörök | J-13, J-15, J-16 |
| `db/kv.ts` típusélei | J-16 |
| Duplikáció táblája | J-20 – J-24, J-27, J-28 |
| SOLID: SRP | J-25; a többi: *Amit nem javítunk* |
| SOLID: OCP | J-32 |
| SOLID: DIP | J-13, J-16, J-31; a többi: *Amit nem javítunk* |
| Clean Code: hosszú sorok | J-05 |
| Clean Code: hosszú képernyők | J-26 |
| Clean Code: rossz helyű segédek, apróságok | J-29, J-30 |
| Nincs CI | J-04 |
| M3-39, M3-40 | J-18, J-19 |
| Új: bizonytalan PIN-teszt | J-02 |
| Új: törölt pont és `reset` futó körben | J-09 |
| Új: a szerver projekciójának időalapja | J-08 → M4 |
