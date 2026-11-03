# Waypost – kézi eszközteszt

Minden mérföldkő végén egy Androidon és egy iPhone-on végig kell futtatni (specifikáció: *Tesztelés / Kézi eszközteszt*). Csak az a tétel kerül sorra, amelynek a funkciója már elkészült (a „Mióta” oszlop mutatja).

Hogyan használd:

1. A **Futások** táblába új sor kerül telefononként: dátum, telefon, OS-verzió, app-build (EAS build-azonosító vagy git commit).
2. Az **Eredmények** alatt a futás saját táblát kap (a sablont másold le). Eredmény: `✅` jó · `❌` hibás · `–` nem vonatkozik rá / nem futott. Hibánál a megjegyzésbe a pontos jelenség kerül (mit csináltál, mit vártál, mi történt).
3. **Ha az M1 valamelyik tétele `❌`: STOP.** A munka megáll, és a specifikációt kell módosítani (M1-08).

## Futások

| Dátum | Mérföldkő | Telefon | OS-verzió | App-build | Tesztelő |
| --- | --- | --- | --- | --- | --- |
| | M1 | Android: | | | |
| | M1 | iPhone: | | | |
| | M3 | Android: | | | |
| | M3 | iPhone: | | | |
| | M4 | Android: | | | |
| | M4 | iPhone: | | | |

## Ellenőrzések

### Állandó lista (specifikáció)

| # | Ellenőrzés | Mióta |
| --- | --- | --- |
| Á1 | Ébresztés zárolt képernyőn, némított telefonon és bezárt appal. | M1 (próbasorozat), M3 (valódi körök) |
| Á2 | Újraindítás műszak közben: a műszak folytatódik, az ébresztések újraütemeződnek. | M3 |
| Á3 | Az óra kézi átállítása műszak közben: a szerver `time_suspect` jelölést ad. | M4 |
| Á4 | Repülőgép-üzemmód egy teljes kör alatt, majd szinkron: minden adat a szerverre kerül, `verify_status = ok`. | M4 |
| Á5 | Ismeretlen címke, dupla leolvasás, rossz sorrend (kötött módban), kézi rögzítés. | M3 |
| Á6 | Műszakváltás másik őr PIN-jével. | M3 |
| Á7 | Telefoncsere: a régi visszavonása, `push-final`, az új hozzárendelése. | M4 (visszavonás), M5 (hozzárendelés) |
| Á8 | Alacsony akkumulátor és energiatakarékos mód (Android). | M1 (ébresztés), M3 |

### M1 – Monoton óra (M1-03, képernyő: „Monoton óra és boot ID”)

| # | Ellenőrzés | Várt eredmény |
| --- | --- | --- |
| C1 | A boot ID forrása (az előtag). Írd a megjegyzésbe. | Android: `android-boot:` (tartalék: `android-kernel:`). iPhone: `ios-session:` (tartalék: `ios-boottime:`). |
| C2 | Nyisd meg a képernyőt, zárold le a telefont legalább 5 percre, majd térj vissza. | Az uptime az alvás alatt is nőtt: az „Eltérés” 1 mp alatt marad. |
| C3 | Írd fel a boot ID-t, indítsd újra a telefont. | A boot ID megváltozott. |
| C4 | Írd fel a boot ID-t, állítsd át kézzel az órát (pl. +1 óra), majd vissza. | A boot ID **nem** változott. Ha iPhone-on a forrás `ios-boottime:`, és változott: STOP (lásd `decisions.md`, M1-03). |

### M1 – NFC (M1-04, képernyő: „NFC-címke olvasása”)

