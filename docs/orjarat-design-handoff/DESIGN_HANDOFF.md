# Őrjárat – design handoff (React Native / Expo)

> Kiválasztott irány: **B · „Éjszakai kártya”**. Sötét téma az elsődleges, a világos téma azonos szerkezetű.
> Vizuális forrás (Design vászon): https://claude.ai/artifact/2PDAc9BpiwMjw9Z7sr5YHB
> Funkcionális forrás: „Őrjárat-ellenőrző app – alap specifikáció” (a Claude Docs dokumentum). Ahol ez a handoff és a specifikáció eltér, a **specifikáció a mérvadó a működésre**, ez a dokumentum a **megjelenésre és az interakcióra**.

A mockupokban szereplő nevek, időpontok, címkeazonosítók és távolságok **mintaadatok**. Az „Őrjárat” munkanév.

---

## 1. Fájlok ebben a csomagban

| Fájl | Mi ez |
|---|---|
| `DESIGN_HANDOFF.md` | ez a dokumentum: elvek, tokenek, komponensek, képernyők, interakciók |
| `src/theme/tokens.ts` | színek (sötét/világos), tipográfia, térközök, lekerekítés, méretek, állapot→stílus leképezés – **közvetlenül bemásolható** |
| `src/i18n/hu.json` | a képernyők magyar feliratai kulcsokkal |
| `email/shift-report.blade.php` | a műszakjelentés HTML e-mail sablonja Laravel Blade-ben (táblázatos, inline stílusú) |
| `reference/*.dc.html` | a vászon képernyőinek forrása (HTML mockup). Pixelméretekhez, sorrendhez, szövegekhez nézd meg; **nem kell portolni**, a `{{t.xxx}}` helyekre a tokenek kerülnek |
| `reference/SCREENS.md` | képernyő → referenciafájl → útvonal (route) táblázat |

---

## 2. Tervezési elvek (kötelezőek)

1. **Éjszakai használat:** sötét téma alapértelmezett. Kövesse a rendszert (`useColorScheme`), de a beállításokban legyen kézi felülírás (Rendszer / Sötét / Világos). Az ébresztés és a leolvasás-eredmény képernyők is a téma szerint jelennek meg, nem vakító fehérrel.
2. **Kesztyű, fél kéz, mozgás:** minden érinthető elem ≥ 48 dp. A fő akció mindig a képernyő alján, teljes szélességben (68–76 dp), hüvelykujjal elérhető. Kevés szöveg, nagy számok.
3. **Állapot = szín + ikon + szöveg.** Soha ne csak színnel jelezz. A 6 állapot: *teljesítve, folyamatban, hiányos, elmaradt, nem igazolt (kézi), időgyanús*; plusz *hátravan* és *rossz sorrend*. Lásd `statusStyle` a `tokens.ts`-ben.
4. **Szinkronjelző mindig látszik** diszkréten a fejlécben (jobb felső chip): Szinkronizálva / Offline · N vár / Feltöltés… N / Szinkronhiba.
5. **Csak natív eszközök:** egyszínű felületek, keretek, `react-native-svg` ikonok. Nincs blur, nincs színátmenet, nincs web-only effekt. Árnyék nincs (világos témában 1 px `cardBorder` adja a kártyák elválasztását).
6. **Számok:** minden idő, számláló és pontszám `fontVariant: ['tabular-nums']`.

---

## 3. Téma

- `src/theme/tokens.ts` → `theme('dark' | 'light')`. Készíts egy `ThemeProvider`-t és `useTheme()` hookot.
- `StatusBar`: sötét témában `light-content`, világosban `dark-content`; háttér = `color.bg`.
- Android navigációs sáv színe = `color.bg` (`expo-navigation-bar`).
- Betűtípus: **Manrope** (`@expo-google-fonts/manrope`, 400/500/600/700/800). A splash képernyő addig maradjon, amíg betöltődik.

