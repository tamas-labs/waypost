# Waypost

A Waypost őrjárat-rendszer mobilappja (Expo / React Native, TypeScript, iOS és Android):

- az őrök a telephelyi telefonon PIN-nel lépnek be, járőrköröket teljesítenek NFC-, QR- vagy kézi leolvasással, és eseményt rögzítenek;
- a supervisorok a saját telefonjukon kezelik a telephelyeket, az útvonalakat és a menetrendeket.

Az app offline is működik. Az adatot láncolt naplóba írja, és szinkronizálja a [`laravel-waypost`](../laravel-waypost) backenddel. A két oldal közös szerződése a [`waypost-schema`](../waypost-schema) (`@waypost/schema`).

**Állapot:** az M1 mérföldkő (prototípus) kész. Az app most egy indítóképernyőből és négy eszközpróba-képernyőből áll:

- monoton óra és boot ID;
- NFC-olvasás;
- QR-olvasás;
- ébresztés.

A telefonos elfogadás (M1-08) még nem futott le, a nyitott ellenőrzések a [`docs/decisions.md`](docs/decisions.md)-ben és a [`docs/device-test.md`](docs/device-test.md)-ben vannak.

Az M3 (offline őr mód) folyamatban, lásd a [feladatlistát](docs/tasks.md). Az alapok készek: helyi adatbázis, azonosító- és idősegédek, secure store, API-kliens, az indulási állapotok szerinti navigáció (a képernyők még helyőrzők) és egy fejlesztői képernyő, amellyel a telefon egy telephelyhez rendelhető. A prototípus-képernyők és a fejlesztői eszközök csak fejlesztői buildben érhetők el (a kezdőképernyőkről: „Fejlesztői eszközök”).

## Dokumentáció

- [Fejlesztői specifikáció](docs/Waypost%20–%20fejlesztői%20specifikáció%20(1.%20lépcső).md) – minden viselkedés, szabály és képernyő forrása.
- [Feladatlista](docs/tasks.md) – mérföldkövek (M0–M7) és nyitott kérdések. Ehhez a repóhoz az M1, az M3, az M5, az M4 app-oldali feladatai és az M7 tartoznak.
- [Döntések](docs/decisions.md) – ami a specifikációban nem volt eldöntve.
- [Kézi eszközteszt](docs/device-test.md) – a mérföldkövenként telefonon végigfuttatandó ellenőrzések.
- [Design átadás](docs/orjarat-design-handoff/DESIGN_HANDOFF.md) – képernyők, témák, tokenek.
- [`CLAUDE.md`](CLAUDE.md) – a fejlesztési szabályok és konvenciók összefoglalója.

## Követelmények

- Node.js ≥ 22
- a `waypost-schema` repo a szomszédos könyvtárban (`../waypost-schema`), mert az app `file:` függőségként használja
- development build egy Android- vagy iOS-eszközre. Az Expo Go nem elég, mert az app NFC-t és saját natív modulokat használ. A buildhez Expo-fiók kell, iOS-re Apple Developer fiók és regisztrált eszköz is.

## Indítás

```sh
npm install
npx eas-cli@latest build --profile development --platform android   # vagy: --platform ios
npm start
```

Az API címét (előtaggal, pl. `https://example.com/api/waypost/v1`) az `EXPO_PUBLIC_WAYPOST_API_URL` környezeti változó adja; fejlesztői buildben a „Telefon hozzárendelése” fejlesztői képernyőn is megadható. Helyi backendhez: `laravel-waypost` workbench (`composer serve`, demóadatokkal).

A térképhez Androidon Google Maps-kulcs kell: `GOOGLE_MAPS_ANDROID_API_KEY` a `.env.local`-ban (EAS-en környezeti változóként), a csomagnévre és a tanúsítvány SHA-1-ére korlátozva. Kulcs nélkül a build működik, de a kör képernyőjén a térkép helyén üzenet áll. iOS-en nem kell kulcs.

Az elkészült dev buildet a telefonra telepítve az app a Metro szerverhez csatlakozik. A JS-változásokat a Metro frissíti. Ha a natív kód változik (a `modules/` mappa, egy natív csomag vagy egy config plugin), új dev build kell.

Az `android/` és `ios/` mappát az Expo generálja (Continuous Native Generation), ezért nincsenek a repóban. A natív beállítások az `app.json`-ban vannak, a környezettől függők az `app.config.ts`-ben.

## Parancsok

| Parancs | Mit csinál |
| --- | --- |
| `npm start` | Metro dev szerver a development buildhez |
| `npm run typecheck` | TypeScript-ellenőrzés (`tsc --noEmit`) |
| `npm run lint` | ESLint (`expo lint`), a beégetett színek és feliratok tiltásával |
| `npm test` | Jest (`jest-expo`) |
| `npx expo-doctor` | a függőségek és a konfiguráció ellenőrzése |
| `npm run db:generate` | új adatbázis-migráció a `src/db/schema.ts` változása után |

Egy feladat akkor kész, ha a `typecheck`, a `lint` és a `test` is zöld.

## Szerkezet

```text
src/
  app/        # expo-router képernyők: (auth)/, (guard)/, (supervisor)/; dev/ és prototype/ csak fejlesztői buildben
  navigation/ # melyik képernyőcsoport nyitott az indulási állapot szerint
  components/ # közös UI-komponensek
  api/        # API-kliens (token, Idempotency-Key, típusos hibák, sémaellenőrzés fejlesztői módban)
  auth/       # tokenek és eszköztitok (secure store), indulási állapot, telefon hozzárendelése
  db/         # helyi adatbázis (expo-sqlite + Drizzle): séma, migrációk, kv
  id/ time/   # UUIDv7; időbélyeg, monoton óra, megbízható idő
  domain/     # üzleti szabályok, UI és I/O nélkül – M3
  sync/       # pull, push, outbox, média – M3/M4
  chain/      # láncbejegyzés: kanonikus JSON, HMAC – M3
  nfc/ qr/ alarms/ location/
  theme/      # design tokenek, ThemeProvider, useTheme()
  i18n/       # hu.json (minden felirat), t()
modules/
  waypost-clock/   # getUptimeMs(), getBootId() – monoton óra és boot ID
  waypost-power/   # akkumulátor-optimalizálás (Android)
__tests__/    # képernyőtesztek; a modulok tesztjei a modul mellett vannak
docs/
```

A `@/…` import a `src/…`-ra, a `@modules/<név>` a `modules/<név>`-re mutat.

## Azonosítók

| | |
| --- | --- |
| Név | Waypost |
| Bundle ID / package name | `com.tamaslabs.waypost` |
| URL-séma | `waypost` |
| Platformok | iOS, Android (web nincs) |

## Változások

Lásd a [CHANGELOG.md](CHANGELOG.md)-t.