| # | Ellenőrzés | Várt eredmény |
| --- | --- | --- |
| N1 | Olvass le egy NTAG21x címkét. | UID (14 hexa karakter) és az NDEF tartalma (pl. URL) megjelenik. |
| N2 | Olvass le egy NTAG 424 DNA címkét (a „Random ID” kikapcsolva). | UID és NDEF megjelenik; iPhone-on is jelentkezik a címke. |
| N3 | Ugyanazt a két címkét olvasd le a másik telefonnal is. | A UID mindkét telefonon azonos (a megjegyzésbe írd be). |
| N4 | Android: a képernyő nyitva, gomb nélkül érintsd a címkét; majd egy másik képernyőn is. | A képernyőn gomb nélkül olvas, a rendszer „új címke” ablaka nem jelenik meg; más képernyőn a címke nem csinál semmit. |
| N5 | iPhone: „Leolvasás” gomb, majd címke; másodszor a rendszerablakot zárd be címke nélkül. | „Tartsd a telefont a címkéhez” szöveg, siker után „Címke leolvasva” és bezárul; a bezárás nem hiba. |
| N6 | Android: kapcsold ki az NFC-t, nyisd meg a képernyőt. | „Kikapcsolva” jelzés, az „NFC-beállítások” gomb a rendszerbeállítást nyitja; visszatérve bekapcsolt NFC-vel olvas. |

### M1 – QR (M1-05, képernyő: „QR-kód olvasása”)

| # | Ellenőrzés | Várt eredmény |
| --- | --- | --- |
| Q1 | Kinyomtatott `waypost:cp:` kód, rendes fényben és sötétben a „Lámpa” gombbal. | Beolvassa; a kód a listában. |
| Q2 | Másik telefon vagy monitor képernyőjén megjelenített kód (fényes kijelző, tükröződés). | Beolvassa. |
| Q3 | Idegen QR-kód (pl. egy URL vagy Wi-Fi-kód). | Nem kerül a listába, csak a „Figyelmen kívül hagyva” sorban látszik. |
| Q4 | Tartsd a kódot 10 mp-ig a képben, majd vedd el 3 mp-re, és mutasd újra. | A képben tartott kód egyszer számít; a szünet után újra. |
| Q5 | Az első megnyitáskor utasítsd el a kamera-engedélyt (iPhone-on: egyszer; Androidon: kétszer). | A gomb a rendszerbeállítást nyitja; ott engedélyezve, visszatérve a kamera elindul. |

### M1 – Ébresztés (M1-06, képernyő: „Ébresztés és engedélyek”)

A próbasorozat: „Ütemezés: 3 óra, 15 percenként” → 12 értesítés egész negyedórákra. Egy sorozat alatt óránként válts állapotot: 1. óra zárolt képernyő (app előtérben), 2. óra app háttérben (másik app előtérben, majd zárolás), 3. óra bezárt app (a legutóbbi appok közül kisöpörve). Minden értesítésnél jegyezd fel a késést (az értesítés címe az ütemezett időpont).

| # | Ellenőrzés | Várt eredmény |
| --- | --- | --- |
| E1 | Engedélyek a képernyőn. Android: értesítések, pontos riasztás, akkumulátor-optimalizálás – mind „Engedélyezés”/„Kivétel kérése” gombbal. iPhone: értesítések; Beállítások → Értesítések → Waypost → Időérzékeny értesítések. | Minden engedély megadható, és a képernyő visszatérve „Engedélyezve” / „Kivétel” állapotot mutat. Androidon az állapotsorban ébresztőóra-ikon, amíg van ütemezett értesítés. |
| E2 | Sorozat, 1. óra: zárolt képernyő. | Mind a 4 értesítés szól, legfeljebb néhány mp késéssel. |
| E3 | Sorozat, 2. óra: app háttérben. | Mind a 4 szól, pontosan. |
| E4 | Sorozat, 3. óra: bezárt app. | Mind a 4 szól, pontosan. |
| E5 | Némított telefon (Android: csengő némítva; iPhone: némító kapcsoló). | Android: szól (riasztás-hangerővel). iPhone: jegyezd fel, szól-e (az időérzékeny értesítés a némító kapcsolót nem kerüli meg; ha nem szól, a rezgés és a kijelzés meg kell legyen). |
| E6 | Hang és rezgés. | A saját hang (rövid kéthangú csipogás) szól, nem a rendszer alaphangja; a telefon rezeg. |
| E7 | Ütemezés után indítsd újra a telefont (ne nyisd meg az appot). | A következő értesítés újraindítás után is pontosan szól. |
| E8 | Android: energiatakarékos mód bekapcsolva (és ha van, a gyártói „alkalmazás alvó állapotba” funkció). | Pontosan szól; ha nem, a megjegyzésbe a gyártó, a beállítás és a késés. |
| E9 | iPhone: egy Fókusz mód (pl. Alvás) bekapcsolva. | Az időérzékeny értesítés átjut. |