### Színhasználati szabályok
| Szerep | Token |
|---|---|
| Képernyő háttér | `bg` |
| Kártya, chip, másodlagos gomb, szegmens háttér | `surface` (+ `cardBorder` 1 px) |
| Listaelem | `card` (+ `cardBorder`) |
| Mező kitöltés kártyán belül | `field` |
| Fő akció | `accent` háttér, `onAccent` szöveg |
| Fókuszált mező / kijelölt választás | 2 px `accent` keret; kijelölt csempe háttér `runBg` |
| Info sáv | `runBg` háttér, ikon `run` |
| Figyelmeztető sáv | `warnBg`, ikon/szöveg `warn` |
| Offline / várakozó sáv | `offBg`, `offFg` |
| Hátralévő elem | átlátszó háttér, 2 px **szaggatott** `dash` keret, `pending` gyűrű |
| Veszélyes szöveggomb (pl. Pont elvetése) | `miss` szöveg, háttér nélkül |

---

## 4. Ikonok

Vonalas ikonok, 24-es rács, 2 px vonal, lekerekített végek. Javasolt: `lucide-react-native` (+ `react-native-svg`). Leképezés:

| Jelentés | Lucide | Megjegyzés |
|---|---|---|
| teljesítve / leolvasva | `Check` | vonal 2.8–3 a kis körökben |
| folyamatban | `LoaderCircle` (statikus) | |
| hiányos | saját: felkiáltójel (`M12 5v9M12 19v.01`) | körben |
| elmaradt / hiányzik / hiba | `X` | |
| nem igazolt (kézi) | `Pencil` | |
| időgyanús | `Clock` | |
| rossz sorrend | `ArrowUpDown` | |
| leolvasás (NFC) | `Nfc` vagy 3 ív (lásd referencia) | |
| esemény | `Flag` | szín: `warn` |
| offline | `CloudOff` | |
| feltöltés | `CloudUpload` | |
| supervisor | `Shield` | |
| vissza | `ChevronLeft` | 48 dp kerek gomb |
| térkép / lista | `Map` / `List` | |
| fotó | `Camera`, helyőrző `Image` | |
| GPS | `MapPin` | |
| ébresztés | `Bell` | |
| saját helyzet | `Navigation` | |
| diktálás | `Mic` | |

Ikon-only gomboknál kötelező az `accessibilityLabel` (magyarul, pl. „Esemény rögzítése”).

---

## 5. Komponensek

Minden méret dp. `t` = aktuális téma.

### 5.1 `Button`
| Variáns | Háttér | Szöveg | Magasság | Lekerekítés |
|---|---|---|---|---|
| `primary` | `accent` | `onAccent`, `typography.button` | 68 (űrlap), 72–76 (hero: Leolvasás, Indulok, Tovább) | pill |
| `secondary` | `surface` + 1 px `cardBorder` | `text`, `buttonSm` | 52–56 | pill |
| `dashed` (hozzáadás) | átlátszó, 2 px szaggatott `dash` | `accent`, `buttonSm`, `+` ikon | 56–60 | pill |
| `dangerText` | nincs | `miss`, `buttonSm` | 52 | – |
| `warnTonal` (pl. „Javítás”) | `warnBg` | `warn` | 44 | pill |

Állapotok: lenyomva → opacity 0.85 + `scale 0.98`; letiltva → opacity 0.4. Ikon a felirat előtt, 8–10 dp térköz. Hero gombnál opcionális visszaszámlálás a feliratban („Tovább · 3”).

### 5.2 `IconButton`
Kerek. 48 dp (vissza, középre igazítás), 72 dp (esemény a Leolvasás mellett), 52 dp (térkép-vezérlő). Háttér `surface` + `cardBorder`.

### 5.3 `SyncIndicator` (fejléc jobb oldal)
Kapszula, 30 dp magas, 12 dp vízszintes padding, `chip` tipográfia, bal oldalon 8 dp pötty vagy 15 dp ikon. Állapotok a `syncStyle`-ban. Koppintásra lenyíló rövid lista: utolsó szinkron ideje, várakozó tételek száma, „Szinkronizálás most”.

### 5.4 `StatusDot` (listaelem bal oldala)
32 dp kör. Teljesített/kézi/időgyanús/rossz sorrend: `xxxBg` háttér + `xxx` színű ikon (16–18 dp). Hiányzik/elmaradt kiemelt sorban: teli `miss` + `bg` színű X. Hátravan: üres kör, 2.5 dp `pending` keret. Számozott változat (betanítás, kötött sorrend): `runBg` háttér, `run` szám, 14/800.

### 5.5 `StatusBadge` (kapszula)
30 dp magas, 12 dp padding, ikon (12–14 dp) + felirat 13/800. Színek: `xxxBg` háttér, `xxx` szöveg. Használat: kör fejléce, telephelykártya, kézi rögzítés fejléc.

