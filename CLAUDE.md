# waypost

A Waypost mobilapp (Expo / React Native, TypeScript): az őrök a telephelyi telefonon PIN-nel lépnek be, járőrköröket teljesítenek NFC-, QR- vagy kézi leolvasással, eseményt rögzítenek; a supervisorok a saját telefonjukon kezelik a telephelyeket, útvonalakat és menetrendeket. Offline működik, az adatot láncolt naplóba írja és szinkronizálja a `laravel-waypost` backenddel.

## Mérvadó dokumentumok

- Fejlesztői specifikáció: [`docs/Waypost – fejlesztői specifikáció (1. lépcső).md`](docs/Waypost%20–%20fejlesztői%20specifikáció%20(1.%20lépcső).md) – minden viselkedés, szabály és képernyő forrása. Ennek a repónak a fő szakaszai: *Repo és technológiai stack*, *Szinkron protokoll*, *Láncolt napló*, *Állapotgépek és üzleti szabályok*, *Mobilapp*.
- Feladatlista: [`docs/tasks.md`](docs/tasks.md) – ennek a repónak az M1, M3 és M5 mérföldkő, az M4 app-oldali feladatai és az M7 próbaidőszak szólnak. A nyitott kérdések (`Q#`) a fájl végén.
- Döntések: [`docs/decisions.md`](docs/decisions.md) – ami a specifikációban nincs eldöntve, ide kerül (dátum, kérdés, döntés, indok, érintett).
- Design: [`docs/orjarat-design-handoff/DESIGN_HANDOFF.md`](docs/orjarat-design-handoff/DESIGN_HANDOFF.md) – képernyők, témák, tokenek (`src/theme/tokens.ts` forrása); a `reference/` HTML-fájlok a képernyők mintái.
- A közös szerződés: `../waypost-schema` (`@waypost/schema`, `file:../waypost-schema`) – JSON Schemák, TS típusok, lánc- és menetrend-tesztvektorok. Ha az API vagy a lánc formátuma változik, **előbb ott** kell módosítani, új verzióval.

## Expo

- Expo SDK 58 (React Native 0.88, React 19.3). Az Expo minden SDK-val törő változásokat hoz: Expo- vagy RN-API használata előtt nézd meg a verziózott dokumentációt (`https://docs.expo.dev/versions/v58.0.0/`), ill. a `https://docs.expo.dev/llms.txt` indexet – ne emlékezetből dolgozz.
- Csomagot `npx expo install <csomag>` paranccsal telepíts (SDK-kompatibilis verziót választ); fejlesztői függőséget `npx expo install <csomag> -- --save-dev`-vel, és ellenőrizd, hogy a `devDependencies`-be került-e.
- Continuous Native Generation: az `android/` és `ios/` mappa generált (gitignore), kézzel nem szerkesztjük; a natív beállítás az `app.json`-ban és config pluginekben van.
- Expo Go nem elég (NFC, saját natív modul): development build kell (`eas.json` → `development` profil). Natív kód (`modules/`, natív csomag, config plugin) változása után új dev build kell; a JS-változás a Metro-ról frissül. A natív modulokat a Jest-tesztekben `jest.mock`-kal helyettesítjük.
- Azonosítók: név „Waypost”, bundle ID / package name `com.tamaslabs.waypost`, URL-séma `waypost`. Csak iOS és Android (nincs web).

## Szerkezet

```text
src/
  app/        # expo-router képernyők – csak route-fájl lehet benne (teszt, segéd nem); (auth)/ (guard)/ (supervisor)/, dev/ és prototype/ (M1 eszközpróbák) csak fejlesztői buildben
  navigation/ # melyik csoport nyitott az állapot szerint (Stack.Protected), kezdőképernyő
  components/ # közös UI-komponensek (DESIGN_HANDOFF 5); ikon: icon.tsx (lucide, ikononként importálva)
  api/        # API-kliens: client.ts (token, Idempotency-Key, típusos hibák, __DEV__ Ajv), endpoints.ts
  auth/       # secure store (tokenek, eszköztitok), indulási állapot, munkamenet (Zustand), hozzárendelés
  db/         # expo-sqlite + Drizzle: schema.ts, migrations/ (generált), kv.ts, testing.ts (better-sqlite3 a tesztekhez)
  id/         # uuidv7()
  time/       # időbélyeg, readClock() (waypost-clock), megbízható idő
  domain/     # üzleti szabályok (menetrend → körök, műszak, kör, leolvasás) – UI és I/O nélkül
  guard/      # a domain és az adatbázis között: a GuardState betöltése, az ütemező futtató; testing.ts (a domain-fixture az adatbázisban)
  sync/       # pull, push, outbox, média
  chain/      # láncbejegyzés: kanonikus JSON, HMAC
  nfc/        # olvasás (reader.ts), Androidon az app-szintű figyelés (tag-events.ts), useTagReader a kör és a betanítás képernyőjére
  qr/ alarms/ location/
  photo/      # fotó: tömörítés, SHA-256, fájl a dokumentumok media/ mappájában (a media sort a láncíró írja)
  feedback/   # leolvasási visszajelzés: rezgés és hang (siker / hiba / figyelmeztetés)
  theme/      # tokens.ts (a design tokenjei), theme-provider.tsx: ThemeProvider, useTheme(), useThemePreference()
  i18n/       # hu.json (minden felirat), index.ts: t(key, params)
modules/      # saját Expo-modulok: waypost-clock (getUptimeMs, getBootId, getGnssTimeMs), waypost-power (akkumulátor-optimalizálás, Android) – import: @modules/<név>
__tests__/    # képernyőtesztek; a modulok tesztjei a modul mellett: src/<modul>/*.test.ts
__mocks__/    # Jest: expo-secure-store memóriában (automatikus); jest.setup.ts: expo-crypto véletlenforrás, NetInfo, react-native-quick-crypto (node:crypto), expo-audio
assets/       # ikon, splash (egyelőre az Expo sablon helyőrzői), sounds/ (az ébresztés és a leolvasás hangjai, helyőrzők)
```

