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

## 2026-10-28 – QR-olvasás: elfogadott kódok és ismétlésszűrés (M1-05)

- **Kérdés:** Pontosan mely kódokat fogadja el a QR-olvasó, és mi történik, amíg egy kód a képben marad?
- **Döntés:**
  - `expo-camera` `CameraView`, csak `qr` vonalkódtípus, hátsó kamera. A config plugin csak a kamera-engedélyt kéri: a mikrofon (`microphonePermission: false`) és az Android `RECORD_AUDIO` (`recordAudioAndroid: false`) nincs benne, mert hangot nem veszünk fel. Az iOS-engedély szövege a fotózást is említi (M3-21), hogy később ne kelljen módosítani.
  - **Elfogadás:** minden kód, amely pontosan a `waypost:cp:` előtaggal kezdődik (kis- és nagybetű számít) és legfeljebb 255 karakter – a láncbejegyzés `qr_payload` mezőjének sémája szerint. A szöveg nem módosul (nincs trim, nincs kisbetűsítés): a pont feloldása a teljes payloaddal megy (M3-18), és az előtaggal kezdődő, de ismeretlen kód `unknown_tag`-ként rögzül. A teljes pontkód-formátumot (`waypost:cp:<UUIDv7>:<16 karakter>`) az olvasó nem követeli meg, csak a prototípus képernyője jelzi az eltérést. Minden más kódot (URL, termékkód, Wi-Fi) az olvasó jelzés nélkül figyelmen kívül hagy; a prototípus képernyője a legutóbbit mutatja, hogy az eszközteszten ez is ellenőrizhető legyen.
  - **Ismétlésszűrés:** a kamera képkockánként jelenti a látott kódot. Egy kód egyszer számít; újra csak akkor, ha legalább 2 mp-ig nem volt a képben (kódonként külön, monoton órával). A körbeli ismétlést („Már leolvasva”) ettől függetlenül a domain kezeli (M3-18).
  - A kamera csak a fókuszban lévő képernyőn fut (`useIsFocused`): egyszerre csak egy kameranézet lehet aktív. Ha az engedélyt végleg elutasították, a gomb a rendszerbeállításokat nyitja.
  - A kód a `src/qr/`-ben: `payload.ts` (elfogadás, formátum), `scan-filter.ts` (ismétlésszűrés), `qr-scanner.tsx` (kameranézet), az M3-22 és az M5-12 is ezt használja. A prototípus (`src/app/prototype/qr.tsx`) folyamatosan olvas, lámpa-kapcsolóval (sötét folyosón a nyomtatott kódhoz).
  - Az eszközteszten (M1-07, M1-08) ellenőrizni kell mindkét telefonon: kinyomtatott és képernyőn megjelenített kód is beolvasható (fényes képernyő, tükröződés, kis méret); a lámpa működik; egy idegen QR-kód (pl. URL) nem kerül a listába; a képben tartott kód csak egyszer számít.
- **Indok:** Specifikáció *Mobilapp / NFC és QR* („csak a `waypost:cp:` előtagú kódokat fogadja el”) és *Állapotgépek / Leolvasás* (feloldás a teljes payloaddal, `unknown_tag`).
- **Érintett:** `src/qr/`, `src/app/prototype/qr.tsx`, `src/i18n/hu.json`, `app.json`, M1-05, M1-07, M1-08, M3-18, M3-21, M3-22, M5-12.

## 2026-10-28 – Ébresztés: csatorna, pontos riasztás, akkumulátor, iOS (M1-06)