### 5.6 `PointListItem`
Min. 60 dp, padding 0/16, radius `item`, köztük 8 dp.
- **leolvasva:** `card` háttér; név `body`; meta `small` `text2`: „22:03 · NFC”.
- **kézi:** mint fent, `StatusDot manual`, meta színe `manual`: „22:09 · Kézi – nem igazolt”.
- **hátravan:** átlátszó, szaggatott keret, jobb oldalon „Hátravan” `small`.
- **hiányzik:** `missBg` háttér, meta „Hiányzik” `miss`.
- **időgyanús:** meta `time` színnel, indoklással: „időgyanús: túl gyors (40 mp, mért 3:10)”.
Szabad sorrendnél a lista: leolvasottak időrendben felül, alattuk a hátralévők (vagy: hátralévők felül – a B mockup leolvasottakat tesz felülre; a kezdőképernyőn a hátralévők száma a gyűrűben látszik).

### 5.7 `ProgressRing`
Átmérő 96 (lista), 52 (térkép-fejléc). Vonal 10/14, háttér `track`, kitöltés `accent`, lekerekített vég. Közepén „5/9” (26/800) + „pont” (12/600 `text2`). `react-native-svg` `Circle` + `strokeDasharray`.

### 5.8 `ProgressSegments`
N egyenlő szegmens, 8 dp magas, 4 dp rés, radius 4. Szín pontonként az állapot `fg` színe, hátralévő `track`.

### 5.9 `RoundTimeline` (13 kör)
13 oszlopos rács, 3 dp rés. Cella 40 dp magas, radius 10; alatta óra (`micro`, „20”…„08”).
- teljesítve: teli `ok`, `bg` színű pipa
- hiányos: teli `warn`, `bg` színű „!”
- elmaradt: teli `miss`, `bg` színű X
- következik: 2 dp `accent` keret, `accent` csengő ikon, óra felirat `accent`
- jövőbeli: 2 dp `track` keret, üres
Alatta jelmagyarázat (10 dp négyzetek + 12/600 felirat). Kompakt változat (műszakzárás, telephelykártya): 28 vagy 8 dp magas, ikon nélkül.

### 5.10 `SegmentedControl`
Kapszula konténer (`surface`, 4 dp padding), 2 opció, 40 dp. Aktív: `accent` háttér, `onAccent` 15/800. Inaktív: `text2` 15/700. Használat: Lista/Térkép, Szabad/Kötött sorrend, Lista/Ismétlődés.

### 5.11 `Switch`
56×34, knob 28 fehér, be: `accent` sáv, ki: `track`. Használhatod a natív `Switch`-et `trackColor`/`thumbColor` tokenekkel.

### 5.12 `Card` és `InfoBanner`
Card: `surface`, radius 24, padding 16–20, `cardBorder`. Csoportosított lista kártyán belül: sorok közt 1 dp `line`.
InfoBanner: radius 18, padding 12/16, ikon 18 dp + 14/600 szöveg, line-height 1.45. Variánsok: `info` (runBg), `warn` (warnBg), `offline` (offBg), `manual` (manualBg), `success` (okBg).

### 5.13 `TextField` / `TextArea`
Címke felette (14/800, 4 dp behúzás), mező 56–58 magas, radius 18, padding 16–18, tartalom 16–17/600–700. Alap: `surface` + `cardBorder`; fókusz: 2 dp `accent` keret. Kötelező jelölés a címkében: „· kötelező” `miss` színnel; opcionális: „· nem kötelező” `text2`. Jelszómezőben szem ikon gomb (48 dp).

### 5.14 `PhotoSlot` / `PhotoAdd`
Csempe 92–132 dp magas, radius 18. Kész fotó: kép `cover`, jobb felső 22 dp `ok` pipa. Hozzáadás: 2 dp szaggatott `dash` keret, `accent` kamera ikon + „Fotó”. 3 oszlopos rács, 8 dp rés. A fotókat tömörítve tárold (spec szerint SHA-256 lenyomattal).

### 5.15 `CategoryTile` (esemény)
2 oszlop, 76 dp magas, radius 18, ikon 24 + felirat 15/700. Kijelölt: 2 dp `accent` keret + `runBg` háttér, felirat 800. „Egyéb” teljes szélességű, 56 dp. `accessibilityRole="radio"`.

