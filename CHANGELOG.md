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
- Függőség: `@react-native-community/netinfo` (natív: új development build kell).

### Módosítva

- Az M1 prototípus-képernyői csak fejlesztői buildben érhetők el, a „Fejlesztői eszközök” menüből.
