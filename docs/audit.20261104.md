# WAYPOST – TELJES KÖRŰ KÓDMINŐSÉGI ÉS SPECIFIKÁCIÓS AUDIT

## 1. Az audit célja

Végezz teljes körű, kritikus szemléletű műszaki auditot a `waypost` projekten.

A projekt egy Expo / React Native alapú, TypeScript nyelven fejlesztett offline-first mobilalkalmazás, amely Android és iOS platformon működik.

Az audit elsődleges céljai:

1. A fejlesztés minőségének és a kód architekturális állapotának felmérése.
2. A Clean Code és SOLID elvek érvényesülésének ellenőrzése.
3. A specifikációban meghatározott funkciók megvalósulásának ellenőrzése.
4. A hiányzó, hibás, részleges vagy nem megfelelően implementált funkciók azonosítása.
5. A potenciális működési, adatkezelési, biztonsági és teljesítményproblémák feltárása.
6. A későbbi fejlesztések szempontjából problémás megoldások azonosítása.
7. A megfelelően megvalósított részek és a követendő architekturális megoldások dokumentálása.

**Fontos: ez audit, nem refaktorálási vagy fejlesztési feladat.**

Ne módosítsd a forráskódot, ne javítsd ki a hibákat, ne alakítsd át az architektúrát. Kizárólag vizsgáld meg és dokumentáld a tapasztalatokat.

## 2. A vizsgálat alapjául szolgáló dokumentumok

Elsődleges referencia:

`Waypost – fejlesztői specifikáció (1. lépcső).md`

A teljes dokumentumot olvasd el, ne csak a technológiai leírást és a képernyők felsorolását.

Különösen fontos fejezetek:

- Repo és technológiai stack
- Adatbázis
- Azonosítás
- API-szerződés
- Szinkron protokoll
- Láncolt napló
- Állapotgépek és üzleti szabályok
- Mobilapp
- Tesztelés és a 2. lépcső előkészítése
- Mérföldkövek

A specifikáció az elsődleges igazodási pont. Ne tekints egy funkciót megfelelően implementáltnak pusztán azért, mert létezik hozzá képernyő, komponens vagy függvény.

A tényleges működést és a specifikációban leírt viselkedést hasonlítsd össze.

A `waypost-schema` projektet is vizsgáld meg, amennyiben hozzáférhető, különösen az API-sémák, a láncbejegyzések és a közös tesztvektorok tekintetében.

A backend belső implementációja nem tartozik ennek az auditnak a hatókörébe. Az alkalmazás és a backend közötti szerződés helyességét azonban ellenőrizni kell.

## 3. Architektúra és kódstruktúra

Vizsgáld meg a projekt teljes könyvtárstruktúráját és az egyes modulok felelősségi köreit.

Ellenőrizd:

- Megfelelő-e a rétegek szétválasztása.
- Egyértelműek-e a modulok felelősségi körei.
- Megfelelő-e a `src/domain`, `src/db`, `src/sync`, `src/chain`, `src/nfc`, `src/qr`, `src/alarms` és `src/location` felosztás.
- A domain logika valóban független-e a UI-tól és a platformspecifikus implementációktól.
- A képernyők nem tartalmaznak-e indokolatlanul sok üzleti logikát.
- Nincsenek-e túlméretezett komponensek vagy szolgáltatások.
- Megfelelő-e a függőségek iránya.
- Vannak-e körkörös modul- vagy függőségi hivatkozások.
- Vannak-e indokolatlanul szoros függőségek.
- Megfelelő-e az interfészek és absztrakciók használata.
- Nem alakult-e ki szükségtelenül bonyolult architektúra.

Ellenőrizd a SOLID elvek érvényesülését:

- Single Responsibility Principle
- Open/Closed Principle
- Liskov Substitution Principle
- Interface Segregation Principle
- Dependency Inversion Principle

Vizsgáld a Clean Architecture, DRY, KISS és Separation of Concerns elvek alkalmazását is.

Minden megállapítást konkrét forráskóddal támassz alá.

## 4. Kódminőség és kódolási szabványok

Vizsgáld meg:

