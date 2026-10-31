# Kódaudit: M1 és M3 (`waypost` app)

- **Dátum:** 2026-10-31
- **Vizsgált állapot:** `main`, `9ddf26c` commit
- **Hatókör:** az M1 és az M3 mérföldkő kódja. Az M0 (`waypost-schema`) és az M2 (`laravel-waypost`) külön repó, ezeket nem vizsgáltuk.
- **Szempontok:** körkörös függőségek, duplikáció, SOLID, Clean Code, megfelelés a specifikációnak.

## Összkép

A kód szerkezete jó, de az M3 most nem zárható le. A jelenlegi sémával a `typecheck` és 5 tesztcsomag piros, telefonos elfogadás pedig se az M1-ről, se az M3-ról nincs. Két üzleti hibát futtatással igazoltunk.

| Szempont | Értékelés | Rövid indok |
|---|---|---|
| Körkörös függőség | Fájlszinten jó, mappaszinten gyenge | 0 futásidejű fájlkör, 2 csak típusszintű kör, 2 futásidejű mappakör |
| Duplikáció | Közepes | Pontos másolat kevés, ismétlődő szerkezet annál több |
| SOLID | Közepes | Jó a domain, a láncíró és a vezérlő; az SRP és a DIP több helyen sérül |
| Clean Code | Jó | Nincs `any`, `ts-ignore`, `eslint-disable` vagy TODO; a hosszú sorok és képernyők rontják |
| Specifikáció | Funkcióban jó, elfogadásban nem teljesül | M3-39, M3-40 nyitott; az M1-08 pipája nem jelent telefonos elfogadást |

## Ellenőrzések

| Ellenőrzés | Eredmény |
|---|---|
| `npm run lint` | Hibátlan |
| `npm run typecheck` | **20 hiba**, ebből 6 éles kódban, a többi tesztfájlban |
| `npm test` | **5 csomag és 10 teszt piros**, 650 teszt zöld (80 csomag, 660 teszt) |

Piros csomagok: `src/auth/pin.test.ts`, `src/guard/login.test.ts`, `src/sync/pull.test.ts`, `__tests__/pin-screen.test.tsx`, `__tests__/dev-enroll.test.tsx`.

| Lefedettség | Utasítás | Elágazás | Függvény | Sor |
|---|---|---|---|---|
| `src/domain` | 99,5% | 95,8% | 100% | 100% |
| `src/chain` | 98,5% | 97,9% | 100% | 98,2% |
| `src/sync` | 96,2% | 91,1% | 96,3% | 97,4% |

A 90%-os küszöb teljesül, de a mérés a piros tesztekkel együtt futott.

## Blokkolók

### 1. A szerződés lemaradt az apptól

A helyi `../waypost-schema` az `M0-10` commiten áll, és hiányzik belőle minden, amit az app vár:

- `pinVectors`
- a pull `reset` mezője
- `api/site-list.response` és `SiteListResponse`
- a `server_error` és a `bad_request` hibakód

Fejlesztői buildben ezért elbukik a hozzárendelés (`Unknown schema`) és a pull is, ha a szerver küld `reset` mezőt. A `decisions.md` zöld futásra hivatkozik egy repón kívüli sémamásolattal, de az itt nem ellenőrizhető. Ez sérti a CLAUDE.md szabályát, hogy a szerződés „előbb ott” változik. A `file:` függőség a verziót sem rögzíti.

### 2. Az M1 elfogadása nem történt meg

Az M1-08 ki van pipálva, a [device-test.md](device-test.md) futásai viszont üresek. A `decisions.md` ezt a projekt gazdájának döntéseként rögzíti, tehát tudatos. Az NFC, az ébresztés, az uptime és a Hermes `Intl` kockázata így még nyitott, pedig a teljes M3 ezekre épül.

## Üzleti és helyességi hibák