### 5.16 `PinPad` + `PinDots`
6 jegy. Pöttyök: 18 dp, kitöltött `accent`, üres `line`, kapszula kártyában. Billentyűk: 80 dp kör, `surface`, 30/700. Bal alsó: supervisor (pajzs) ikon gomb, jobb alsó: törlés. Hibás PIN: pöttyök vízszintes rázása (Reanimated) + `Haptics.notificationAsync(Error)` + „Hibás PIN-kód” `miss` felirat. 5 hibás próbálkozás után 60 mp várakozás.

### 5.17 `ResultScreen` (leolvasás eredménye)
Teljes képernyő. Középen két koncentrikus kör: 196 dp `xxxBg`, benne 132 dp teli `xxx`, benne 64–72 dp ikon `bg` színnel. Alatta állapotsor (16/700 `xxx` színnel), cím (`result`), magyarázat (17/600 `text2`). Alul gombok.
| Eset | Szín | Ikon | Állapotsor | Gombok |
|---|---|---|---|---|
| Siker | `ok` | pipa | „Leolvasva · 22:14 · NFC” | **Tovább · 3** (3 mp múlva magától bezárul), „Esemény ennél a pontnál” |
| Ismeretlen címke | `miss` | X | „Nem rögzítettük” | **Újra próbálom**, „Sérült címke – kézi rögzítés” |
| Rossz sorrend (csak kötött sorrendnél) | `warn` | ⇅ | „Rögzítve, jelöléssel” | **Értem, tovább** |
Siker képernyőn: haladás kártya (6/9 + szegmensek) és ha van, a pont utasítása szaggatott keretes dobozban.

### 5.18 `SiteMap`
`react-native-maps` (Google Androidon; iOS-en Apple vagy Google). Sötét témához saját map style JSON. Rétegek:
- **Megtett út:** `Polyline` a leolvasások GPS-pozícióin időrendben, 5 dp, `accent`. Az utolsó pont és a jelenlegi helyzet közt szaggatott szakasz. (1. lépcső: csak leolvasáskori pozíció van, nincs folyamatos nyomvonal.)
- **Pontjelölők:** 28 dp kör, sorszámmal (12/800). Leolvasva `ok`; kézi `manual` + szaggatott pontossági kör (`Circle` a GPS accuracy sugarával); időgyanús `time`; hátravan: `surface` kitöltés, szaggatott `pending` keret, szám `text2`; hiányzik: `missBg` + szaggatott `miss` keret + X. Jelölő körül 3 dp `mapBg` színű keret.
- **Saját helyzet:** 8 dp pötty + 18 dp halvány halo.
- **Overlay-ek:** bal felső kapszula „Megtett út · 22:03–22:11”; jobb alsó 52 dp „saját helyzet középre” gomb; bal alsó jelmagyarázat kártya.
- **Offline:** ha nincs csempe, tartalékként a supervisor által feltöltött alaprajz-kép (`Overlay`/`Image`) – vagy az üres háttéren csak a jelölők és a vonal.

---

## 6. Képernyők

Javasolt routing: **expo-router**. A referencia-fájlokat a `reference/SCREENS.md` sorolja fel. Fejléc minta: 52 dp felső biztonsági zóna (SafeArea), 48 dp vissza gomb + cím (20–22/800) + alcím (13/600 `text2`), jobbra szinkronjelző vagy állapotjelvény.

### Őr mód

**G1 · PIN-belépés** `/(guard)/pin`
- Felül szinkronjelző (középen), telephely neve (15/600 `text2`), „Jó estét!” (30/800, napszak szerint: Jó reggelt / Jó napot / Jó estét), „A műszak 20:00-kor kezdődik”.
- PinDots, PinPad, alul **Műszak kezdése** (primary). Supervisor ikon → `/supervisor/login` (vagy supervisor PIN, ha a telefon már be van állítva).
- Ha a PIN egy másik őré, mint aki műszakban van: az előző műszakot átadással zárjuk (spec), és a következő képernyő ezt jelzi.

