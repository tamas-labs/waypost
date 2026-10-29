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
- Függőség: `react-native-quick-crypto` (a `react-native-nitro-modules` és a `react-native-quick-base64` csomaggal; natív: új development build kell).

### Módosítva

- Az M1 prototípus-képernyői csak fejlesztői buildben érhetők el, a „Fejlesztői eszközök” menüből.