### M1 – Ütemező mérése (J-06, képernyő: „Ütemező mérése”; új dev build nem kell, csak a JS változott)

Kiadott JS-csomaggal (`make apk` vagy release build) mérj, mert fejlesztői buildben a Hermes és a Metro lassabb. A gyengébb Android-telefonon elég, az eredmény az *Eredmények* szakaszba kerül.

| # | Ellenőrzés | Várt eredmény |
| --- | --- | --- |
| M1 | „Mérés indítása” háromszor egymás után; a harmadik futás számait jegyezd fel menetrendenként. | Megjelenik a három menetrend és az öt szabály ideje. |
| M2 | Hasonlítsd össze a `schedulerStep` idejét a 100 ms-os határral (J-12) és a `slotsBetween` idejével. | Az 5 perces menetrendeknél is 100 ms alatt marad; ha nem, a `slotsBetween` aránya mutatja, hogy a kibontást kell-e gyorsítani. |

### Indulás és hozzárendelés (M3-01, M3-05, M5-06, M5-09; fejlesztői build)

A workbench demó-telephelye kell (`laravel-waypost`: `composer serve`), olyan címen, amelyet a telefon elér (ugyanazon a Wi-Fi-n a gép IP-címe, Android-emulátoron `10.0.2.2`), pl. `http://192.168.1.10:8088/api/waypost/v1`. A demó supervisor: `supervisor@waypost.test` / `password`.

| # | Ellenőrzés | Várt eredmény |
| --- | --- | --- |
| I1 | Friss telepítés, első indítás. | A splash után a „Supervisor belépés” képernyő jön, hibaképernyő nélkül (az adatbázis létrejött). |
| I2 | „Fejlesztői eszközök” → „API-cím”: a workbench címe, „Mentés”. Vissza, „Supervisor belépés” a demó supervisorral; a telephelylistán a „Demó telephely”, alul „Telefon hozzárendelése”, a kérdésre „Hozzárendelés”. | A belépés után a telephelylista; a hozzárendelés után a „PIN-belépés” képernyő, és a teljes pull után a telephely neve. A workbench-ben megjelenik az új eszköz, a supervisor tokenje eltűnik. |
| I3 | Zárd be az appot (a legutóbbi appok közül kisöpörve), és nyisd meg újra; utána indítsd újra a telefont, és oldd fel. | Mindkétszer a „PIN-belépés” jön (a hozzárendelés megmaradt). |
| I4 | Hibás API-cím vagy leállított workbench mellett „Belépés”, ill. a belépés után leállított workbench mellett „Telefon hozzárendelése”. | „A szerver nem érhető el…”, legfeljebb 30 mp múlva; az app nem fagy le, a hozzárendelés után sem változik semmi. |
| I5 | Töröld az appot, és telepítsd újra (iPhone-on is: a Keychain megmarad). | Az app hozzárendeletlenként indul („Supervisor belépés”); a „Fejlesztői eszközök” állapota „nincs hozzárendelve”. |
| I6 | Belépés után repülőgép-üzemmódban „Új telephely”, majd a hálózat visszatérte előtt nyisd meg, és nézd meg a „Telefon hozzárendelése” gombot; utána hálózattal „Hozzárendelés”. | Offline a gomb letiltva („A hozzárendeléshez internet kell.”). Hálózattal a telephely előbb feltöltődik, utána a hozzárendelés sikerül. |

### M3 – Helyadat, fotó, NFC és visszajelzés (M3-20 – M3-22, képernyő: „Helyadat, fotó, visszajelzés”; új dev build)