**G2 · Műszakkezdés** `/(guard)/shift-start`
- „Szia, {név}!”, kártya: Műszak 20:00–08:00 · Útvonal (név, pontszám) · Körök (13 · óránként · 25 perc).
- Átadás info sáv (ha volt): „{előző őr} műszakját lezártuk (átadás 19:56)…”.
- **Készenlét** csoport: NFC bekapcsolva · Ébresztés engedélyezve (exact alarm / értesítés) · Helymeghatározás · Akkumulátorkímélés (Android: ha nincs kivéve → `warn` sor + „Javítás” gomb, ami a rendszerbeállítást nyitja). Hiba esetén is indítható a műszak, de a sor figyelmeztet.
- **Műszak indítása** → G3.

**G3 · Műszak kezdőlap** `/(guard)/home`
- Fejléc: telephely + „{név} · műszakban”, szinkronjelző.
- Nagy kártya: „Következő kör: 22:00”, visszaszámláló `display` (mm:ss; 1 órán túl h:mm), „múlva indul · ébresztő szól”.
- „Ma éjjel” kártya: RoundTimeline + jelmagyarázat + „2 / 13 kör lezárva”.
- Lezárt körök listája (legújabb felül): állapot · pontszám · kimaradt pont neve / időtartam.
- Alul két másodlagos gomb: **Esemény**, **Műszakzárás**.
- Ha kör nyitva van, ez a képernyő helyett a G5 jelenik meg.

**G4 · Ébresztés / kör indul** `/(guard)/alarm`
- Teljes képernyő (Android: full-screen intent értesítés, zárolt képernyőn is; iOS: időérzékeny értesítés + hang, az app megnyitásakor ez a képernyő).
- Koncentrikus körök (232/180/128), középen az idő (38/800). „Indul a 22:00-s kör” (`alarm`), „9 pont · 25 perc időkeret”, előző kör állapota jelvényként.
- **Indulok** (76 dp) → G5, a riasztás leáll. **Hang némítása** (másodlagos) → csak a hang áll le, a képernyő marad.
- A kör a menetrend szerinti időpontban nyílik; az időmérés az **első leolvasással** indul.

**G5 · Kör folyamatban – lista** `/(guard)/round`
- Fejléc: „22:00-s kör” + szinkronjelző.
- Kártya: ProgressRing (5/9) + „Hátralévő idő” `counter` + „Határidő 22:28”. 5 perc alatt az idő `warn`, lejárt keretnél `miss`.
- SegmentedControl Lista/Térkép.
- PointListItem lista (görgethető).
- Alsó sáv: 72 dp kerek **esemény** gomb + **Leolvasás** (hero). Androidon az NFC gomb nélkül is olvas, amíg a képernyő nyitva van (a gomb ott a QR-olvasót / kézi rögzítést kínáló lapot nyitja); iOS-en a gomb nyitja a rendszer NFC-ablakát.
- A képernyő ébren tartása kör közben (`expo-keep-awake`).

**G6 · Kör folyamatban – térkép** `/(guard)/round?view=map` – ugyanaz a fejléc és alsó sáv, középen `SiteMap` 24-es lekerekítésű kártyában.

**G7–G9 · Leolvasás eredménye** – lásd `ResultScreen` (5.17). Haptika: siker → `notificationAsync(Success)`; ismeretlen → `Error`; rossz sorrend → `Warning`. Rövid hang csak sikernél (némítható).

**G10 · Kézi rögzítés** `/(guard)/manual`
- Fejléc + „Nem igazolt” jelvény (`manual`).
- Pont választó (legördülő sor; alapértelmezés: a legközelebbi hátralévő pont GPS alapján).
- Ok: kétállású választó „Címke hiányzik” / „Sérült, nem olvas”.
- **Fotó · kötelező** (min. 1), **Megjegyzés · kötelező** (+ Diktálás gomb).
- `manual` info sáv: „GPS rögzítve · ±8 m · 22:16 – Nem igazolt pontként kerül a jelentésbe, és „sérült címke” esemény is lesz belőle.”
- **Rögzítés** csak akkor aktív, ha van fotó és megjegyzés.

**G11 · Esemény rögzítése** `/(guard)/incident`
- Kategória csempék: Rongálás · Nyitott ajtó / ablak · Csőtörés / víz · Idegen személy · Egyéb (kötelező).
- Fotók (opcionális, több), megjegyzés (opcionális).
- Automatikus sor: „22:16 · Legközelebbi pont: … · GPS ±6 m”.
- **Esemény mentése** → vissza az előző képernyőre, toast: „Esemény mentve” (+ offline esetén „feltöltésre vár”).