- **Kérdés:** Hogyan teljesíti az `expo-notifications` a specifikáció ébresztési követelményeit (pontos időpont zárolt képernyőn és bezárt appal, saját hang, Android-engedélyek, iOS `timeSensitive`), és mi hiányzik belőle?
- **Döntés:**
  - **Ütemezés:** `DATE` trigger a `rounds` csatornán, **`delivery: 'alarmClock'`** (`AlarmManager.setAlarmClock()`): ezt a Doze és az akkumulátor-optimalizálás sem halasztja; az állapotsorban ébresztőóra-ikon látszik, amíg van ütemezett értesítés. Pontos riasztás engedélye nélkül az Android pontatlan kézbesítésre vált vissza. Az `expo-notifications` az újraindítás után maga ütemezi újra az értesítéseket (`RECEIVE_BOOT_COMPLETED`).
  - **Pontos riasztás:** `SCHEDULE_EXACT_ALARM` az `app.json` `android.permissions`-ben; állapot és kérés az `expo-notifications` `getExactAlarmPermissionsAsync()` / `requestExactAlarmPermissionsAsync()` függvényével (Android 14-től új telepítésnél alapból tiltott). A `USE_EXACT_ALARM`-ot nem használjuk: azt a Google Play csak ébresztőóra- és naptáralkalmazásoknak engedi.
  - **`rounds` csatorna:** `MAX` fontosság, saját hang (`round_alarm.wav`), rezgésminta, a zárolt képernyőn teljes tartalommal. A hang **riasztásként** szól (`AudioAttributes` `usage = ALARM`): a riasztás hangerején, némított csengőnél is; csak a „Ne zavarjanak” mód tartja vissza. Az Android a csatorna hangját, fontosságát és rezgését a létrehozás után nem engedi módosítani: ha ezek változnak, új csatornaazonosító kell.
  - **Akkumulátor-optimalizálás:** az `expo-notifications` nem kezeli, ezért egy kis saját modul készült: `modules/waypost-power` (csak Android), `isIgnoringBatteryOptimizations()` és `requestIgnoreBatteryOptimizations()`. Ez utóbbi a rendszer párbeszédablakát nyitja (`ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, a `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` engedéllyel), ha a gyártó ezt eltávolította, akkor a beállítások listáját. iOS-en ez a beállítás nem létezik (`null`). A Google Play ezt az engedélyt csak indokolt esetben fogadja el; a terjesztés belső (M7-02), és egy éjszakai őrjárat-ébresztő indokolt eset.
  - **iOS:** `interruptionLevel: 'timeSensitive'` az értesítésben és a `com.apple.developer.usernotifications.time-sensitive` entitlement az `app.json`-ban (az EAS a provisioning profile-ba is beállítja). Hogy a felhasználó nem kapcsolta-e ki a Beállításokban, az `expo-notifications`-ből nem olvasható ki; a prototípus képernyője ezért csak útmutatást ad, az eszközteszt kézzel ellenőrzi. A távoli (push) értesítés ki van kapcsolva (`enableRemoteNotifications: false`, nincs `aps-environment`); az Expo Push a 2. lépcsőben jön.
  - **Saját hang:** `assets/sounds/round_alarm.wav` – helyőrző (4 mp, kéthangú csipogás, 44,1 kHz, 16 bit mono WAV, mindkét platformon lejátszható, az iOS 30 mp-es korlátja alatt); a végleges hang a designnal jön, ugyanezen a néven. Az értesítés hangja egyszer szól; az ismétlődő hang és rezgés az ébresztés képernyőjének feladata (G4, M3-32).
  - **Előtérben** is megjelenik és szól az értesítés (`setNotificationHandler`); a prototípus ilyenkor a késést is kiírja.
  - **Próbasorozat:** egész negyedórákra (helyi :00, :15, :30, :45) 3 órán át 12 értesítés, az első legalább 1 perccel később; minden ütemezés az összes korábbit lecseréli (mint az M3-24-ben). Az értesítés címe az ütemezett időpontot mutatja, így a telefonon a késés leolvasható.
  - A teljes képernyős értesítés (full-screen intent, G4) nem része az M1-06-nak; az M3-32-ben dől el.
  - A kód a `src/alarms/`-ban: `channel.ts`, `permissions.ts`, `foreground.ts` (az M3-24 és az M5-10 is ezeket használja), `test-schedule.ts` és `test-alarms.ts` (csak a prototípushoz). Képernyő: `src/app/prototype/alarms.tsx`.
  - Az eszközteszten (M1-07, M1-08) ellenőrizni kell mindkét telefonon: a 12 értesítés pontosan szól zárolt képernyőn, háttérben és bezárt appal (Androidon a legutóbbi appok közül kisöpörve is); némított telefonon is szól (Android: riasztás-hangerő; iOS: a némító kapcsoló a `timeSensitive`-et nem engedi át, ezt fel kell jegyezni); a saját hang és a rezgés; az Android-engedélyek (pontos riasztás, akkumulátor) kérése és állapota; újraindítás után is szól; Androidon gyártói energiatakarékos mód mellett is.
- **Indok:** Specifikáció *Mobilapp / Ébresztés*; M1: „3 órán át 15 percenként pontosan szól zárolt képernyőn, háttérben és bezárt appal is”.
- **Érintett:** `src/alarms/`, `modules/waypost-power/`, `src/app/prototype/alarms.tsx`, `assets/sounds/`, `app.json`, `src/i18n/hu.json`, M1-06, M1-07, M1-08, M3-24, M3-32, M5-10, M7-02.

## 2026-10-28 – Az M1 lezárása telefonos elfogadás nélkül (M1-08)

- **Kérdés:** Lezárható-e az M1, ha az M1-08 telefonos elfogadása (Android + iPhone, `device-test.md`) nem futott le?
- **Döntés:** Igen, a projekt gazdájának döntése alapján. A prototípusok elkészültek, a tesztek zöldek, a helyi debug build az Android-emulátoron (API 37) elindult. Telefonon nem futott ellenőrzés, ezért a `device-test.md` M1-es eredményei üresek, és a következő ellenőrzések nyitottak:
  - NFC: valódi címke olvasása (NTAG21x, NTAG 424 DNA), a UID mindkét platformon azonos-e, iOS-en a 424 DNA jelentkezik-e (N1–N6);
  - az uptime nő-e alvás alatt, és a boot ID viselkedése iPhone-on (C2–C4);
  - QR kinyomtatott és képernyőn megjelenített kóddal, valódi kamerával (Q1–Q5);
  - az ébresztés pontossága zárolt képernyőn, háttérben, bezárt appal, némítva, újraindítás és gyártói energiatakarékos mód után; iOS-en a `timeSensitive` (E1–E9, Á1, Á8).

  Ezeket a `device-test.md` M1-es tételeivel az első telefonos eszköztesztnél (legkésőbb az M3 végén) kell lefuttatni. Ha akkor valamelyik `❌`, a specifikációt kell módosítani, ahogy az M1-08 előírja.
- **Indok:** A projekt gazdája az M1-et késznek tekinti; a kockázat a fenti tételekben marad.
- **Érintett:** M1-03–M1-06, M1-08, `docs/device-test.md`, M3.

## 2026-10-28 – Helyi adatbázis (M3-01)

- **Kérdés:** Hogyan készüljenek és fussanak a migrációk, és pontosan miben tér el a helyi séma a szerverétől?
- **Döntés:**
  - `expo-sqlite` + Drizzle ORM (0.45, szinkron SQLite-driver). A séma a `src/db/schema.ts`-ben van; a migrációkat a `drizzle-kit` generálja (`npm run db:generate`) a `src/db/migrations/` alá, és commitoljuk őket. A `.sql` fájlokat a `babel-plugin-inline-import` szövegként fordítja be (`babel.config.js`; a `metro.config.js` a `sql` kiterjesztést is felveszi), így a migrációk a bundle-ben vannak. Indításkor az `openDatabase()` nyitja meg a `waypost.db`-t (`journal_mode = WAL`, `synchronous = FULL`: egy lezárt tranzakció áramszünetet is túlél), és lefuttatja a még nem futott migrációkat; addig a splash marad, hiba esetén hibaképernyő jön újrapróbálással.
  - Az oszlopnevek a `@waypost/schema` mezőnevei (snake_case), így a pullban érkező rekordok átalakítás nélkül tárolhatók; a teszt a séma minden érvényes entitáspéldáját beírja és visszaolvassa. Időbélyeg: ISO 8601 UTC szöveg (szövegként is időrendben rendeződik), logikai érték: 0/1, JSON: szöveg.
  - Eltérések a szerver tábláitól: `users` e-mail és jelszó nélkül, a pull `site_ids` mezője a `site_user` táblába kerül; `devices` titok, `last_seq`, `last_hash` és időbélyegek nélkül, a pull alakjában; `checkpoints` a koordinátát az entitássémához hasonlóan `lat_e7` / `lng_e7` / `accuracy_dm` egészként tárolja; `chain_entries` a csak szerveroldali `received_at`, `verify_status`, `flags` nélkül, de `synced_at`-tal, `UNIQUE(device_id, seq)`; `media` a szerveroldali `path` helyett `local_uri`-t (a fájl a telefonon) és `uploaded_at`-ot tart. Új táblák: `outbox` (metódus, útvonal, törzs, idempotencia-kulcs, `acting_user_id`, próbálkozások, következő próbálkozás, utolsó hiba – az M5-03 tölti fel) és `kv` (kulcs → JSON; a kulcsok típusosak: `src/db/kv.ts`).
  - **Nincs idegen kulcs**, és a címke-UID és a QR-payload indexe nem egyedi: a hivatkozási épséget a szerver őrzi, egy pull-oldal pedig egy címkét átrakhat egyik pontról a másikra. Ráadásul egy pullban érkező törlés nem törölhet kaszkádolva az eszközön keletkezett adatból.
  - A tesztek a `better-sqlite3`-on futnak (`src/db/testing.ts`), ugyanazzal a migrátorral és ugyanazokkal a migrációkkal, mint az app.
- **Indok:** Specifikáció *Adatbázis* (utolsó bekezdés) és *Repo és technológiai stack* („migrációk a kódban, induláskor futnak”); Alapszabályok 6.
- **Érintett:** `src/db/`, `babel.config.js`, `metro.config.js`, `drizzle.config.ts`, `src/app/_layout.tsx`, M3-01, M3-07, M3-11, M3-21, M5-03.

## 2026-10-28 – Azonosító, időbélyeg és megbízható idő (M3-02)

- **Döntés:**
  - **UUIDv7** saját megvalósítással (`src/id/uuidv7.ts`, RFC 9562): 48 bites ezredmásodperc, 12 bites számláló, 62 véletlen bit (`expo-crypto` `getRandomValues`). Egy generátor azonosítói szigorúan növekvők, egy ezredmásodpercen belül és az óra visszaállítása után is (a számláló az utolsó időbélyegtől folytatódik, túlcsorduláskor az időbélyeg lép tovább).
  - **Időbélyeg:** `toTimestamp()` / `parseTimestamp()` (`src/time/timestamp.ts`) pontosan a séma `common/timestamp.json` alakjával; más alakot (eltolás, ezredmásodperc nélkül, nem létező nap) elutasít.
  - **Óra:** a `readClock()` egyszerre olvassa a faliórát, az uptime-ot és a boot ID-t (a boot ID-t egyszer, mert futás közben nem változhat).
  - **Megbízható idő:** sikeres szinkronkor a `server_time` a hozzá tartozó uptime-mal és boot ID-val a `kv` `sync.time_ref` kulcsára kerül. A becslés `server_time + (uptime − ref_uptime)`, ha a referencia ugyanebből a bootból való (és az uptime nem kisebb nála); különben a falióra, `source: 'device'` jelzéssel. A láncbejegyzés `ref_*` mezői mindig az utolsó szinkron referenciáját hordozzák, más bootból is: a szerver a `boot_id = ref_boot_id` egyezésből látja, hogy használható-e.
- **Indok:** Specifikáció *Szinkron protokoll / Pull* és *Láncolt napló* (`time_suspect`); CLAUDE.md (UUIDv7, ISO 8601 UTC ezredmásodperccel).
- **Érintett:** `src/id/`, `src/time/`, `src/db/kv.ts`, M3-02, M3-07, M3-11.

## 2026-10-28 – Secure store (M3-03)

- **Döntés:**
  - `expo-secure-store`, három kulcs: `waypost.supervisor_token`, `waypost.device_token`, `waypost.device_secret` (`src/auth/credentials.ts`). A titok csak 32 bájtos base64 lehet; a token és a titok csak együtt érvényes.
  - `keychainAccessible: AFTER_FIRST_UNLOCK`: a telefon újraindítás utáni első feloldásától zárolt képernyőnél is olvasható, mert az ébresztés és a szinkron zárolt telefonon fut. (A `…_THIS_DEVICE_ONLY` változatot az SDK 58 dokumentációja elavultnak jelöli.)
  - Az eszköz azonosítója nem titok, ezért a `kv` `device.id` kulcsán van. Ez egyben jelzi, hogy az adatbázis ismeri az eszközt: az iOS Keychain az app törlése után is megmarad, ezért újratelepítéskor a régi token és titok ott lehet, a láncuk viszont a régi adatbázissal elveszett. Ilyenkor (titok van, `device.id` nincs) az app indításkor törli őket, és a telefon hozzárendeletlen.
- **Indok:** Specifikáció *Telephelyi telefon hozzárendelése* (4. pont) és *Adatbázis* (a titok a secure store-ban van).
- **Érintett:** `src/auth/`, M3-03, M3-05, M3-11, M5-09.

## 2026-10-28 – API-kliens (M3-04)

- **Döntés:**
  - **Alap-URL** az előtaggal együtt (pl. `https://example.com/api/waypost/v1`): build idejű `EXPO_PUBLIC_WAYPOST_API_URL`; fejlesztői buildben a fejlesztői hozzárendelő képernyőn megadott cím (`kv` `dev.api_base_url`) felülírja.
  - Minden író kérés `Idempotency-Key` fejlécet kap: új UUIDv7-et, vagy a hívó által megadottat (az outbox a tárolt kulcsát adja, hogy az újraküldést a szerver felismerje). `X-Acting-User` a megadott supervisorral. Időkorlát: 30 mp.
  - **Hibák:** `ApiError` (HTTP-státusz, `code`, magyar `message`, `details`, `Retry-After` másodpercben), `NetworkError` (nincs válasz vagy lejárt az idő), `InvalidResponseError` (a 2xx válasz nem JSON, vagy fejlesztői buildben nem felel meg a sémának). Ha a hibaválasz nem a hibaformátumban jön (pl. proxy HTML-oldala), a kód a státuszból képződik (401 → `unauthenticated`, 5xx → `server_error`, egyéb 4xx → `bad_request` …), `fromServer: false` jelzéssel.
  - **Sémaellenőrzés** fejlesztői buildben (`__DEV__`): a kérés törzse és a 2xx válasz Ajv 2020-szal, a `waypost-schema` saját beállításaival (`strict`, `allErrors`, `ajv-formats`); a sémák első használatkor fordulnak le. A hibaválaszt csak szerkezetileg nézzük, hogy egy nem várt hibaoldal ne takarja el a státuszt. Az Ajv a release bundle-ben is benne van (a Metro statikusan gyűjti a függőségeket), de nem fut.
  - A végpontok típusos függvények (`src/api/endpoints.ts`); a típusok a `@waypost/schema`-ból jönnek.
- **Indok:** Specifikáció *API-szerződés*, *Hibaformátum* és *Repo és technológiai stack* (a csomag szabályai).
- **Érintett:** `src/api/`, M3-04, M3-06, M3-07, M4, M5-03.

## 2026-10-28 – Útvonalak és indulási állapotok (M3-05, Q1 részben)

- **Kérdés:** A design (`DESIGN_HANDOFF.md`) más útvonalneveket használ (`/(guard)/pin`, `/supervisor/...`), mint a specifikáció (`(auth)/pin`, `(supervisor)/...`). Melyik a mérvadó?
- **Döntés:**
  - Az útvonalak a **specifikáció** csoportjai és nevei szerint készülnek: `(auth)/login`, `(auth)/pin`, `(guard)/…`, `(supervisor)/…`. A design útvonalai csak a képernyők azonosítására szolgálnak. A csak a designban szereplő képernyőkről (G2, G4, G6, S4, S6) a saját feladatuknál születik döntés (M3-30, M3-32, M3-34, M5-13, M5-20); a Q1 ebben a részében nyitott marad.
  - **Indulási állapot** (`src/auth/startup.ts`, `src/auth/session.ts`): telephelyi telefon, ha van eszköztoken és -titok, és az adatbázis ismeri az eszközt; supervisor saját telefonja, ha csak supervisortoken van; különben hozzárendeletlen. A telephelyi telefonon maradt supervisortokent (megszakadt hozzárendelés) az app törli. Az állapot Zustand-tárban van (`useSession`), benne a PIN-nel belépett felhasználó (`activeUser`, az M3-15 tölti ki).
  - **Navigáció:** a gyökér-Stack `Stack.Protected` őrökkel nyitja a csoportokat (`src/navigation/`): `(auth)` – a `login` csak hozzárendeletlen telefonon, a `pin` a telephelyi telefonon, amíg nincs belépett felhasználó; `(guard)` – őr PIN-belépése után; `(supervisor)` – a supervisor saját telefonján, vagy ha a telephelyi telefonon supervisor lépett be PIN-nel (M5-04). Az `index` az állapot kezdőképernyőjére irányít; ha az állapot változik, a már nem engedett képernyőről a router az `index`-re, onnan a kezdőképernyőre visz.
  - A képernyők egyelőre helyőrzők (cím + „Ez a képernyő még készül.”); fejlesztői buildben a fejlesztői eszközökre linkelnek. A **fejlesztői eszközök** (`/dev`) és az M1 prototípus-képernyői (`/prototype/…`) csak fejlesztői buildben érhetők el; a régi prototípus-kezdőképernyő a `/dev` menüje lett.
- **Indok:** Specifikáció *Mobilapp*; a `Stack.Protected` az expo-router ajánlott megoldása a hozzáféréshez kötött útvonalakra.
- **Érintett:** `src/app/`, `src/auth/`, `src/navigation/`, `src/components/`, M3-05, M3-15, M3-29 – M3-38, M5-04 – M5-09, Q1.

## 2026-10-28 – Fejlesztői eszköz-hozzárendelés (M3-06, Q7)

- **Kérdés:** Hogyan legyen M3-ban hozzárendelt telefon, ha a hozzárendelés felülete csak M5-ben készül?
- **Döntés:** A javaslat szerint: a `/dev/enroll` képernyő, csak fejlesztői buildben. Lépések: API-cím (elmentve a `kv`-be), supervisor e-mail és jelszó → `POST /auth/login` → `GET /sites` → telephely kiválasztása → `POST /devices/enroll` (név: a telefon neve, platform, appverzió). A token és a titok a secure store-ba, az eszköz az adatbázisba kerül, a pull kurzora törlődik (a következő pull teljes). Utána az app kijelentkezteti a supervisort a szerveren (ha ez nem sikerül, a hozzárendelés attól még érvényes), és törli a tokenjét; a supervisortoken ezen a képernyőn csak a memóriában van. Végül a telefon telephelyi telefon lesz (PIN-képernyő). A folyamat (`enrollThisPhone`) az M5-09 valódi képernyőjén is ezt használja. A hozzárendelés utáni azonnali teljes pull az M3-07-tel jön.
  - Kipróbálva a `laravel-waypost` workbench-én (`composer serve`, demó-telephely): belépés, telephelylista, hozzárendelés, kijelentkezés és teljes pull a valódi szerverrel, minden válasz sémaellenőrzéssel (Node-ból, a Jest-környezetben). Telefonon még nem futott; ez a `device-test.md` M3-as I1–I5 tétele.
- **Indok:** Az M3 offline teszteléséhez hozzárendelt telefon kell (M3-40).
- **Érintett:** `src/app/dev/`, `src/auth/enrollment.ts`, `src/api/`, M3-06, M3-07, M5-09, Q7.