- TypeScript strict mód megfelelő használatát.
- Az `any` és indokolatlan típuskonverziók használatát.
- A típusbiztonságot és a típusdefiníciók következetességét.
- Az elnevezési konvenciókat.
- A függvények és osztályok méretét, komplexitását.
- A kód olvashatóságát és karbantarthatóságát.
- A hibakezelés következetességét.
- A kivételkezelés minőségét.
- A duplikált kódokat és üzleti logikát.
- A magic number és magic string használatát.
- A felesleges absztrakciókat.
- Az elavult, nem használt vagy elérhetetlen kódokat.
- A TODO, FIXME és hasonló jelöléseket.
- A kommentek és a tényleges működés közötti esetleges eltéréseket.
- A konfigurációs értékek megfelelő központosítását.

Külön figyelj arra, hogy ugyanaz az üzleti szabály ne legyen több helyen, egymástól eltérő implementációval megvalósítva.

## 5. Specifikációs megfelelőség – funkcionális audit

A specifikáció minden releváns követelményét vizsgáld meg egyenként.

Készíts követelményenkénti megfelelőségi táblázatot.

Lehetséges állapotok:

- MEGFELELŐ – a követelmény bizonyíthatóan megvalósult.
- RÉSZLEGES – a funkció csak részben működik vagy hiányos.
- NEM MEGFELELŐ – a megvalósítás eltér a specifikációtól.
- HIÁNYZIK – nincs implementáció.
- NEM ELLENŐRIZHETŐ – a rendelkezésre álló kód vagy környezet alapján nem állapítható meg.

### 5.1. Alkalmazásindítás és azonosítás

Ellenőrizd:

- Az alkalmazás három lehetséges indulási állapotát.
- Supervisor online belépését.
- Telephelyi telefon PIN-belépését.
- Supervisor saját telefonjának működését.
- Eszköz hozzárendelését.
- Tokenek és titkos kulcsok Secure Store-ban történő tárolását.
- Supervisor token törlését eszközhozzárendelés után.
- PIN ellenőrzését PBKDF2-HMAC-SHA256 segítségével.
- PIN-próbálkozások korlátozását.
- Uptime-alapú zárolási idő mérését.
- Supervisor és guard módok megfelelő elkülönítését.

### 5.2. SQLite és adatkezelés

Ellenőrizd:

- Drizzle ORM használatát.
- A migrációk helyességét és automatikus futtatását.
- A táblastruktúrák megfelelőségét a specifikációnak.
- UUIDv7 azonosítók használatát.
- A helyi adatbázis és a szerver adatmodelljének összhangját.
- Az outbox és kv táblák kezelését.
- A tranzakciók helyességét.
- A párhuzamos írások kezelését.
- Az adatkonzisztenciát.
- A hibás vagy félbeszakadt tranzakciók kezelését.
- Az adatmegőrzési szabályokat.
- Az adatok véletlen vagy idő előtti törlésének lehetőségét.

Kiemelten fontos követelmény: az eszközön keletkezett adat a szinkronizálás előtt nem módosulhat és nem törlődhet a specifikációban meghatározott szabályokon kívül.

### 5.3. Domain és állapotgépek

Ellenőrizd a következő üzleti folyamatokat:

- Menetrendek kibontása.
- Nyári és téli időszámítás kezelése.
- Éjfélen átnyúló intervallumok.
- Műszakkezdés.
- Műszak folytatása.
- Műszakváltás.
- Műszak kézi lezárása.
- Automatikus műszaklezárás.
- Körök automatikus megnyitása.
- Kimaradt körök utólagos kezelése.
- Körök határidőkezelése.
- Körök automatikus lezárása.
- Útvonalverziók rögzítése a kör megnyitásakor.
- Ismételt leolvasások kezelése.
- Kötött és szabad útvonalsorrend.
- Körön kívüli leolvasás.
- Ismeretlen címke.
- Kézi leolvasás.
- Eseményrögzítés.

A domain logikának tiszta TypeScript függvényekben kell működnie, UI-függőség nélkül.

Ellenőrizd, hogy ez ténylegesen megvalósul-e.

### 5.4. Láncolt napló és kriptográfia

Ez a rendszer egyik legkritikusabb eleme.

Ellenőrizd:

- A monoton óra használatát.
- A boot ID kezelését.
- Az uptime mérését.
- A láncbejegyzések folyamatos sorszámozását.
- A seq kiosztásának konkurenciabiztos működését.
- A prev_hash megfelelő előállítását.
- A HMAC-SHA256 számítás helyességét.
- A canonical_json RFC 8785 szerinti előállítását.
- A null mezők kezelését.
- A lebegőpontos értékek kizárását.
- A hash-elt payload stabilitását.
- A fotók SHA256 lenyomatának kezelését.
- A láncbejegyzés és a vetületrekord tranzakciós létrehozását.