**G12 · Műszakzárás** `/(guard)/shift-end`
- 3 statisztika csempe: teljesítve / hiányos / elmaradt (szám 30/800 + StatusDot).
- Kompakt RoundTimeline.
- Csoport: Események N · Nem igazolt pont N · Időgyanús leolvasás N.
- Offline sáv, ha van várakozó tétel: „N tétel vár feltöltésre. A jelentés a feltöltés után megy ki…”
- **Zárás PIN-kóddal** → PinPad modális lapon → vissza G1-re.

### Supervisor mód

Supervisor módban a fejléc bal oldalán `runBg` „Supervisor” jelvény (pajzs ikon) – mindig egyértelmű, melyik módban vagyunk.

**S1 · Supervisor belépés** `/supervisor/login` – logó-csempe (72 dp, `accent`), „Supervisor belépés”, kártyában E-mail + Jelszó mező, „Elfelejtett jelszó?”, info sor („Az első belépéshez internet kell…”), **Belépés**, **Vissza a PIN-belépéshez**. Offline első belépésnél: `offline` sáv + letiltott gomb.

**S2 · Telephelyek** `/supervisor/sites` – telephelykártyák: név, útvonal · pontszám, StatusBadge (Rendben / N hiányos / Nincs adat), kompakt 13-as idővonal, „Ma éjjel X / 13 kör”, telefon utolsó szinkronja. „Nincs adat” esetén a kártya 2 dp `miss` keretet kap. Alul **Új telephely** (dashed). Jobb felső: fiók (monogram, 44 dp).

**S3 · Telephely részletei** `/supervisor/sites/[id]` – figyelmeztető sor a legutóbbi problémás körről (→ S4); **Útvonalak** csoport (név, pont, sorrend, verzió, mért bejárási idő; „Új útvonal betanítása”); **Beállítások** csoport (Menetrend, Őrök és PIN-kódok, Jelentések – mindegyik alcímmel összefoglal); **Telephelyi telefon** (név, platform, online/szinkron, várakozó tételek).

**S4 · Kör részletei** `/supervisor/rounds/[id]` – fejléc állapotjelvénnyel, „okt. 26. · {őr} · indult 21:03 · 17 perc”; 300 dp `SiteMap` (útvonal + jelölők + jelmagyarázat); alatta a pontok: előbb a problémásak (hiányzik, időgyanús, nem igazolt, rossz sorrend), utána a rendben lévők.

**S5 · Betanítás – bejárás** `/supervisor/routes/[id]/train`
- Fejléc: X (megszakítás megerősítéssel), „Betanítás · supervisor”, útvonal neve.
- Kártya: **Eltelt idő** (`counter`) + **Rögzített pont**.
- Szabad / Kötött sorrend választó.
- Rögzített pontok számozott listája: név, „NFC · fotó · GPS ±4 m”, jobbra gyalogidő az előzőtől („+1:35”). Utolsó sor: szaggatott „Menj a következő ponthoz…”.
- **Pont leolvasása** (hero) → S6. **Bejárás befejezése** → összegző lap: teljes idő, javasolt időkeret, Mentés (új verzió).

**S6 · Betanítás – pont adatai** `/supervisor/routes/[id]/train/point` – `success` sáv „Címke leolvasva · NFC” + UID + GPS pontosság; **Pont neve** (kötelező), **Utasítás** (opcionális), **Fotó** (opcionális, „segít megtalálni”); **Mentés, jöhet a következő**, „Pont elvetése” (dangerText). Ha a címke már tartozik egy ponthoz: figyelmeztetés, és felajánlja a meglévő pont hozzáadását.

**S7 · Útvonal szerkesztése** `/supervisor/routes/[id]/edit` – info sáv: „Mentéskor új verzió (vN+1) készül…”. Lista: fogantyú (húzható, `react-native-draggable-flatlist`), sorszám, név + meta, szerkesztés (ceruza → név/utasítás/fotó lap), kivétel (mínusz kör, `miss`, megerősítéssel). Húzás közben a sor `runBg` + `accent` keret. Alul: **Új pont felvétele · bejárást igényel** (dashed → S5 egypontos módban) és **Mentés vN+1-ként**.