Importban a `@/…` alias a `src/…`-ra mutat.

## Szabályok

- A specifikáció *Alapszabályok* pontjai érvényesek, különösen:
  - A felület minden szövege magyar, a kód, az azonosítók, a kommentek és a commitüzenetek angolok.
  - Szín és méret csak a `src/theme/tokens.ts`-ből (`useTheme()`), felirat csak a `src/i18n/hu.json`-ból (`t('sync.offlineQueued', { count })`) – beégetett szín és szöveg nincs. A lint ezt az `src/`-ben ellenőrzi, a tesztfájlok kivételével (színliterál a stílusban, szöveg a JSX-ben vagy a `title`/`label`/`placeholder`/`accessibility*` propban). Új feliratot a `hu.json`-ba kell felvenni; a kulcs típusos (`TranslationKey`).
  - Betűtípus: Manrope (400–800), a `typography` skálából; számoknál `fontVariant: ['tabular-nums']` (DESIGN_HANDOFF 2.6).
  - Az eszközön létrejött adat a szinkron előtt soha nem módosul és nem törlődik.
  - A 2. lépcső funkcióit nem építjük meg, csak nem zárjuk ki.
- TypeScript `strict` és `noUncheckedIndexedAccess`; `any` helyett pontos típus vagy `unknown`.
- A hálózati és a lánc-adatok típusai a `@waypost/schema` típusai (`SyncPullResponse`, `ChainEntry`, `UnsignedChainEntry` …); ezeket nem írjuk újra. A lánc és a menetrend-kibontás tesztjei a `@waypost/schema/vectors` közös vektoraival futnak.
- Időbélyeg: ISO 8601, UTC, ezredmásodperccel; azonosító: UUIDv7; a láncolt adatban nincs lebegőpontos szám.
- Ha egy feladat lezárul: `npm run typecheck`, `npm run lint` és `npm test` zöld; a `docs/tasks.md`-ben pipa; az eldöntött kérdés a `docs/decisions.md`-be kerül.

## Parancsok

- `make` – a gyakori parancsok rövidítései (ellenőrzés, helyi Android-build EAS nélkül, adb); a lista: `make help`.
- `npm install` – függőségek (Node ≥ 22). A `@waypost/schema` symlink a `../waypost-schema`-ra; ott előbb `npm install` sem kell (nincs futásidejű függősége).
- `npm start` – Metro dev szerver a development buildhez.
- `npm run typecheck` – `tsc --noEmit`.
- `npm run lint` – `expo lint` (ESLint, `eslint-config-expo`).
- `npm test` – Jest (`jest-expo` preset). A `jest.modulePaths` azért kell, mert a symlinkelt `@waypost/schema` fájljait a Jest a valódi útvonalukon fordítja, és a Babel-segédeket innen kell feloldani. A `jest.moduleNameMapper` a lucide-ikonokat a CommonJS-változatukra irányítja (az ESM-változat a Jestben nem fut).
- `npx expo-doctor` – függőségek és konfiguráció ellenőrzése.
- `npm run db:generate` – a `src/db/schema.ts` változása után új migráció a `src/db/migrations/` alá (`drizzle-kit generate`); a generált fájlokat commitoljuk, kézzel nem szerkesztjük. A `.sql` fájlokat a `babel-plugin-inline-import` fordítja be; ha a Metro régi migrációt mutat, `npm start -- --clear`.
- API-cím: `EXPO_PUBLIC_WAYPOST_API_URL` (előtaggal, pl. `https://example.com/api/waypost/v1`); fejlesztői buildben a `/dev/enroll` képernyőn is megadható.
- Development build (Expo-fiók kell): `npx eas-cli@latest build --profile development --platform android` (ill. `ios`; ahhoz Apple Developer fiók és regisztrált eszköz kell).