| # | Ellenőrzés | Várt eredmény |
| --- | --- | --- |
| H1 | „Helymeghatározás engedélyezése”, majd a szabadban (előtte pl. egy térképappban legyen GPS-fix) „Helyadat kérése”. | Koordináta, ±néhány m, 1 mp alatt. Android: a GNSS-idő megjelenik, és a pontos időtől legfeljebb 1 percet tér el. iPhone: a GNSS-idő „–”. |
| H2 | Épületben, majd kikapcsolt helymeghatározással „Helyadat kérése”. | Helyadat, vagy „Nincs helyadat”, de legfeljebb kb. 5000 ms után; az app nem akad meg. |
| H3 | Android: fejlesztői beállítások → „Hely-utánzó alkalmazás” egy hamis hely appal, majd „Helyadat kérése”. | „Hamisított helyadat (mock_location)”, a GNSS-idő „–”. |
| H4 | Az engedélyt utasítsd el (vagy vond vissza a beállításokban), majd „Helyadat kérése”. | Azonnal „Nincs helyadat”. |
| P1 | „Kamera engedélyezése”, majd fotó álló és fekvő tartásban is. | A kép nincs elforgatva; a tömörített méret néhány száz kB; SHA-256 látszik. |
| P2 | Készíts két fotót, majd lépj ki a képernyőről. | Az előző fotó minden új fotónál, az utolsó a kilépéskor törlődik (a tárhely nem nő). |
| V1 | „Siker”, „Hiba”, „Figyelmeztetés” gomb, rendes és némított csengővel. | Siker: egy rövid rezgés, hiba: kettő, figyelmeztetés: egy hosszabb; mindegyiknek saját hangja van. Jegyezd fel, némítva szól-e a hang. |
| V2 | „NFC-címke olvasása”, illetve „QR-kód olvasása”: olvass le egy címkét és egy kódot. | Minden sikeres olvasás a siker visszajelzését adja. |
| V3 | Android: a „Fejlesztői eszközök” listán (nem olvasó képernyőn) érints egy URL-es NDEF-rekordot tartalmazó címkét (pl. NTAG 424 DNA). Utána tedd háttérbe az appot, és érintsd újra. | Az appban nem történik semmi, nincs „új címke” ablak, és nem nyílik böngésző. Háttérben a rendszer szokott viselkedése jön (ez nem hiba). |
| V4 | Android: kapcsold ki az NFC-t, indítsd el az appot, majd kapcsold be a beállításokban, és térj vissza az „NFC-címke olvasása” képernyőre. | Bekapcsolás után gomb nélkül olvas. |

## Eredmények

Sablon (egy futáshoz másold le, és a fejlécbe írd a dátumot és a mérföldkövet):