**S8 · Menetrend** `/supervisor/routes/[id]/schedule`
- Napok: 7 kapszula (H K Sze Cs P Szo V), kijelölt `accent`.
- Indítási időpontok: Lista / Ismétlődés. Ismétlődés: Első kör, Utolsó kör, Gyakoriság (időválasztó kapszulák) + összegzés „13 kör éjszakánként · utolsó 08:00-kor”. Lista: időpont-kapszulák + „Időpont hozzáadása”.
- Időkeret: −/+ (5 perces lépés), érték 40/800, „javasolt érték” (`ok`) vagy „egyéni” (`text2`) felirat, magyarázat: „Mért bejárás 16:20 × 1,5 = 24:30 → 5 percre kerekítve.” Mérés nélkül: „Nincs mérés – alapérték 20 perc.” Kapcsoló: **Nincs időkorlát**.
- **Menetrend mentése**.

**S9 · Őrök és PIN-kódok** `/supervisor/sites/[id]/guards` – őr sorok (monogram 44 dp, név, „PIN beállítva · most műszakban” / utolsó műszak, online pötty); kinyitott sor: **új PIN – csak most látható** (36/800, 0.18em betűköz), „Újat generál”, „Kész”; felfüggesztett őr: halvány név + kapcsoló. Külön csoport: saját supervisor PIN ezen a telefonon. Alul **Új őr**.

**S10 · Jelentésbeállítások** `/supervisor/sites/[id]/reports` – címzett a fejlécben; 4 kapcsolós sor (Műszakjelentés · Napi · Heti · Havi, alcímben időzítés és formátum); „Ha nem jön adat a telephelyről” + időtartam választó (a menetrend vége után); info sáv a számított adatmegőrzésről (31 nap / 2 hónap). **Mentés**.

---

## 7. Interakciók és viselkedés

| Helyzet | Viselkedés |
|---|---|
| Sikeres leolvasás | haptika Success, rövid hang, ResultScreen 3 mp, majd vissza a körhöz |
| Hibás leolvasás | haptika Error, nincs automatikus bezárás |
| Rossz sorrend | haptika Warning, rögzítve, a jelentésben jelölve |
| Időkeret utolsó 5 perce | hátralévő idő `warn` színnel, egyszeri rezgés |
| Időkeret lejárt | kör zárul (teljesítve/hiányos), toast + kezdőlap |
| Ébresztés | hang + rezgés ismétlődve, amíg „Indulok” vagy „Hang némítása” |
| Offline | minden művelet működik, a szinkronjelző „Offline · N vár” |
| Szinkronhiba | szinkronjelző `miss`, koppintásra újrapróbálás |
| Képernyőváltás | natív stack animáció; a ResultScreen fade + scale 0.96→1 (200 ms) |
| Kör közben | `expo-keep-awake` aktív |

## 8. Akadálymentesség

- Kontraszt: szöveg ≥ 4.5:1 mindkét témában (a tokenek ennek megfelelően lettek választva).
- Dinamikus betűméret: `allowFontScaling` maradjon bekapcsolva; a `display` és `counter` számoknál `maxFontSizeMultiplier={1.2}`.
- Minden állapotnak legyen `accessibilityLabel`-je szöveggel („Kazánház, kézi rögzítés, nem igazolt, 22:09”).
- Választók: `accessibilityRole="radio"` / `"switch"` + `accessibilityState`.
- A visszaszámláló `accessibilityLiveRegion="polite"` percenként, ne másodpercenként.

## 9. E-mail (műszakjelentés)

`email/shift-report.blade.php`. Világos, 600 px széles, táblázatos HTML inline stílusokkal (Outlook-kompatibilis), webfont fallback: Arial. Szerkezet: sötét fejléc sáv → telephely, dátum, őr → „később érkezett” / átadás sáv (opcionális) → 4 összesítő csempe → jelölések sor → körök táblázata (13 sor) → események fotó-bélyegképekkel (linkelve, 31 napig érvényes) → hibás körök pontonkénti táblázata → teljesített körök tömör listája → lábléc. Állapotszínek a világos téma tokenjei.

## 10. Döntések a tervezés során

- PIN 6 jegyű.
- Az ébresztésen nincs halasztás; „Indulok” = a kör megnyitása, az idő az első leolvasással indul.
- Az 1. lépcső térképe a leolvasási pontokat köti össze; folyamatos nyomvonal a 2. lépcsőben.
- A supervisor fejlécében mindig „Supervisor” jelvény jelzi a módot.
- Teljesített körök az e-mailben tömörítve; ha minden kör pontonként kell, a táblázat ismételhető.