Vizsgáld meg, hogy az implementáció megfelel-e a `waypost-schema` közös tesztvektorainak.

Ne elégedj meg azzal, hogy létezik HMAC-ot előállító függvény. Ellenőrizd a teljes folyamatot.

### 5.5. Szinkronizáció

Ellenőrizd:

- A push/pull folyamatokat.
- A szinkronizáció kizárólagos futását biztosító mutexet.
- A helyes szinkronizációs sorrendet.
- A push kötegméretét.
- Az idempotencia kezelését.
- Az elfogadott rekordok nyugtázását.
- A hiányzó médiafájlok kezelését.
- A médiafeltöltés sorrendjét.
- Az outbox FIFO működését.
- Az exponenciális újrapróbálkozást és jittert.
- A 4xx, 401, 429 és 5xx válaszok kezelését.
- A hálózati megszakításokat.
- A részleges sikereket.
- A pull lapozását.
- A kurzor mentését.
- A törölt rekordok kezelését.
- A konfigurációs adatok tranzakciós frissítését.
- Az app előtérbe kerülésekor és hálózatváltozáskor történő szinkront.

Különösen keresd az adatvesztéshez, duplikációhoz vagy végtelen újrapróbálkozáshoz vezető hibákat.

### 5.6. NFC és QR

Ellenőrizd:

- Android NFC-előolvasás működését.
- iOS NFC-munkamenet indítását.
- NFC UID formázását.
- NDEF tartalom kiolvasását.
- A címkékre történő írás kizárását.
- A megfelelő képernyőhöz kötött NFC-kezelést.
- QR-kódok olvasását.
- A `waypost:cp:` prefix ellenőrzését.
- A QR payload feloldását.
- Ismeretlen címkék kezelését.
- Sikeres és sikertelen leolvasások visszajelzését.

Vizsgáld a platformspecifikus kódok és a közös üzleti logika szétválasztását.

### 5.7. Értesítések és háttérfolyamatok

Ellenőrizd:

- A következő 36 óra köreinek ütemezését.
- A maximum 48 értesítés kezelését.
- A körönkénti két értesítést.
- Az emlékeztetők törlését.
- Az értesítések újraütemezését.
- Az Android pontos riasztásait.
- Az Android értesítési csatornáját.
- Az iOS Time Sensitive Notifications használatát.
- Az értesítésekre történő navigációt.
- Az alkalmazás újraindítása utáni helyreállítást.
- Az alkalmazás háttérbe kerülésekor fellépő problémákat.
- Az ütemező lépés működését.
- Az időzítési versenyhelyzeteket.

Ne feltételezd, hogy egy értesítési API meghívása bizonyítja a tényleges, operációs rendszeren keresztüli megbízható működést.

### 5.8. Supervisor felület

Ellenőrizd a következő funkciókat:

- Telephelyek kezelése.
- Telefon hozzárendelése.
- Telefon beállítási ellenőrzőlistája.
- Betanítás.
- Útvonal szerkesztése.
- Útvonalverziók létrehozása.
- Pontok hozzáadása és eltávolítása.
- Pontok sorrendezése.
- QR-kód megjelenítése és nyomtatása.
- Menetrendek kezelése.
- Őrök és supervisorok kezelése.
- PIN generálása és cseréje.
- Jelentés-előfizetések kezelése.
- Offline módosítások outboxba helyezése.

Ellenőrizd azt is, hogy egy telephely valóban teljes egészében beállítható-e a mobilalkalmazásból.

### 5.9. UI és UX

Vizsgáld meg:

- Az expo-router navigációját.
- Az auth, guard és supervisor útvonalcsoportokat.
- A magyar nyelvű felületi szövegeket.
- A szinkronállapot jelzőjét.
- Az offline állapot egyértelmű megjelenítését.
- A betöltési állapotokat.
- A hibaüzeneteket.
- A visszajelzéseket.
- A felhasználói műveletek megerősítését.
- A navigációs hibákat.
- Az elérhetőségi és használhatósági problémákat.
- A különböző képernyőméretek kezelését.

## 6. Biztonsági audit

Külön vizsgálatot kérek a biztonságra.

Ellenőrizd:

- A titkos kulcsok biztonságos tárolását.
- A tokenek kezelését.
- A PIN-adatok védelmét.
- A Secure Store használatát.
- Az érzékeny adatok naplózását.
- A fotók kezelését.
- Az API-hívások hitelesítését.
- A jogosultságok kliensoldali ellenőrzésének helyességét.
- A nem megbízható API-válaszok kezelését.
- A JSON-adatok validálását.
- A potenciális injection és adatmanipulációs lehetőségeket.
- A hibakezelés során kiszivárgó érzékeny adatokat.
- A függőségek ismert sérülékenységeit.

Különböztesd meg a valódi biztonsági problémákat a pusztán elméleti kockázatoktól.

## 7. Teljesítmény és stabilitás

Vizsgáld:

- Felesleges React rendereléseket.
- Nem megfelelő hook-használatot.
- Memóriaszivárgásokat.
- Nem megfelelő event listener kezelést.
- Elfelejtett cleanup műveleteket.
- Nagy SQLite lekérdezéseket.
- Indexek hiányát.
- Felesleges adatbázis-műveleteket.
- Nagy objektumok és képek memóriaigényét.
- A kamera és NFC erőforrásainak felszabadítását.
- Hosszú ideig futó feladatokat.
- Párhuzamos aszinkron műveletek problémáit.
- Alkalmazás-összeomláshoz vezető hibákat.

## 8. Tesztelési audit

Vizsgáld meg az összes meglévő tesztet.

Ellenőrizd:

- Jest konfiguráció.
- Unit tesztek.
- Integrációs tesztek.
- Domain tesztek.
- Lánc tesztek.
- Szinkronizációs tesztek.
- Mockok helyessége.
- Edge case-ek.
- Hibás bemenetek.
- Versenyhelyzetek.
- Offline működés.
- Időzóna- és DST-tesztek.

A specifikáció szerint legalább 90%-os tesztlefedettség szükséges a következő modulokra:

- `src/domain`
- `src/chain`
- `src/sync`

Ellenőrizd a tényleges lefedettséget, ne csak a konfigurációban megadott elvárást.

Vizsgáld meg, hogy a tesztek valóban a működést ellenőrzik-e, vagy csak a kód lefedettségének növelését szolgálják.

Ahol lehetséges, futtasd:

- TypeScript typecheck
- ESLint
- Jest
- Coverage riport
- Dependency és circular dependency ellenőrzések

A tesztfuttatás során ne módosítsd a projekt állományait a generált, átmeneti teszteredményeken kívül.

## 9. Függőségek és csomagkezelés

Ellenőrizd:

- package.json tartalmát.
- A függőségek indokoltságát.
- A nem használt csomagokat.
- A duplikált funkciójú csomagokat.
- Az elavult vagy sérülékeny verziókat.
- Az Expo SDK kompatibilitását.
- A React Native natív modulok kompatibilitását.
- A dependency lockfile konzisztenciáját.
- A saját natív modul helyes integrációját.

## 10. A 2. lépcső előkészítése

A 2. lépcső funkcióit nem szabad most megvalósítani.

Ellenőrizd, hogy a jelenlegi architektúra nem akadályozza-e a későbbi bővítést:

- SOS funkció.
- Élő helymeghatározás.
- Élő riasztások.
- Diszpécserfelület.
- Push értesítések.
- WebSocket-alapú kommunikáció.

Ne javasold ezek előre történő implementálását. Csak az esetleges architekturális akadályokat dokumentáld.

## 11. Hibák osztályozása

Minden feltárt problémát sorolj be az alábbi kategóriák egyikébe:

**CRITICAL**
- Adatvesztés.
- Adatintegritás sérülése.
- Kritikus biztonsági probléma.
- A rendszer alapvető működését ellehetetlenítő hiba.

**HIGH**
- Fontos funkció hibás vagy hiányzó működése.
- Offline működés sérülése.
- Szinkronizációs hiba.
- Jelentős adatkonzisztencia-probléma.
- Komoly architekturális hiba.

**MEDIUM**
- Részleges specifikációs eltérés.
- Karbantarthatósági probléma.
- Jelentős kódduplikáció.
- Nem megfelelő hibakezelés.
- Tesztelési hiányosság.

**LOW**
- Kisebb kódminőségi probléma.
- Elnevezési vagy dokumentációs hiányosság.
- Kisebb refaktorálási lehetőség.

**INFO**
- Nem hiba, de megfontolandó fejlesztési javaslat.

## 12. Az audit eredményének formátuma

Készíts részletes auditjelentést az alábbi szerkezettel.

### A. Vezetői összefoglaló

