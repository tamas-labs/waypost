# Changelog

Az app minden lényeges változása ebben a fájlban szerepel.

A formátum a [Keep a Changelog](https://keepachangelog.com/hu/1.1.0/) ajánlását követi, a verziózás [Semantic Versioning](https://semver.org/lang/hu/).

## [Unreleased]

### Hozzáadva

- Helyi SQLite-adatbázis (expo-sqlite + Drizzle) a szerver tábláinak tükrével, `chain_entries.synced_at`-tal, `outbox` és `kv` táblával; a migrációk induláskor futnak (M3-01).
- UUIDv7-generátor, ISO 8601 UTC időbélyegek, a monoton óra olvasása és a megbízható idő becslése az utolsó szerveridőből (M3-02).
- A supervisortoken, az eszköztoken és az eszköztitok tárolása a secure store-ban (M3-03).
- API-kliens: Bearer token, `Idempotency-Key` minden író kérésnél, típusos hibák, fejlesztői módban sémaellenőrzés (M3-04).
- Indulási állapotok (hozzárendeletlen, telephelyi telefon, supervisor telefonja) és a navigáció váza: `(auth)`, `(guard)`, `(supervisor)` csoportok, egyelőre helyőrző képernyőkkel (M3-05).
- Fejlesztői képernyő a telefon telephelyhez rendeléséhez (M3-06).
- Pull: lapozás a kurzorral, az összes oldal egy tranzakcióban (upsert, törlés, `reset`), a kurzor és a szerveridő mentése, esemény a többi modulnak (M3-07).
- Szinkron-vezérlő: egyszerre egy szinkron, push → média → outbox → pull sorrend, 2 mp-es összevont késleltetés láncbejegyzés után; indítók: indulás, előtérbe kerülés, hálózat visszatérése, 5 percenként előtérben, munkamenet-váltás (M3-08).
- Szinkronállapot-tár: online/offline, feltöltetlen tételek, utolsó sikeres szinkron, utolsó hiba, „Szinkron most” (M3-09).
- Kanonikus JSON (RFC 8785, a Waypost szűkítéseivel): lebegőpontos számra és magányos surrogate-re kivétel; a közös tesztvektorok bájtra egyeznek (M3-10).
- Láncíró: HMAC-SHA256 az eszköztitokkal, `seq` 1-től hézag nélkül egy globális írási zár alatt, `prev_hash`, órák és szinkronreferencia; a bejegyzések és a vetületeik (műszak, kör, leolvasás, esemény) egy tranzakcióban (M3-11).
- Bejegyzés-építők a hat típushoz: koordináta `lat_e7` / `lng_e7`, pontosság `accuracy_dm`, `media: [{id, sha256}]`, jelölések (M3-12).
- Menetrend-kibontás a telephely időzónájában (lista, intervallum, éjfélen átnyúló ablak, `weekdays` a kezdő napra, DST a Q5 szerint); a közös tesztvektorok zöldek (M3-13).
- Időkeret-alapérték és a kör határideje (M3-14).
- PIN-ellenőrzés offline (PBKDF2, a közös vektorokkal), 5 hiba után 5 perc zárolás, utána duplázódó; a zárolás újraindítás után teljes időtartammal újraindul (M3-15).
- Műszak-állapotgép: kezdés, folytatás, váltás másik őrre, zárás az őr döntésével és automatikusan (M3-16).
- Kör-állapotgép és ütemező lépés: esedékes és kimaradt körök megnyitása, zárás határidőnél vagy a következő időpontnál, útvonalanként egy nyitott kör (M3-17).
- Leolvasás feloldása (NFC, QR) és jelölései: ismeretlen címke, ismétlés, körön kívül, rossz sorrend, kör teljesítése (M3-18).
- Kézi rögzítés (leolvasás + sérült címke esemény) és esemény a legközelebbi ponttal (M3-19).
- Ütemező futtató: a kör-ütemező lépése induláskor, előtérbe kerüléskor, értesítéskor és előtérben 30 másodpercenként, a megbízható idővel; az állapot beolvasása és a bejegyzések írása egy záron belül, így egy kör nem nyílhat kétszer; az automatikus műszakzárás azonnal szinkronizál (M3-23).
- Ébresztés-ütemezés: a következő 36 óra köreinek értesítése és 5 perces emlékeztetője, legfeljebb 48; a lista cseréje induláskor, pull után, értesítéskor, előtérbe kerüléskor, a műszak és a kör indulásakor és zárásakor, csak az eltérő értesítéseket érintve; a megbízható időből számolva, a telefon órájához igazítva (M3-24).
- Helyadat a leolvasáshoz (legfeljebb 60 mp-es utolsó ismert hely, különben legfeljebb 5 mp várakozás; Androidon hamisított hely és GNSS-idő), fotó (csak kamera, 1600 px, JPEG 0,7, SHA-256; a `media` sor a bejegyzéssel együtt), app-szintű NFC-figyelés Androidon (a címke csak a kör és a betanítás képernyőjén számít), leolvasási visszajelzés rezgéssel és hanggal; próbaképernyő „Helyadat, fotó, visszajelzés” (M3-20 – M3-22).
- Függőség: `@react-native-community/netinfo` (natív: új development build kell).
- Függőség: `expo-location`, `expo-image-manipulator`, `expo-file-system`, `expo-haptics`, `expo-audio` (és a peer függősége, `expo-asset`); a `waypost-clock` modulban új `getGnssTimeMs` (natív: új development build kell).
- Fejlesztői módban az API-kliens figyelmeztet, ha a szerver `X-Waypost-Schema` fejléce más `@waypost/schema` major- vagy minorverziót mond, mint amivel az app épült.
- Függőség: `react-native-quick-crypto` (a `react-native-nitro-modules` és a `react-native-quick-base64` csomaggal; natív: új development build kell).
- Önálló Android-telepítő Metro és EAS nélkül: `make standalone API_URL=…` (a cím a JS-csomagba égetve; `http://` címnél titkosítatlan forgalom Androidon), `make install-standalone`.
- Supervisorok a telephely őrei között: lista, PIN-csere, felfüggesztés, új supervisor (név, e-mail-cím, jelszó, PIN) és más telephely supervisorának hozzárendelése (WP-APP-007).
- Helyi hibanapló: az utolsó 50 háttérhiba a „Telefon beállítása” képernyőn, és a gyökér `ErrorBoundary` (WP-APP-008).
- Újra-bejelentkezés a supervisor telefonján, ha a szerver a tokent nem fogadja el (401): a fiók adatai és a várakozó módosítások megmaradnak (WP-APP-016).
- Ha a szerver a push kötegének első bejegyzését `422`-vel elutasítja, a szinkronjelző megmondja, hogy a feltöltés elakadt, és az app bejegyzésenként egyszer diagnosztikát küld (`validation_failed`, legalább 0.9.0-s szervernek), így a jelentés is jelzi (FR-013).
- A jelentésbeállításokon a havi jelentés lemondásakor az app megmondja, hogy a 62 napos megőrzés még 62 napig érvényes (FR-007, WP-BE-039).
- Teszt: az app útvonaltáblája (`src/api/endpoints.ts`, `config-calls.ts`) a `@waypost/schema` `endpoints.json`-jával összevetve: metódus, útvonal, kérés- és válaszséma, query, `Idempotency-Key` (FR-005).
- Teszt: a válaszsémák minden érvényes példája egy hozzáadott mezővel és ismeretlen enum-értékkel is átmegy a türelmes ellenőrzőn, ahogy egy újabb szerver minor bővítése érkezne (FR-017).
- A CI az `npx expo-doctor`-t is futtatja, rögzített verzióval (1.21.6; az 1.21.7 hibásan jelent meg) (FR-016, WP-APP-017).

### Biztonság

- Az új supervisor jelszava nem kerül a telefon adatbázisába: az outbox-hívás titkos mezőjeként a secure store-ban vár (`…_THIS_DEVICE_ONLY`, nem kerül mentésbe), és a hívás sikere vagy elutasítása után törlődik. Új adatbázis-migráció: `outbox.secret` (FR-012).
- Androidon `android.allowBackup: false`: az adatbázis és a fotók nem kerülnek a mentésbe (WP-APP-019).
- A CI az `npm audit --omit=dev --audit-level=high` paranccsal megállítja a high vagy critical hibás függőséget (WP-APP-018).

### Javítva

- Egy szinkronlépés tartós hibája (pl. egy tartósan elutasított push-köteg, egy fotó 5xx-e) nem állítja meg az outboxot és a pullt; a push `422`-jénél a hibás bejegyzés előtti rész felmegy; a láncíró minden buildben ellenőrzi a bejegyzés sémáját (WP-APP-002).
- Ébresztések: iOS-en legfeljebb 48, Androidon 192, emlékeztető csak a következő 4 körhöz, így sűrű menetrendnél is több óra fedett (WP-APP-003).
- Az azonos kezdő- és záróidejű menetrend nem akasztja el az ütemezőt (WP-APP-010).
- A leolvasás az érintés pillanatáé, nem a helyadat megérkezéséé; a közben érintett másik címke sorba áll, nem vész el (WP-APP-011).
- A telefon hozzárendelése egy megszakadás után sem veszíti el az eszköztitkot (WP-APP-014).
- Egy elutasított létrehozás a rá épülő várakozó hívásokat is viszi, egy jelzéssel (WP-APP-015).
- A push válasza éles buildben is ellenőrzött, türelmesen: az ismeretlen mező és felsorolásérték nem hiba (WP-APP-020).
- Az első androidos eszközteszt (360 dp) hibái: kétsoros fejléc, a billentyűzet nem takarja az űrlapot, a kilépés kérdése nem rakódik egymásra (és nem omlik össze az útvonal szerkesztése) (2026-11-10).
- A push válaszában egy ismeretlen elutasítási kód (egy újabb szerver minor bővítése) éles buildben nem állítja meg a láncfeltöltést: a bejegyzés a többi elutasítotthoz hasonlóan kerül kezelésre (FR-002).
- A lánc írója nem ír meg olyan bejegyzést, amelyben ugyanaz a fotó kétszer szerepel; a szerver ezt elutasítaná (FR-003, `waypost-schema` SCH-016).
- A tesztek a lánc `normalized` és `invalid` tesztvektorait is futtatják (FR-004).
- Az ébresztés hangjának és rezgésének, valamint a leolvasás visszajelzésének hibája a helyi hibanaplóba kerül (a visszajelzésé futásonként és fajtánként egyszer); eddig csak fejlesztői buildben látszott (FR-020).

### Módosítva

- A `waypost-schema` várt verziója `v0.9.1` (`.waypost-schema-version`).
- A mappák közötti függőségi kör megszűnt (`src/account`, `src/setup`, `src/device/secret.ts`), két új lint-rétegszabállyal (WP-APP-006).
- A `src/components` réteg nem éri el az adatbázist, az API-t és a fiók folyamatait (lint-szabály): az újra-bejelentkezés a `useRenewLogin` hookba került, a betanítás mentését a képernyő adja a `FinishSheet`-nek (FR-022).
- A szinkron órája beadható (`startSync(db, { readClock })`); a visszavont telefon tesztjei ezzel futnak a `Date.now` felülírása helyett (FR-023).
- Közös nézetelemek (`Sheet`, `SectionTitle`), a nagy képernyők részei a `src/components` alá kerültek (WP-APP-009).
- 20 csomag az SDK 58 által várt verzióra frissült, köztük a `react-native` 0.88.1: **új development build kell** (WP-APP-017).
- Az M1 prototípus-képernyői csak fejlesztői buildben érhetők el, a „Fejlesztői eszközök” menüből.
