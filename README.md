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

A telefonos elfogadás (M1-08) még nem futott le, a nyitott ellenőrzések a [`docs/decisions.md`](docs/decisions.md)-ben és a [`docs/device-test.md`](docs/device-test.md)-ben vannak. A következő mérföldkő az M3 (offline őr mód), lásd a [feladatlistát](docs/tasks.md).

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

Az elkészült dev buildet a telefonra telepítve az app a Metro szerverhez csatlakozik. A JS-változásokat a Metro frissíti. Ha a natív kód változik (a `modules/` mappa, egy natív csomag vagy egy config plugin), új dev build kell.

Az `android/` és `ios/` mappát az Expo generálja (Continuous Native Generation), ezért nincsenek a repóban. A natív beállítások az `app.json`-ban vannak.

## Parancsok

| Parancs | Mit csinál |
| --- | --- |
| `npm start` | Metro dev szerver a development buildhez |
| `npm run typecheck` | TypeScript-ellenőrzés (`tsc --noEmit`) |
| `npm run lint` | ESLint (`expo lint`), a beégetett színek és feliratok tiltásával |
| `npm test` | Jest (`jest-expo`) |
| `npx expo-doctor` | a függőségek és a konfiguráció ellenőrzése |

Egy feladat akkor kész, ha a `typecheck`, a `lint` és a `test` is zöld.

## Szerkezet

```text
src/
  app/        # expo-router képernyők; prototype/ = az M1 eszközpróbái
  db/         # helyi adatbázis (expo-sqlite + Drizzle) – M3
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