```markdown
### M3 – Kör térképen (M3-34, a kör képernyője, „Térkép” nézet; új dev build, Androidon `GOOGLE_MAPS_ANDROID_API_KEY`-jel)

| # | Ellenőrzés | Várt eredmény |
| --- | --- | --- |
| T1 | Nyitott körön „Térkép”, sötét és világos témában. | A térkép a pontokra áll, a színei a témáéi; a hátralévő pontok számozott, szaggatott körök; a Google-logó látszik a jelmagyarázat fölött. |
| T2 | Pontok leolvasása a térkép nézetben. | Az eredmény után a jelölő zöld, sorszáma helyes, a vonal összeköti a leolvasásokat, a „Megtett út” ideje frissül. |
| T3 | Kézi rögzítés (M3-36 után). | Lila jelölő, körülötte szaggatott pontossági kör. |
| T4 | Saját helyzet: a szabadban, helyengedéllyel; a gomb. | Pötty és halo a helyünkön, mozgásra követi; a gomb odaáll; a szaggatott szakasz az utolsó leolvasástól vezet ide. Helyengedély nélkül nincs pötty, a gomb tiltott. |
| T5 | Repülőgép üzemmód, korábban nem nézett környéken. | Üres háttéren is látszanak a jelölők és a vonal. |
| T6 | Android, kulcs nélküli build: „Térkép”. | Nincs összeomlás, a térkép helyén üzenet; a Lista és a leolvasás működik. |

### M3 – Leolvasás eredménye (M3-35, a kör képernyőjéről)

| # | Ellenőrzés | Várt eredmény |
| --- | --- | --- |
| E1 | Helyes pont leolvasása, utasítással. | Zöld képernyő (fade + scale), egy rövid rezgés; név, utasítás, haladás; „Tovább · 3” visszaszámol, és magától visszalép a körre. Az utasítás 3 mp alatt elolvasható-e? |
| E2 | Az utolsó pont leolvasása. | „Teljesítve”, a visszalépés után a kör helyett a kezdőlap. |
| E3 | Ismeretlen címke, NFC-vel és QR-rel. | Piros képernyő, két rövid rezgés, a leolvasott azonosító; „Újra próbálom” NFC-nél a körre, QR-nél az olvasóra visz; a „Sérült címke” a kézi rögzítésre. |
| E4 | Már leolvasott pont újra. | „Már leolvasva ÓÓ:PP-kor”, egy hosszabb rezgés; nincs új bejegyzés, nem lép vissza magától. |
| E5 | Kötött sorrendnél rossz pont. | „Rossz sorrend”, egy hosszabb rezgés, a két pont sorszámmal; a listán a pont jelölve. |
| E6 | Más útvonal pontja, nyitott kör nélküli címke. | „Rögzítve, jelöléssel”, körön kívüli szöveg, egy hosszabb rezgés. |
| E7 | Ébresztés a siker képernyője alatt; kis képernyő, nagy betűméret, hosszú utasítás. | Az ébresztés felül marad, a visszaszámlálás megáll, és utána folytatódik. A tartalom görgethető, a gombok a helyükön. |

### M3 – Kézi rögzítés (M3-36, a kör képernyőjén „Címke nem olvasható”; a fotók és a helyadat miatt a szabadban is)

| # | Ellenőrzés | Várt eredmény |
| --- | --- | --- |
| K1 | Megnyitás egy pont mellett, helyengedéllyel. | Néhány mp-en belül a legközelebbi hátralévő pont van kiválasztva, a sávban „GPS rögzítve · ±N m · ÓÓ:PP”. A pontválasztó csak a hátralévőket kínálja. |
| K2 | Kamera megnyitása először és végleges elutasítás után; fotó készítése. | Engedélykérés, illetve a beállítások gomb. A kép nem fekete (a kamera modális ablakban fut), a fotó a csempén látszik, galéria nincs. |
| K3 | Fotó törlése, hat fotó próbája. | Megerősítés után eltűnik; az ötödik után nincs több csempe. |
| K4 | Megjegyzés írása, a billentyűzet nyitva, iOS-en és Androidon is. | A mező és a „Rögzítés” gomb nem kerül a billentyűzet alá; a gomb csak fotóval és megjegyzéssel aktív. |
| K5 | Rögzítés repülőgép üzemmódban. | Eredményképernyő: „Rögzítve · ÓÓ:PP · Kézi – nem igazolt”; a listán lila sor. Hálózat után a fotó és a két bejegyzés feltöltődik. |
| K6 | Kitöltés közben eltelik a határidő, majd „Rögzítés”. | „A kör közben lezárult” sáv, a gomb inaktív; vissza a kezdőlapra jut. |
| K7 | Ébresztés nyitott kameránál és nyitott pontválasztónál. | Az ablak bezárul, az ébresztés látszik; utána az űrlap adatai megvannak. |

### M3 – Esemény rögzítése (M3-37, a kezdőlapon és a kör képernyőjén a zászló; a helyadat miatt a szabadban is)

| # | Ellenőrzés | Várt eredmény |
| --- | --- | --- |
| V1 | Megnyitás egy pont mellett, helyengedéllyel. | A sorban idő, „Legközelebbi pont: …”, „GPS ±N m”. A „Mentés” kategória nélkül inaktív, csak kategóriával is aktív. |
| V2 | Öt fotó, törlés, megjegyzés nyitott billentyűzettel, iOS-en és Androidon. | Az ötödik után nincs több csempe; a mező és a gomb nem kerül a billentyűzet alá. |
| V3 | Mentés repülőgép üzemmódban. | Vissza az előző képernyőre, felül „Esemény mentve – feltöltésre vár”, ami kb. 3 mp után eltűnik, és közben nem fog fel érintést. A szinkronjelzőn a várakozó tételek száma nő, hálózat után a fotó és a bejegyzés feltöltődik, és a szám lenullázódik. |
| V4 | Leolvasás után „Esemény ennél a pontnál”. | A sorban „Pont: …” a leolvasott ponttal; mentés után vissza a körre. |
| V5 | Ébresztés nyitott kameránál; a határidő lejárta a kör képernyőjén. | A kamera bezárul, az űrlap adatai megvannak. A kör képernyője visszalép, és toast mondja a zárult kör állapotát. |

### M3 – Műszakzárás (M3-38, a kezdőlapon „Műszakzárás”)

| # | Ellenőrzés | Várt eredmény |
| --- | --- | --- |
| Z1 | Megnyitás néhány kör után. | Fejléc: név, kezdés – most; a három szám egyezik az idővonallal; az események és a nem igazolt pontok száma helyes. |
| Z2 | Megnyitás nyitott körrel. | Figyelmeztető sáv a pontok számával és a záró állapottal; zárás után a kör ilyen állapotú. |
| Z3 | Repülőgép üzemmódban, majd hálózattal. | „N tétel vár feltöltésre” sáv; a szám a szinkronjelzőével azonos. Hálózat után a tételek feltöltődnek, és a sáv eltűnik. |
| Z4 | Hibás PIN, másik őr PIN-je, több hibás próba. | „Hibás PIN-kód”, rázás, két rövid rezgés; a műszak nem zárul; zárolásnál visszaszámlálás, a számlap tiltott. |
| Z5 | Saját PIN; ébresztés nyitott PIN-lapnál. | A PIN-képernyő jön, és nem mutat műszakot. Ébresztésnél a lap utat enged, utána visszatér. |

### M3 – Elfogadás: 1 órás offline műszak (M3-40; `laravel-waypost`: `composer serve`, „Demó telephely”, 5 perces menetrend)

Előtte: friss `waypost-schema` (M3-39), a telefon hozzárendelve, a címkék betanítva, az első pull lefutott. A műszak kezdése előtt repülőgép üzemmód, és végig az is marad.

| # | Ellenőrzés | Várt eredmény |
| --- | --- | --- |
| F1 | Belépés őr PIN-jével, műszakkezdés. | Műszakkezdés, majd kezdőlap a következő körrel; hálózat nélkül is. |
| F2 | Minden 5. percben ébresztés, zárolt képernyőnél is. | Hang és rezgés; „Indulok” a kör képernyőjére visz. |
| F3 | Egy kör NFC-vel, egy QR-rel, végig. | Siker képernyők, a kör „Teljesítve”. |
| F4 | Egy kör kézi rögzítéssel. | Lila sor, a kör számít. |
| F5 | Egy körön ismeretlen címke, dupla leolvasás, rossz sorrend. | A leolvasás eredményei (E3–E5). |
| F6 | Egy kört félbehagyni, egyet teljesen kihagyni. | A határidőnél „Hiányos”, illetve „Elmaradt”, toast a kör képernyőjén. |
| F7 | Esemény rögzítése fotóval. | Toast, a záró képernyőn az eseményszám nő. |
| F8 | Újraindítás műszak közben. Külön figyeld: ha a műszak szerveridővel indult, újraindítás után hálózat nélkül és rossz órával a műszak ideje és a „most” eltérhet (`decisions.md`, 2026-11-01). | A műszak folytatódik, a kimaradt kör eredeti időponttal megnyílik, az ébresztések újraütemeződnek. |
| F9 | Zárás PIN-nel az óra végén, majd a repülőgép üzemmód kikapcsolása. | Az összegzés egyezik a történtekkel. Hálózat után a lánc és a fotók feltöltődnek, utána lefut a pull. |

### M4 – Elfogadás: feltöltés hosszú offline után, telefoncsere (M4-13; `laravel-waypost`: `composer serve`, „Demó telephely”)

Előtte: a telefon hozzárendelve, az első pull lefutott. A **szerveren** ellenőrizd (`waypost_chain_entries`, `waypost_media`, `waypost_devices`, `waypost_device_diagnostics`). Figyelem: a `composer serve` törli és újraépíti a `waypost` adatbázist; ha az adataid kellenek, `vendor/bin/testbench migrate` és `vendor/bin/testbench serve`.

Emulátoron az R1–R6 és a T1–T4 futtatható, kézi rögzítéssel és a virtuális kamerával. NFC-hez és az F2-höz valódi telefon kell. Repülőgép-üzemmód emulátoron: `adb shell cmd connectivity airplane-mode enable`, illetve `disable`. A 10.0.2.2 a Windows gép; WSL-ből a Metro `npm start -- --localhost`.

| # | Ellenőrzés | Várt eredmény |
| --- | --- | --- |
| R1 | Repülőgép-üzemmód, műszakkezdés, 2 óra körökkel (5 perces menetrend): leolvasás vagy kézi rögzítés, legalább 2 esemény fotóval, zárás PIN-nel. | Minden működik hálózat nélkül; a szinkronjelzőn a várakozó tételek száma nő. |
| R2 | Repülőgép-üzemmód kikapcsolása, az app előtérben. | Pár másodpercen belül „Feltöltés…”, majd a szám lenullázódik, és a részleteknél friss az utolsó szinkron. |
| R3 | A szerveren: `SELECT verify_status, COUNT(*) FROM waypost_chain_entries WHERE device_id = '…' GROUP BY verify_status`. | Csak `ok`, a darabszám és a `last_seq` a telefon utolsó `seq`-je. Ha 200-nál több bejegyzés várt, köteg szerint érkeztek. |
| R4 | A szerveren: `waypost_media` és a fájlok. | Minden fotónál `uploaded_at`, és a `waypost/media/<id>.jpg` fájl lenyomata egyezik a `sha256`-tal. |
| R5 | A szerveren: `projected_at`, `waypost_shifts`, `waypost_rounds`, `waypost_scans`. | Nincs `projected_at = null`; a műszak zárt, a körök állapota a telefonéval azonos. |
| R6 | Feltöltés közben szakítsd meg a hálózatot, majd add vissza; külön próbaként állítsd le az appot feltöltés közben. | A feltöltés onnan folytatódik, nincs duplikált sor, a végén minden `ok`. |
| R7 | Az óra kézi átállítása (Á3) repülőgép-üzemmódban, leolvasás, majd szinkron. | A bejegyzésen `time_suspect`, `ok` állapottal. |
| T1 | Telefoncsere: a régi telefonon offline rögzítés (fotóval is), közben egy másik telefon hozzárendelése ugyanahhoz a telephelyhez (egy másik telefonon supervisor belépés és „Telefon hozzárendelése”; emulátorban elég a backend: `POST /devices/enroll`), majd a régin hálózat. | A régi telefon a `push-final`-lal feltölti a láncot és a fotókat. A szerveren minden `ok`, a `upload_closed_at` kitöltve. |
| T2 | A régi telefon a feltöltés után. | A belépőképernyőn: „Ezt a telefont egy másik váltotta fel…”. Nincs több ébresztés, a régi tokennel a szerver `401 device_revoked`-et ad. |
| T3 | T1 közben szakadjon meg a hálózat, vagy indítsd újra az appot. | A következő szinkron folytatja, és csak utána lép ki. Ezalatt új rögzítés nem megy, a szinkronjelző mutatja az okot. |
| T4 | Ugyanennek a telefonnak az újbóli hozzárendelése: az app újratelepítése, supervisor belépés, „Telefon hozzárendelése”. | Új lánc 1-től; a régi műszak és körök nem látszanak; a várakozó tételek száma 0-ról indul. |

### ÉÉÉÉ-HH-NN – M1

| # | Android | iPhone | Megjegyzés |
| --- | --- | --- | --- |
| C1 | | | |
| C2 | | | |
| C3 | | | |
| C4 | | | |
| N1 | | | |
| N2 | | | |
| N3 | | | |
| N4 | | – | |
| N5 | – | | |
| N6 | | – | |
| Q1 | | | |
| Q2 | | | |
| Q3 | | | |
| Q4 | | | |
| Q5 | | | |
| E1 | | | |
| E2 | | | |
| E3 | | | |
| E4 | | | |
| E5 | | | |
| E6 | | | |
| E7 | | | |
| E8 | | – | |
| E9 | – | | |
| Á1 | | | |
| Á8 | | – | |
```
