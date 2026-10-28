# Döntések – waypost (app)

Ami a fejlesztői specifikációban nincs eldöntve, vagy attól eltér, itt szerepel. Formátum:

```markdown
## ÉÉÉÉ-HH-NN – Rövid cím

- **Kérdés:** …
- **Döntés:** …
- **Indok:** …
- **Érintett:** fájlok, feladatok (M#-##)
```

A közös szerződést (sémák, lánc, menetrend-kibontás) érintő döntések a `../waypost-schema/docs/decisions.md`-ben vannak.

## 2026-10-27 – Az app neve és azonosítói (Q12)

- **Kérdés:** A design „Őrjárat”, a specifikáció „Waypost”. Mi jelenjen meg a telefonon és az e-mailekben, és mi legyen a bundle ID / package name?
- **Döntés:** Név: **Waypost** (telefonon és e-mailben is). iOS bundle ID és Android package name: `com.tamaslabs.waypost`; Expo slug `waypost`, URL-séma `waypost`.
- **Indok:** A felhasználó döntése. A bundle ID az első store-feltöltés után nem változtatható.
- **Érintett:** `app.json`, M1-01, M6 (e-mailek feladója és sablonjai).

## 2026-10-27 – Expo SDK és projektváz

- **Kérdés:** Melyik SDK-val és milyen vázzal induljon a projekt?
- **Döntés:**
  - Expo SDK 58 (a legfrissebb stabil, React Native 0.88, React 19.3, TypeScript 6.0), a `create-expo-app` `default` sablonjából, a demóképernyők és -komponensek nélkül.
  - Csak iOS és Android (`platforms`); a web nem cél. A sablon webes közvetlen függőségei (`react-native-web`, `react-dom`, `expo-web-browser`) kikerültek; az expo-routernek ezek csak opcionálisak.
  - Az ikon és a splash egyelőre az Expo sablon helyőrzője; a design szerinti változat később jön.
  - TypeScript: `strict` + `noUncheckedIndexedAccess`.
  - ESLint: `eslint-config-expo` (flat config), Jest: `jest-expo` preset (Jest 30) + React Native Testing Library 14.
- **Indok:** A specifikáció a legfrissebb stabil SDK-t írja elő; a sablon az Expo által karbantartott alap.
- **Érintett:** `package.json`, `app.json`, `tsconfig.json`, `eslint.config.js`, M1-01.

## 2026-10-27 – A képernyők helye: `src/app/`

- **Kérdés:** A specifikáció mappaszerkezete a képernyőket a gyökérben lévő `app/` mappába teszi, a `src/` mellé. Az SDK 55 óta az Expo sablonja és dokumentációja a `src/app/`-ot használja.
- **Döntés:** A képernyők a `src/app/`-ban vannak; minden forrás a `src/` alatt, a `@/` alias a `src/`-re mutat. A saját Expo-modulok a gyökérben lévő `modules/` mappába kerülnek (az Expo autolinking ott keresi őket).
- **Indok:** Ez az Expo jelenlegi alapértelmezése; ha a `src/app` létezik, a router a gyökér `app/` mappát figyelmen kívül hagyja. A specifikációtól csak elnevezésben tér el.
- **Érintett:** `src/app/`, M1-01, minden képernyő-feladat.

## 2026-10-27 – Tesztek helye

- **Kérdés:** Hol legyenek a tesztek, ha a `src/app/` minden fájlja route?
- **Döntés:** A modulok tesztjei a modul mellett (`src/<modul>/*.test.ts`), a képernyőtesztek a gyökérben lévő `__tests__/` mappában.
- **Indok:** A `src/app/`-ban egy tesztfájl is route lenne.
- **Érintett:** `__tests__/`, `src/`.

## 2026-10-27 – A `@waypost/schema` már az M1-01-ben

- **Kérdés:** A sémacsomag az M3-tól kell; bekössük-e már a vázba?
- **Döntés:** Igen: `"@waypost/schema": "file:../waypost-schema"`, és egy teszt, amely a sémákat és a vektorokat betölti.
  - A Jest a symlinkelt csomagot a valódi útvonalán (`../waypost-schema`) fordítja, és az onnan hivatkozott `@babel/runtime` segédet nem találja; ezért `jest.modulePaths: ["<rootDir>/node_modules"]`.
  - A Metro (SDK 58) külön beállítás nélkül becsomagolja (kipróbálva: `npx expo export --platform android` egy, a sémát importáló képernyővel; a sémák benne voltak a Hermes-bundle-ben). `metro.config.js` ezért nincs.
- **Indok:** A symlinkes, csak ES-modulos csomag a Jest és a Metro kényes pontja; jobb a vázban kideríteni, mint az M3-ban.
- **Érintett:** `package.json`, `__tests__/schema-package.test.ts`, M3-04.

## 2026-10-27 – Téma és feliratok (M1-02)