- Általános értékelés.
- A projekt műszaki állapota.
- A specifikációs megfelelőség összesített képe.
- Legfontosabb kockázatok.
- A projekt jelenlegi állapota alapján javasolt továbblépés.

### B. Pozitív megállapítások

Sorold fel azokat a megoldásokat, amelyek:
- jól vannak megvalósítva;
- követik a specifikációt;
- jó architekturális döntések;
- tiszta, karbantartható kódot eredményeznek;
- hosszú távon is megtarthatók.

Minden fontosabb megállapítást konkrét fájl- és sorszámhivatkozással támassz alá.

### C. Specifikációs megfelelőségi mátrix

Minden követelményhez add meg:

| Követelmény | Állapot | Érintett fájlok | Megjegyzés |
|---|---|---|---|

Ne hagyj ki követelményeket.

### D. Hibajegyzék

Minden hibát külön azonosítóval dokumentálj.

Formátum:

**WP-APP-001 – [Rövid hiba megnevezése]**

- Súlyosság:
- Kategória:
- Érintett fájl:
- Sorszám:
- Probléma leírása:
- Miért probléma?
- Milyen következménye lehet?
- Kapcsolódó specifikációs követelmény:
- Javasolt megoldás:
- Javítási prioritás:
- Bizonyosság: bizonyított / valószínű / vizsgálandó.

Minden hibánál konkrét kódrészletre vagy végrehajtással igazolt viselkedésre hivatkozz.

Ne hozz létre kitalált hibákat, és ne minősíts valamit hibának pusztán azért, mert más megoldást is el tudsz képzelni.

### E. Architekturális értékelés

- Rétegek szétválasztása.
- SOLID megfelelőség.
- Függőségi struktúra.
- Körkörös hivatkozások.
- Kódduplikáció.
- Túlzott komplexitás.
- Refaktorálási lehetőségek.

### F. Tesztelési eredmények

- Lefutott tesztek.
- Sikertelen tesztek.
- Lefedettség.
- Hiányzó tesztek.
- Nem megfelelő tesztek.
- Nem ellenőrizhető területek.

### G. Javasolt javítási sorrend

Készíts prioritási listát, amely a kritikus problémáktól halad a kisebb minőségi javítások felé.

Minden javításnál jelöld:
- Mit kell javítani?
- Miért?
- Mely modulokat érinti?
- Van-e függősége más javításoktól?
- Milyen teszttel igazolható a javítás?

### H. Összesített értékelés

Adj külön értékelést az alábbi területekre:

| Terület | Értékelés (0–10) |
|---|---:|
| Specifikációs megfelelőség | |
| Architektúra | |
| Clean Code | |
| SOLID | |
| TypeScript típusbiztonság | |
| Adatkezelés | |
| Szinkronizáció | |
| Kriptográfia és adatvédelem | |
| Hibakezelés | |
| Tesztelhetőség | |
| Teljesítmény | |
| Karbantarthatóság | |
| Bővíthetőség | |

Az értékeléshez minden esetben adj rövid indoklást.

## 13. Fontos auditálási szabályok

1. A teljes projektet vizsgáld meg, ne csak a főbb könyvtárakat.
2. Ne elégedj meg a fájlnevek és függvénynevek alapján történő következtetéssel.
3. A tényleges implementációt vizsgáld.
4. Ha lehetséges, futtass teszteket és statikus ellenőrzéseket.
5. Ne tekints egy tesztet bizonyítéknak arra, hogy a teljes funkció hibátlan.
6. Ne tekints egy hiányzó tesztet automatikusan működési hibának.
7. A bizonyítható tényeket válaszd el a feltételezésektől.
8. Minden fontos megállapításhoz adj fájl- és sorszámhivatkozást.
9. Ha egy követelmény nem ellenőrizhető, ezt egyértelműen jelezd.
10. Ne javítsd ki a feltárt problémákat.
11. Ne készíts automatikusan refaktorálást.
12. Ne változtass konfigurációt vagy függőségeket.
13. Ne módosítsd a specifikációt.
14. Ne implementáld a 2. lépcső funkcióit.

**Az audit végén ne azt mondd meg, hogy szerinted jó-e a projekt, hanem adj bizonyítékokon alapuló, részletes műszaki értékelést.**

A cél egy olyan hibalista és megfelelőségi dokumentáció elkészítése, amely alapján a fejlesztési hiányosságok egyenként, ellenőrizhetően javíthatók.