| # | Súly | Hiba | Bizonyíték |
|---|---|---|---|
| 1 | **Magas** | **Keveredik két időalap.** A `started_at` a falióra ([projection.ts:33](../src/chain/projection.ts#L33)), a `now` a megbízható idő, és a szabályok összehasonlítják őket ([rounds.ts:116](../src/domain/rounds.ts#L116), [shift.ts:205](../src/domain/shift.ts#L205)). | **Futtatva:** ha az óra 30 perccel siet, a 20:05-kor belépett őrnek a 20:00-s kör nem nyílik meg, és „elmaradt” lesz. Ha 60 percet késik, a 21:05-ös belépésnél létrejön egy azonnal elmaradt 20:00-s kör. |
| 2 | **Közepes** | **A futó kör inaktívvá tett pontja „ismeretlen címke” lesz** ([scan.ts:46](../src/domain/scan.ts#L46)). A specifikáció szerint a kör a megnyitáskor rögzített verziót használja végig. | **Futtatva:** az eredmény `unknown_tag`, pedig a pont a verzióban van. A kör címkeolvasással nem fejezhető be, csak kézi rögzítéssel. |
| 3 | **Közepes** | **Az ütemező drága rövid körökkel.** A `deadlineOf` minden hívása végigkeresi a listát, így a költség négyzetes ([rounds.ts:46](../src/domain/rounds.ts#L46), [rounds.ts:64](../src/domain/rounds.ts#L64)). A számítás a JS-szálon fut. | **Mérve, Node-ban:** 5 perces menetrenddel hívásonként 44–161 ms és 3 600–14 400 `Intl` hívás. Hermesen nem mért, pedig az M3-40 épp 5 perces körökkel fut. |
| 4 | **Közepes** | **A visszajelzés késhet.** A rezgés csak a helyadat után jön, ami legfeljebb 5 mp ([scan.ts:34](../src/guard/scan.ts#L34), [use-scan-recorder.ts:41](../src/navigation/use-scan-recorder.ts#L41)). Közben a további olvasás elvész. A [decisions.md:430](decisions.md#L430) „a leolvasás pillanatát” írja. | Kódolvasás. Beltérben, friss helyadat nélkül ez lehet az általános eset, eszközön kell ellenőrizni. |
| 5 | Alacsony | **Átadásnál és őri zárásnál a lejárt kör `finished_at` értéke a „most”**, az ütemezőnél a határidő ([shift.ts:25](../src/domain/shift.ts#L25)). | **Futtatva:** 23:30 a 20:20 helyett. Többnyire csak szűk időablakban fordul elő, mert indításkor és előtérbe kerüléskor fut az ütemező. |
| 6 | Alacsony | **A commit utáni `notifyChainEntry` kivétele elutasítja az írást** ([writer.ts:97](../src/chain/writer.ts#L97)). | **Futtatva:** a hívó hibát kap, pedig a bejegyzés már rögzült. |

A 3. hiba mért értékei (Node, egy menetrend, hívásonként):

| Menetrend | `schedulerStep` | `shiftHome` | `alarmPlan` | `roundAlarmInfo` |
|---|---|---|---|---|
| Óránként, 20:00–08:00 | 4 ms, 327 `Intl` | 4 ms, 327 `Intl` | 7 ms, 457 `Intl` | 7 ms, 658 `Intl` |
| 5 percenként, 20:00–08:00 | 44 ms, 3 627 `Intl` | 43 ms, 3 627 `Intl` | 61 ms, 5 077 `Intl` | 81 ms, 7 258 `Intl` |
| 5 percenként, 00:00–23:55 | 78 ms, 7 202 `Intl` | 92 ms, 7 202 `Intl` | 122 ms, 10 082 `Intl` | 161 ms, 14 408 `Intl` |

## Körkörös függőségek

- **Fájlszinten:** nincs futásidejű kör. A két típusszintű kör könnyen megszüntethető:
  - `payloads → writer → media → payloads`: a `ChainEntryDraft` kerüljön a `payloads.ts`-be.
  - `sync/events ↔ sync/pull`: a `PullSummary` kerüljön az `events.ts`-be.
- **Mappaszinten, futásidőben:** `{domain, chain, auth, sync}` és `{guard, alarms}`. Típusokkal együtt az első kör a `theme`, `time`, `db` és `api` mappára is kiterjed.
  - Az egyik útvonal: `domain → chain/payloads`, `chain/writer → auth/credentials`, `auth/pin → domain/pin-lockout`.
  - A másik: `chain/writer → sync/runtime → auth/session`.
- **A domain tisztasága rendben van:** futásidőben csak a `time/zone`, a `time/timestamp` és a `chain/payloads` fájlt éri el, npm-csomagot nem. Ez megfelel a specifikációnak.
- **A legrosszabb él a `chain → sync`:** [writer.ts:13](../src/chain/writer.ts#L13) miatt a láncíró 26 fájlos futásidejű lezártjába kerül a szinkron futtatója és a munkamenet-tár is. Az `onChainEntries` esemény már létezik, a `startSync` iratkozzon fel arra; ez a 6. hibát is megszünteti.
- **A `guard ↔ alarms` kör** egyetlen fájl miatt áll fenn: a [readiness.ts](../src/guard/readiness.ts) kerüljön ki a `guard` mappából.
- **Típusszinten fordított függőség:** a [db/kv.ts:3](../src/db/kv.ts#L3) a domaint és egy React-provider fájlt is importál.

## Duplikáció

| Minta | Hely |
|---|---|
| Élő betöltő hook (`useState` + két feliratkozás) | `home`, `alarm`, `round`, `shift/close`, `pin` képernyők |
| Óra + `loadGuardState` boilerplate | 15 `trustedTime(db, readClock())` hívás; `loadGuardState` 8 `guard` fájlban és az ébresztésben |
| Előtérbe kerülés figyelése és intervallum | [scheduler.ts:60-79](../src/guard/scheduler.ts#L60), [runtime.ts:108-127](../src/sync/runtime.ts#L108), részben az `alarms` modulban |
| PIN-beírás és beküldés | [pin.tsx:104](../src/app/%28auth%29/pin.tsx#L104), [close.tsx:83](../src/app/%28guard%29/shift/close.tsx#L83) |
| Űrlap: helyadat, mentés, `busy`, `mounted` | [manual/index.tsx:93](../src/app/%28guard%29/manual/index.tsx#L93), [incident/new.tsx:55](../src/app/%28guard%29/incident/new.tsx#L55) |
| Két eltérő `normalizeTagUid` | [payloads.ts:76](../src/chain/payloads.ts#L76) (nem validál), [tag.ts:38](../src/nfc/tag.ts#L38) (validál) |
| A 32 bájtos titok regexe | [hmac.ts:12](../src/chain/hmac.ts#L12), [credentials.ts:12](../src/auth/credentials.ts#L12) |
| `schedule_id\|scheduled_at` kulcs | 3 domain és 3 UI fájl |
| Lezárt státusz vizsgálata | [home.tsx:30](../src/app/%28guard%29/home.tsx#L30), [alarms.ts:93](../src/domain/alarms.ts#L93), [round.ts:149](../src/guard/round.ts#L149) |
| Azonos layoutok, közös `tabular` stílus | `dev` és `prototype` `_layout`; a `tabular` 19 fájlban |

## SOLID

- **SRP:**
  - A [shift.ts](../src/domain/shift.ts) az állapotgép mellett képernyők nézetmodelljeit is tartalmazza (`nextRound`, `shiftDay`, `shiftHome`, `shiftSummary`).
  - A [guard/login.ts](../src/guard/login.ts) három képernyő adatát és a belépést is kezeli.
  - A [loadGuardState](../src/guard/state.ts#L18) 109 soros, sok lekérdezéssel.
  - A [writer.ts](../src/chain/writer.ts) zárol, aláír, validál, tranzakciót kezel és értesít.
- **OCP:** az `applyProjection` kimerítő `switch`-e jó minta. Új szinkronizált táblánál viszont több kézi listát kell bővíteni a [pull.ts](../src/sync/pull.ts)-ben.
- **LSP:** nem releváns, öröklés szinte csak a hibaosztályoknál van, és ott rendben van.
- **ISP:** a szabályok a teljes `GuardState`-et kapják, bár többnyire csak egy részét használják. Alacsony prioritás.
- **DIP:**
  - Fordított élek: `chain → sync`, `chain → api`, `chain → auth`, `time → db`, `api → db`.
  - Az alkalmazásréteg és két képernyő közvetlenül írja a `useSession` tárat ([login.ts:76](../src/guard/login.ts#L76), [shift-close.ts:82](../src/guard/shift-close.ts#L82), [home.tsx:54](../src/app/%28guard%29/home.tsx#L54)).
  - A `getDatabase()` globális service locator 15 fájlban.
  - A `ReadClock` injektálható, a helyadat és a `uuidv7` viszont nem, ezért ezekhez `jest.mock` kell.

## Clean Code

**Erősségek:**

- egyetlen láncíró, mutex és tranzakciós határok
- közös tesztvektorok a láncra és a menetrendre
- típusos feliratkulcsok
- nincs beégetett szín, és nem találtunk beégetett magyar szöveget a kódban

**Gyengeségek:**

- 73 sor hosszabb 180 karakternél, a leghosszabb 259; nincs formázó
- 7 route-komponens 70–100 soros, a [round/[id].tsx](../src/app/%28guard%29/round/%5Bid%5D.tsx#L141) 28 helyi modult importál, és hatszintes ternáriót tartalmaz
- rossz helyen lévő segédek: `trustedNowMs` a `guard/home.ts`-ben, `userName` a `guard/login.ts`-ben, `routeNameAmongSeveral` a `guard/alarm.ts`-ben; a `use-scan-recorder` és a `use-pin-lock` nem navigáció
- mágikus szám: [rounds.ts:68](../src/domain/rounds.ts#L68)
- rejtett mellékhatás egy `map`-en belül: [shift.ts:206](../src/domain/shift.ts#L206)

## Megfelelés a specifikációnak

| Terület | Állapot |
|---|---|
| M1-01 – M1-07 | A kód és a tesztek megvannak; a „zöld” feltétel most a séma miatt nem teljesül |
| M1-08 | **Nem teljesült**, tudatos döntéssel lezárva |
| M3-01 – M3-38 | Funkcionálisan megvan, az 1. és a 2. hibával |
| M3-39 | **Nyitott**: a lefedettség rendben, a `typecheck` és a teszt piros |
| M3-40 | **Nyitott**: telefonos futás nem volt |
| Dokumentált eltérések | Kézi rögzítés útvonala, G4 az értesítés után, nincs full-screen intent, a `kern.bootsessionuuid` használata. Ezek rendben vannak |

**Kisebb eltérések:**

- Fejléc-szinkronjelző nincs a kézi képernyőn (dokumentált eltérés). A QR-képernyőn az alap `ScreenHeader` adja.
- A 29 commitüzenetből 16 magyar, 10 pedig csonka (`(G10, )`). Valószínűleg a shell nyelte el a backtickes részt. Az alapszabály angolt kér.
- A `dev` és `prototype` route-ok a release bundle-ben is benne vannak, csak a `Stack.Protected` zárja őket.
- Nincs CI, így a piros állapotot semmi sem jelzi automatikusan.

## Javasolt sorrend

1. **Friss `waypost-schema` kiadása**, verzióval és CHANGELOG-gal. Enélkül nincs zöld állapot.
2. **Az 1. és a 2. hiba javítása** regressziós teszttel:
   - **Időalap:** a projekció a bejegyzés saját `ref_*` és `uptime_ms` mezőiből számolja a megbízható időt. Ez sémaváltozás nélkül megoldható.
   - **Inaktív pont:** a feloldás előbb a nyitott körök verzióiban keressen, az `active` mezőtől függetlenül.
3. **A `chain → sync` él megszüntetése** az eseményre való feliratkozással, valamint a két típuskör és a `readiness.ts` rendezése. Együtt nagyjából egy kis PR, és ezután bekapcsolható az `import/no-cycle` lint.
4. **CI és Prettier:** `typecheck`, `lint`, `test:coverage`, plusz rétegszabály `no-restricted-imports`-szal.
5. **Hermes-mérés az M3-40 előtt.** Ha lassú, a menetrend-kibontás gyorsítótárazása és a slotok `Map`-be indexelése a megoldás. Az M4 előtt nem érdemes tovább finomítani.
6. **Refaktor az M5 előtt:** `useLiveQuery`, `usePinEntry`, közös űrlaphook, `withGuardState`, az egyetlen `normalizeTagUid`, a nézetmodellek kiemelése. Az M5 ugyanezeket a mintákat tovább szaporítaná.

## A vizsgálat korlátai

- **Eszközök:** a `madge` és a `jscpd` nem futott (az engedélyezés elutasította), ezért saját szkripttel mértük az importgráfot és a szó szerinti, 7 soros duplikációt. A szerkezeti duplikációt olvasással találtuk, így a lista nem teljes.
- **Alaposan olvasva:** `domain`, `chain`, `guard`, `sync`, `auth`, `alarms`, a natív óramodul és a fő képernyők.
- **Részben nézve:** `components`, `scan-result`, `shift-start`, a `dev` és `prototype` képernyők, a tesztek minősége.
- **Futtatás:** telefonon semmi nem futott. A hibákat ideiglenes tesztfájllal igazoltuk, amely a repóba nem került be.