- **Kérdés:** Hogyan kerüljenek át a design tokenjei és feliratai, és hogyan biztosítjuk, hogy ne legyen beégetett szín és szöveg?
- **Döntés:**
  - A `src/theme/tokens.ts` a handoff fájlja egy eltéréssel: a `statusStyle` és a `syncStyle` feliratai a `hu.json` kulcsai (pl. `'status.completed'`), nem magyar szövegek, így minden felirat egy helyen van. A `syncStyle.offline` két kulcsot kap (`label`, `labelQueued` – ha `count > 0`), a függvények helyett.
  - A `src/i18n/hu.json` a handoff fájlja, kiegészítve az `app.name` („Waypost”, Q12) kulccsal. A `t(key, params)` a `{{név}}` helyőrzőket cseréli; a kulcs típusa a JSON-ból jön (`TranslationKey`), ismeretlen kulcsra vagy hiányzó paraméterre kivételt dob. Többes szám nincs (a magyar feliratokhoz eddig nem kellett).
  - `ThemeProvider` + `useTheme()` + `useThemePreference()`: alapértelmezés a rendszer szerinti téma, de ha a rendszer nem világos, sötét. A kézi választás (Rendszer / Sötét / Világos) egyelőre nem tartós; a beállítások képernyőjével kerül tárolásra.
  - Android navigációs sáv: az SDK 58-ban az app edge-to-edge fut, a sáv háttérszíne nem állítható (`expo-navigation-bar`); helyette a gyökérnézet háttere (`expo-system-ui`) és minden képernyő háttere `color.bg`. Állapotsor: sötét témában világos, világosban sötét ikonok.
  - Manrope 400–800 vastagságonként importálva (a csomag indexe a 200/300-at is becsomagolná); a splash a betöltésig marad, betöltési hiba esetén a rendszerbetűvel megy tovább.
  - Ellenőrzés: ESLint az `src/`-ben – `react-native/no-color-literals`, és `no-restricted-syntax` a JSX-szövegre, a szöveges literálra és a `title`/`label`/`placeholder`/`accessibilityLabel`/`accessibilityHint` propokra. Teszt: a világos és a sötét paletta kulcsai azonosak, minden státusz- és szinkronfelirat létező kulcs, a `hu.json` minden szövege nem üres és csak `{{név}}` alakú helyőrzőt tartalmaz.
- **Indok:** DESIGN_HANDOFF 2–3, specifikáció Alapszabályok 4–5; a lint teszi ellenőrizhetővé a „beégetett szín és felirat nélkül” feltételt.
- **Érintett:** `src/theme/`, `src/i18n/`, `src/app/_layout.tsx`, `eslint.config.js`, M1-02, M3/M5 képernyők, a beállítások képernyője.

## 2026-10-27 – `waypost-clock`: a boot ID forrása és alakja (M1-03)

- **Kérdés:** A specifikáció iOS-en a `kern.boottime`-ból képezné a boot ID-t. A `kern.boottime` azonban a faliórából van levezetve (indulás = most − uptime), ezért az óra átállításakor valószínűleg elmozdul, vagyis újraindítás nélkül is változhat. Így éppen az óra átállításával lehetne elkerülni a `time_suspect` jelzést, amely csak azonos `boot_id` mellett vizsgál.
- **Döntés:**
  - iOS: elsődlegesen a `kern.bootsessionuuid` (minden indításkor új, véletlen UUID), tartalékként a `kern.boottime` (másodpercre). Android: a `Settings.Global.BOOT_COUNT`, tartalékként a kernel `/proc/sys/kernel/random/boot_id`-je.
  - Az érték előtagja mutatja a forrást: `ios-session:<uuid>`, `ios-boottime:<mp>`, `android-boot:<szám>`, `android-kernel:<uuid>`. Mind megfelel a séma `boot_id` mintájának (`^[A-Za-z0-9._:-]{1,64}$`), a JS-oldal ezt ellenőrzi is.
  - Uptime: Android `SystemClock.elapsedRealtime()`, iOS `CLOCK_MONOTONIC` (Darwinon alvás alatt is nő), egész milliszekundum.
  - Az eszközteszten (M1-07, M1-08) ellenőrizni kell: melyik forrás érhető el (az előtagból látszik); újraindítás után a boot ID változik; **az óra kézi átállítása után nem változik**; az uptime alvás alatt is nő (a tesztképernyő „Eltérés” sora 1 mp alatt marad).
- **Indok:** A boot ID-nak csak újraindításkor szabad változnia, különben a szerveroldali időellenőrzés megkerülhető. Ha iOS-en a `kern.bootsessionuuid` nem olvasható, és a tartalék az óraállításra változik, azt a specifikációban kell rendezni (M1-08: STOP-pont).
- **Érintett:** `modules/waypost-clock/`, `src/app/prototype/clock.tsx`, M1-03, M1-07, M1-08, M3 (láncbejegyzés), specifikáció *Láncolt napló*.

## 2026-10-27 – Prototípus-képernyők és modulimport

- **Döntés:** Az M1 eszközpróba-képernyői a `src/app/prototype/` alatt vannak (saját natív fejléccel és vissza gombbal), a kezdőképernyő linkeli őket; a feliratuk a `hu.json` `prototype` szakaszában. A saját Expo-modulok importja `@modules/<név>` aliasszal megy (`tsconfig.json` `paths`; a Metro és a Jest is feloldja).
- **Indok:** A prototípus képernyői az M3-ban a valódi képernyőkre cserélődnek; egy helyen vannak, könnyen törölhetők.
- **Érintett:** `src/app/prototype/`, `src/app/index.tsx`, `tsconfig.json`, M1-03 – M1-06.

## 2026-10-28 – NFC-olvasás: módok és a `tag_uid` / `ndef_raw` képzése (M1-04)

- **Kérdés:** Hogyan olvassuk ki a UID-t és a nyers NDEF-et a két platformon, és pontosan mi kerül a `tag_uid` és az `ndef_raw` mezőbe?
- **Döntés:**
  - `react-native-nfc-manager` 4.2 a config pluginjével. A kód a `src/nfc/`-ben: `tag.ts` (platformfüggetlen feldolgozás), `reader.ts` (a két platform olvasása).
  - **Android:** `registerTagEvent` reader mode-ban (NFC-A/B/F/V), nem foreground dispatch-csel: így a címke csak ehhez az apphoz jut (nem ugrik fel a rendszer „új címke” ablaka, más app nem kapja el), és nem jön új Intent. A figyelés csak addig él, amíg a képernyő fókuszban van (`useFocusEffect`); háttérbe kerüléskor a könyvtár kikapcsolja, visszatéréskor visszakapcsolja. A rendszer olvasási hangja egyelőre megmarad (nincs `FLAG_READER_NO_PLATFORM_SOUNDS`); a saját haptika és hang az M3-22-ben jön, a kettő viszonya ott dől el.
  - **iOS:** nem NDEF-munkamenet (az nem adja meg a UID-t), hanem `NFCTagReaderSession`: `requestTechnology([MifareIOS, IsoDep])`, majd `getTag()` (UID + NDEF). Az NTAG21x MIFARE-ként, az NTAG 424 DNA ISO 7816-ként jelentkezik; ehhez az `Info.plist`-be kell az NDEF-alkalmazás AID-ja (`D2760000850101`). Entitlement csak `TAG` (`includeNdefEntitlement: false`): NDEF-munkamenetet nem használunk, és az App Store az `NDEF` formátumot a mai SDK-kkal elutasítja. Ha a felhasználó bezárja a rendszerablakot, vagy az lejár, az nem hiba, csak nincs leolvasás.
  - A munkamenet szövegei („Tartsd a telefont a címkéhez”, „Címke leolvasva”) a `hu.json` `nfc` szakaszában vannak, mert az M3 kör- és betanítás-képernyője is ezeket használja. Az iOS NFC-engedély szövege az `app.json`-ban van (a config plugin oda írja).
  - **`tag_uid`:** nagybetűs hex, elválasztó (`:`, `-`, szóköz) nélkül, 4–10 bájt – a séma mintája. Ami ennek nem felel meg, abból `uid = null` lesz; a nyers érték megmarad (a hibaképernyőn kijelezhető).
  - **`ndef_raw`:** a platformok csak a feldolgozott rekordokat adják át, ezért az app újra sorosítja az NDEF-üzenetet (NFC Forum NDEF: rövid rekord, ha a payload 256 bájtnál rövidebb; darabolás nélkül), és base64-ben tárolja. Ez a címke NDEF-üzenete, nem a teljes memóriája (a capability container és a TLV-keret nincs benne). Az NTAG 424 DNA SUN-adata (a URI-rekord paraméterei) így változatlanul megmarad, a 2. lépcsőben ellenőrizhető. A sémában megengedettnél (8192 base64 karakter) hosszabb üzenet nem kerül tárolásra (`ndef_raw = null`).
  - Az eszközteszten (M1-07, M1-08) ellenőrizni kell: mindkét címkénél a UID és az NDEF mindkét telefonon; iOS-en a 424 DNA valóban jelentkezik-e; Androidon nem jelenik-e meg a rendszer ablaka; ugyanannak a címkének a UID-ja a két telefonon azonos. **Az NTAG 424 DNA „Random ID” beállítása legyen kikapcsolva:** bekapcsolva a UID 4 bájtos és olvasásonként más, így a pont nem azonosítható.
- **Indok:** Specifikáció *Mobilapp / NFC és QR* és *Láncolt napló* (`tag_uid`, `ndef_raw`); a reader mode a megbízhatóbb előtérbeli olvasás, iOS-en pedig csak a tag-munkamenet adja meg a UID-t.
- **Érintett:** `src/nfc/`, `src/app/prototype/nfc.tsx`, `src/i18n/hu.json`, `app.json`, M1-04, M1-07, M1-08, M3-18, M3-22, M5-12.
