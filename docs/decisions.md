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

## 2026-10-29 – Pull (M3-07)

- **Kérdés:** Oldalanként vagy egyben kerüljön-e a pull a helyi adatbázisba? Mi törlődjön a `reset` jelzésű (teljes állapotot kezdő) oldalnál? Mi legyen, ha a szerver nem ismeri a kurzort?
- **Döntés:**
  - Az app előbb **minden oldalt** lekéri (amíg `has_more` igaz), és csak utána írja be őket sorrendben, **egyetlen SQLite-tranzakcióban**, a végső kurzorral és a `server_time`-mal együtt. Ha bármelyik kérés vagy az írás elbukik, semmi nem változik, a kurzor nem lép. A megbízható idő alapja az utolsó oldal `server_time`-ja, azzal az óraállással (uptime, boot ID), amely a válasz megérkezésekor volt.
  - **`reset`:** a tranzakción belül, az oldal alkalmazása előtt törlődik a helyi konfiguráció (`sites`, `users`, `site_user`, `devices`, `checkpoints`, `routes`, `schedules`, `report_subscriptions`). Az **útvonalverziók és pontjaik maradnak**: nem változnak, a szerver sem törli őket, és egy futó kör a megnyitáskor rögzített verziót használja végig. Az eszközön keletkezett adat (lánc, vetületek, média, outbox) érintetlen.
  - Felhasználónál a `site_ids` a `site_user` táblába kerül: a felhasználó minden frissítése lecseréli a sorait; törölt felhasználó vagy telephely sorai is törlődnek.
  - Ha a szerver a kurzort elutasítja (422 `validation_failed`, `cursor` részlettel – pl. a szerver újratelepítése után), az app kurzor nélkül, teljes állapottal kezdi újra. Ha `has_more` igaz, de a kurzor nem mozdult, a pull hibával áll le (végtelen ciklus helyett).
  - A sikeres, valamit módosító pull után esemény megy a többi modulnak (`onConfigurationPulled`, `src/sync/events.ts`) az összegzéssel (`reset`, listánként a módosított és törölt rekordok száma); az ébresztés-ütemezés (M3-24) erre iratkozik fel.
- **Indok:** Specifikáció *Szinkron protokoll / Pull*. Az egy tranzakció miatt az őr soha nem dolgozik félig új konfigurációval (pl. új pontok új útvonalverzió nélkül); a telephely teljes állapota néhány száz rekord, a memóriában tartása nem gond.
- **Érintett:** `src/sync/pull.ts`, `src/sync/events.ts`, `src/db/kv.ts`, M3-07, M3-24.

## 2026-10-29 – Szinkron-vezérlő és szinkronállapot (M3-08, M3-09)

- **Kérdés:** Hogyan működjön a mutex, ha szinkron közben új kérés jön? Mit jelent a „2 mp-es késleltetés összevonással”? Honnan tudja az app, hogy online?
- **Döntés:**
  - **Mutex:** egyszerre egy szinkron fut. A futás közben érkező kérések (bármennyi) egyetlen további szinkronba olvadnak, amely a futó után azonnal indul – így a közben írt láncbejegyzés sem marad a következő indítóig. A `sync()` sosem dob: az eredmény `ok`, `skipped` (hozzárendeletlen telefon, nincs API-cím vagy token) vagy `failed` a hibázó lépéssel.
  - **Sorrend:** push → média → outbox → pull; az első hibánál a többi lépés nem fut. A push és a média az M4-ben, az outbox az M5-ben kap tartalmat, most üres lépések.
  - **Késleltetés:** láncbejegyzés után 2 mp, és minden újabb bejegyzés újraindítja (trailing debounce), így a gyors leolvasások egy szinkronba kerülnek.
  - **Indítók** (`src/sync/runtime.ts`, a gyökér-layout indítja, ha az adatbázis és a munkamenet betöltött): indulás; előtérbe kerülés (`AppState`); a hálózat visszatérése (NetInfo: offline → online); előtérben 5 percenként (háttérben az időzítő áll); a munkamenet módjának változása (pl. hozzárendelés után azonnal teljes pull); `notifyChainEntry()` (a láncíró hívja, M3-11) és `requestSync('shift_closed')` (műszakzárás, M3-16).
  - **Token:** a telephelyi telefonon az eszköztoken (a PIN-nel belépett supervisor nevében is), a supervisor saját telefonján a supervisortoken.
  - **NetInfo:** `@react-native-community/netinfo` (a specifikáció NetInfót ír). Online, ha `isConnected` igaz és `isInternetReachable` nem hamis. Natív csomag: **új development build kell**. A Jestben a csomag saját mockja fut (`jest.setup.ts`).
  - **Szinkronállapot** (`useSyncStatus`, `src/sync/status.ts`): online/offline, fut-e szinkron, feltöltetlen tételek száma (nyugtázatlan láncbejegyzés + fel nem töltött fotó + outbox-sor), az utolsó sikeres szinkron ideje (megbízható idő, a `kv` táblában is, hogy újraindítás után is látszódjon), az utolsó hiba (fajta: `network`, `unauthenticated`, `device_revoked`, `rate_limited`, `server`, `invalid_response`, `unknown`; lépés; üzenet; időpont) és a „Szinkron most” művelet. A feliratokat a szinkronjelző (M3-28) rendeli a fajtákhoz.
- **Indok:** Specifikáció *Szinkron protokoll / Mikor fut*. A vezérlő I/O nélküli, ezért a mutex, a debounce és a sorrend Jestben pontosan tesztelhető.
- **Érintett:** `src/sync/controller.ts`, `src/sync/runtime.ts`, `src/sync/status.ts`, `src/sync/pending.ts`, `src/app/_layout.tsx`, `jest.setup.ts`, M3-08, M3-09, M3-11, M3-16, M3-28, M4-09 – M4-11, M5-03.

## 2026-10-29 – Lánc: kanonikus JSON, HMAC, láncíró és bejegyzés-építők (M3-10 – M3-12)

- **Kérdés:** Saját vagy kész `canonical_json` legyen? Mit véd a globális írási zár, és mi kerül egy tranzakcióba? Ki írja a vetületeket (`shifts`, `rounds`, `scans`, `incidents`), és milyen idővel? Hogyan lesz a helyadatból egész szám?
- **Döntés:**
  - **`canonical_json`** (`src/chain/canonical-json.ts`): saját, a `waypost-schema` szűkített JCS-szabályai szerint (döntés: „A kanonikus JSON pontos szabályai”), a `scripts/jcs.js` mintájára. A szövegek escape-elését is maga végzi, nem a `JSON.stringify`, így a kimenet nem függ a JS-motortól (Hermes). Lebegőpontos szám, ±(2⁵³ − 1)-en kívüli egész, `NaN`, `Infinity`, magányos surrogate, `undefined` és nem egyszerű objektum (pl. `Date`) esetén `CanonicalJsonError`.
  - **HMAC** (`src/chain/hmac.ts`): `react-native-quick-crypto` (`createHmac`, natív OpenSSL, szinkron), a kulcs az eszköztitok (32 bájt, base64). A csomag a PIN-ellenőrzés PBKDF2-jéhez (M3-15) is kell. A Jestben a csomag saját mockja fut, ami a `node:crypto`-ra irányít (`jest.setup.ts`). Natív csomag (Nitro modules): **új development build kell**.
  - **Láncíró** (`src/chain/writer.ts`, `appendChainEntries` / `appendChainEntry`): csak ez ír a `chain_entries` táblába. A domain egy vázlatot ad (`type`, `payload`, `gnss_time`), a többit a láncíró tölti ki: UUIDv7 azonosító, `device_id` (a `kv` `device.id`), `seq`, `prev_hash`, órák (`device_time`, `uptime_ms`, `boot_id`), `ref_*` (a `kv` `sync.time_ref`). A **globális zár** egy ígéretlánc: a kérések a hívás sorrendjében, egyenként futnak le (a titok olvasása is a záron belül van), így a `seq` sorrendje a hívások sorrendje. Egy hívás több bejegyzést is írhat (pl. kézi rögzítés: `scan` + `incident`; váltás: `round_closed` + `shift_closed` + `shift_started`). A hívás összes bejegyzése és vetülete **egy SQLite-tranzakcióban** íródik: vagy mind megmarad, vagy egyik sem, és a `seq` sem lép. Fejlesztői buildben (és a Jestben) minden bejegyzést a `chain/entry.json` sémával is ellenőriz, mielőtt írná. Hozzárendeletlen telefonon (nincs `device.id` vagy titok) hibát dob. Új hozzárendelés (új `device_id`) új láncot kezd 1-től. Sikeres írás után `notifyChainEntry()` (2 mp-es szinkron, M3-08).
  - **Vetületek** (`src/chain/projection.ts`): a láncíró alkalmazza őket, ugyanabban a tranzakcióban, kizárólag a bejegyzésből. A domain tehát csak a bejegyzéseket állítja elő, a vetületet nem írja. A telefonon történt dolog ideje a bejegyzés `device_time`-ja (`started_at`, `ended_at`, `scanned_at`, `occurred_at`; a kör `finished_at`-ja a payloadból). A kör az első olyan leolvasásnál lesz `in_progress`, amelyhez pont tartozik (ismeretlen címkénél nem). Ha egy bejegyzés nem illik az állapothoz (ismeretlen vagy már zárt műszak vagy kör), `ProjectionError`, és a tranzakció visszagördül: ez az építő hibája. A fotók `media` sorait nem a láncíró írja, hanem a fotómodul (M3-21).
  - **Építők** (`src/chain/payloads.ts`): típusonként egy függvény, minden hiányzó mező `null`, a `media` `[{id, sha256}]`. Koordináta: fok × 10⁷, egész, kerekítés a nullától távolodva (tükrös, `-0` nélkül), tartományon kívül `RangeError`. Pontosság: méter × 10, egész; ismeretlen, negatív vagy nem véges pontosság `null`. Az NFC UID nagybetűs hex, elválasztó nélkül. Az üres vagy csak szóközből álló megjegyzés `null`, a többi levágva. A jelöléseket a domain adja (`manual`, `out_of_order`, `out_of_round`, `unknown_tag`), a `mock_location` a helyadatból jön, és az `is_mock`-kal együtt áll. A jelölések egyszer, a séma enumjának sorrendjében kerülnek a payloadba. A `gnss_time` a helyadatból kerül a bejegyzésbe.
- **Indok:** Specifikáció *Láncolt napló*. A közös vektorok (`chain/test-vectors.json`) minden esete bájtra egyezik. A láncíró a vektorlánc három bejegyzését ugyanazokkal a hash-ekkel írja meg, az építőkből összerakva.
- **Érintett:** `src/chain/`, `jest.setup.ts`, `app.json` (config plugin), M3-11, M3-12, M3-15, M3-16 – M3-19, M3-21, M4-09.

## 2026-10-29 – Domain: menetrend, határidő, műszak, kör, leolvasás, PIN (M3-13 – M3-19)

- **Kérdés:** Milyen bemenetből dolgoznak a domain szabályai? Hogyan nyílnak és zárulnak a körök, ha az app nem futott? Melyik körbe számít egy leolvasás, ha a pont több nyitott kör útvonalán is rajta van? Mi a „nap utolsó köre” több útvonalnál (Q10), és mi a zárolással újraindítás után (Q6)?
- **Döntés:**
  - **Bemenet és kimenet:** a szabályok tiszta függvények (`src/domain`). A bemenet egy `GuardState` (konfiguráció + a vetületek: nyitott műszak, a körök a leolvasásaikkal), a megbízható idő (`now`) és egy azonosító-generátor. A kimenet a láncba írandó vázlatok listája (`ChainEntryDraft[]`, `src/chain/payloads.ts`). A vetületet a láncíró frissíti (lásd az M3-10 – M3-12 döntést). A `GuardState`-et az ütemező futtató (M3-23) tölti be az adatbázisból.
  - **Időzóna** (`src/time/zone.ts`): `Intl.DateTimeFormat` (`formatToParts`, `timeZone`), a `waypost-schema` generátorának módszerével. A Q5-szabály (nem létező → a váltás pillanata, kétszer előforduló → az első) saját kód, nem a motor alapviselkedése. Telefonon (Hermes Intl) még nem futott; a közös vektorok a Node ICU-jával zöldek.
  - **Határidő** (M3-14): `scheduled_at + time_limit_min`. Időkeret nélkül az útvonal (bármelyik aktív menetrendjének) következő köre ugyanabból a napból (az ablak kezdő napja), ha nincs ilyen, `scheduled_at + 60 perc`. Az időkeret-alapérték a sémacsomag döntése szerinti egész képlet (5 … 1440 perc, mért idő nélkül 20).
  - **Ütemező lépés** (M3-17, `schedulerStep`): csak nyitott műszakkal nyit kört, az útvonal akkori aktuális verziójával és a menetrend időkeretével. Inaktív útvonal, verzió nélküli útvonal és inaktív menetrend nem ad kört. A műszak kezdete előtti időpont csak akkor nyílik meg, ha a határideje a műszak kezdete utánra esik (pl. 21:05-ös belépésnél a 21:00-s, 20 perces kör). A kimaradt időpont az eredeti `scheduled_at`-tal nyílik, és ha a határideje is lejárt, a zárása is a kimenetbe kerül. Útvonalanként legfeljebb egy nyitott kör van: az új időpont a korábbit zárja. A `finished_at` annak a pillanata, amikor a zárás szabálya teljesült: a határidő, ha az korábbi, egyébként az új időpont. A zárás állapota: minden pont megvan → `completed`, van leolvasás → `incomplete`, nincs → `missed`. Egy időpont, amelyhez már van kör a telefonon (bármelyik műszakban), nem nyílik újra. A kimenet időrendben jön, azonos pillanatban a zárás a nyitás előtt.
  - **Automatikus zárás (Q10, a javaslat szerint, jóváhagyva 2026-10-29):** a műszak „napja” annak az időpontnak a kezdő napja, amely elsőként fut még vagy következik a műszak kezdetekor. A zárás a nap összes útvonala közül a legkésőbbi határidő + 60 perc. Akkor a még nyitott körök a szokott szabály szerint zárulnak, aztán `shift_closed (auto)`; utána ebben a műszakban nem nyílik kör. Menetrend nélkül nincs automatikus zárás.
  - **Műszak** (M3-16): belépés nyitott műszak nélkül → `shift_started`; ugyanaz az őr → folytatás, nincs bejegyzés; másik őr → a nyitott körök zárása (most, a szokott szabállyal), `shift_closed (handover)`, `shift_started`. Az őr döntése: a nyitott körök zárása, `shift_closed (guard)`. A supervisor PIN-je nem nyit műszakot.
  - **Leolvasás** (M3-18): csak aktív pontra old fel (NFC: nagybetűs UID; QR: a teljes payload). Ismeretlen címke: `round_id = null`, `checkpoint_id = null`, `unknown_tag`. Ha a pont több nyitott kör útvonalverziójában is benne van, és még hiányzik, akkor ahhoz a körhöz számít, amelyet az őr már elkezdett (van leolvasása), egyébként a legkorábban ütemezetthez. Ha minden ilyen körben megvan, ismétlés: nincs bejegyzés, a válasz a korábbi leolvasás ideje. Ha egyik nyitott kör útvonalán sincs: `round_id = null`, `out_of_round`. Kötött sorrendnél a várt pont a legkisebb pozíciójú hiányzó; eltérésnél `out_of_order`, de számít. A kör a megnyitáskor rögzített verzióval dolgozik. Ha a leolvasással minden pont megvan, a `round_closed (completed)` is a kimenetbe kerül, `finished_at = now`.
  - **Kézi rögzítés és esemény** (M3-19): a kézi rögzítés egy nyitott kör útvonalának pontjára szól. A kimenet `scan` (`manual`, a sorrendszabállyal együtt) + `incident` (`damaged_tag`, a `scan_id`-val, `nearest_checkpoint_id` = a választott pont), mindkettőben a megjegyzéssel és a fotókkal; megjegyzés és legalább 1 fotó kötelező, legfeljebb 5. Esemény: nyitott műszak kell, a megjegyzés nem kötelező, 0–5 fotó. A legközelebbi pont a helyadathoz legközelebbi aktív, koordinátás pont, távolsági korlát nélkül; helyadat nélkül `null`. A hibák kódja (`DomainError.code`) a képernyő feliratához kell.
  - **PIN** (M3-15, `src/auth/pin.ts` és `src/domain/pin-lockout.ts`): a jelöltek a telefon telephelyének aktív, PIN-nel rendelkező felhasználói. Mindegyiknek a saját sójával és iterációszámával számol PBKDF2-t, párhuzamosan, a `react-native-quick-crypto` aszinkron (natív szálon futó) `pbkdf2`-jével. Az eredmény a felhasználó és a szerepe (őr / supervisor). 5 hiba után 5 perc zárolás, minden további hibánál a kétszerese. Zárolás alatt a PIN-t nem ellenőrzi és a hibát nem számolja. Siker után a számláló nullázódik. Az állapot a `kv` táblában van (`pin.lockout`), az időt az uptime méri. **Q6 a javaslat szerint (jóváhagyva 2026-10-29):** ha a boot ID megváltozott (újraindítás), a futó zárolás a teljes időtartamával újraindul.
- **Indok:** Specifikáció *Állapotgépek és üzleti szabályok*, *Azonosítás / PIN-kód*. A domain és a láncíró együttes tesztje (`src/guard/flow.test.ts`) egy éjszakát visz végig belépéstől a váltásig, és ellenőrzi, hogy a vetületek a domain minden kimenetét elfogadják.
- **Érintett:** `src/domain/`, `src/time/zone.ts`, `src/auth/pin.ts`, `src/db/kv.ts`, M3-13 – M3-19, M3-23, M3-24, M3-29 – M3-38, Q6, Q10.

## 2026-10-29 – Ütemező futtató és a domain állapotának betöltése (M3-23)

- **Kérdés:** Honnan kapja a domain a `GuardState`-et? Mikor fut az ütemező lépés, és mi akadályozza meg, hogy két egyszerre futó lépés (vagy egy lépés és egy leolvasás) ugyanazt a kört kétszer nyissa vagy zárja?
- **Döntés:**
  - **Betöltés** (`src/guard/state.ts`, `loadGuardState(db, now)`): a telefon telephelye a `kv` `device.id` → `devices.site_id`. Ha a telefon nincs hozzárendelve, vagy a telephely még nincs lehúzva, az eredmény `null`, és az ütemező nem csinál semmit (a supervisor saját telefonján is így). A nyitott műszak a telefon saját, `ended_at` nélküli műszakja a telephelyen. A körök: a telephely műszakjainak nyitott körei, korukra való tekintet nélkül, és a lezártak a műszak kezdete (műszak nélkül: most) előtti 2 naptól, hogy egy már lezárt időpont ne nyíljon újra. A kör útvonala a verziójából jön, ha a verzió hiányzik, a menetrendjéből. Betöltődnek az útvonalak aktuális verziói és a betöltött körök verziói, a pontok pozíciósorrendben. A kör leolvasásai között az ismeretlen címke nem szerepel.
  - **Döntés a zár alatt** (`appendDecidedEntries`, `src/chain/writer.ts`): az állapot beolvasása, a szabály és az írás ugyanazon a láncíró-záron belül fut, így a döntés és az írás között nem kerülhet be más bejegyzés. Két egyszerre induló lépésből a második már látja az első köreit. A képernyők leolvasása és műszakváltása (M3-29 – M3-38) is így ír majd.
  - **Az idő:** a lépés `now`-ja a megbízható idő (`trustedTime`), nem a falióra.
  - **Indítók** (`src/guard/scheduler.ts`, `startScheduler`, a gyökér-layoutban a szinkron mellett): indulás, előtérbe kerülés, előtérben 30 másodpercenként, minden értesítés (megérkezik, amíg az app fut, vagy koppintanak rá), és kérésre (`requestSchedulerStep`, pl. a műszakkezdés után, M3-30). Háttérben nincs időzítő. Háttérben és zárt appnál a megérkező értesítés nem futtat JS-t, a koppintás viszont előtérbe hozza az appot, és az elindítja a lépést. A kimaradt köröket a következő lépés a szokott szabállyal pótolja.
  - **Automatikus zárás:** ha a lépés `shift_closed (auto)`-t írt, azonnali szinkron (`requestSync('shift_closed')`), mint az őr zárásánál.
  - **Hiba:** a sikertelen lépés nem állítja meg az indítókat; fejlesztői buildben `console.warn`, a következő indító újra próbálja.
- **Indok:** Specifikáció *Állapotgépek / Kör* (Megnyitás), *Láncolt napló*. A zár alatti döntés nélkül egy 30 másodperces lépés és egy egyidejű értesítés két `round_opened`-et írhatna ugyanarra az időpontra.
- **Érintett:** `src/guard/`, `src/chain/writer.ts`, `src/app/_layout.tsx`, M3-23, M3-24, M3-29 – M3-38.

## 2026-10-29 – Ébresztés-ütemezés (M3-24)

- **Kérdés:** Mely körök kapnak ébresztést, mikor és hogyan cserélődik a lista, és mi a helyzet, ha a telefon órája eltér a megbízható időtől?
- **Döntés:**
  - **A lista** (`alarmPlan`, `src/domain/alarms.ts`, tiszta függvény): a következő 36 óra (`scheduled_at`, a határon lévő kör még benne van) köreinek két értesítése: az időpontban, és 5 perccel később emlékeztető. Csak az ütemezőnél is körökkel rendelkező útvonalak számítanak (aktív, betanított verzióval, aktív menetrenddel). Az emlékeztető addig marad, amíg a kör a telefonon nem indult el és nem zárult le: egy 5 percen belül elmúlt, még el nem indult kör emlékeztetője is a listába kerül. Időrendben az első 48 marad (az iOS 64-es korlátja alatt).
  - **Belépésre kér:** ha a kört a lista számításakor egy nyitott műszak sem fedi (nincs műszak, vagy a kör a műszak automatikus zárása utáni), az értesítés szövege a PIN-belépést is kéri. A műszakkezdés és -zárás ezért újraszámolja a listát.
  - **A szöveg:** cím az útvonal neve, törzs „20:00 – indul a kör.” / „20:00 – a kör még nem indult el.”, szükség esetén „Lépj be a PIN-kódoddal.” kiegészítéssel. Névelő nincs benne, mert az időponttól függne („a 20:00”, de „az 1:00”).
  - **Csere** (`src/alarms/round-alarms.ts`): a lista mindig teljes egészében cserélődik, de csak az eltérő értesítés törlődik vagy ütemeződik. Az értesítés azonosítója `<kind>:<schedule_id>:<scheduled_at>`, az adatában ujjlenyomat (cím, törzs, időpont). Így nincs olyan pillanat, amikor egy épp esedékes ébresztés a „mindet töröl, újra ütemez” közé esik. Más értesítéshez (az M1 próbaébresztései) nem nyúl. A cserék sorban futnak; a futás közbeni kérések egy további futásba olvadnak.
  - **Az idő:** a lista a megbízható időből számol, de a rendszer a telefon órája szerint szólaltat meg: az értesítés időpontja ezért a kettő különbségével el van tolva. Ha az óra elállítódik, a következő csere korrigál.
  - **Indítók:** induláskor (előtte a `rounds` csatorna és az előtérbeli megjelenítés), pull után, minden értesítés megérkezésekor és koppintáskor, a műszak kezdetekor és zárásakor, a kör indulásakor (az első pontjának leolvasása) és zárásakor – ezek a láncíró új eseményéből jönnek (`onChainEntries`, `src/chain/events.ts`) –, és **előtérbe kerüléskor** (a specifikáción túl). Az utóbbi azért kell, mert háttérben a megérkező értesítés nem futtat kódot, így a 36 órás ablak csak így lép tovább, ha az appot napokig nem nyitják meg.
  - Az emlékeztető „törlése a kör indulásakor” ugyanez a csere: az első leolvasás után a kör emlékeztetője már nincs a listában.
- **Indok:** Specifikáció *Mobilapp / Ébresztés*; az M1-06 döntése (csatorna, `alarmClock`, `timeSensitive`).
- **Érintett:** `src/domain/alarms.ts`, `src/alarms/round-alarms.ts`, `src/chain/events.ts`, `src/chain/writer.ts`, `src/app/_layout.tsx`, `src/i18n/hu.json`, M3-24, M3-29, M3-32.

## 2026-10-29 – Helyadat, fotó, NFC-figyelés és visszajelzés (M3-20 – M3-22)

- **Kérdés:** Honnan jön Androidon a `gnss_time`, ha az expo-location nem mondja meg, melyik szolgáltató adta a helyet? Hogyan lesz a fotóból helyi `media` sor anélkül, hogy egy félbehagyott rögzítés árva sort hagyna? Mit jelent, hogy „más képernyőn a címke nem csinál semmit”? Milyen rezgés és hang tartozik a három visszajelzéshez?
- **Döntés:**
  - **Helyadat** (`currentLocation()`, `src/location/location.ts`): engedély nélkül azonnal `null`. Különben az utolsó ismert hely, ha legfeljebb 60 mp-es (`getLastKnownPositionAsync({ maxAge })`), ha nincs, egy új (`Accuracy.High`). Az 5 mp az **egész** kérésre vonatkozik, az engedély ellenőrzésétől kezdve; utána, és bármilyen hibánál (kikapcsolt helymeghatározás, nincs jel) helyadat nélkül megy tovább, kivételt nem dob. A leolvasás nem kér engedélyt: azt az M5-10 ellenőrzőlistája kéri (addig a próbaképernyő). Csak előtérben; az iOS „mindig” és mozgás-engedélyszövege kikerült (`app.json`).
  - **`mock_location`:** az expo-location `mocked` mezője.
  - **`gnss_time`:** az expo-location nem adja meg a hely szolgáltatóját. Ezért a `waypost-clock` modul új Android-függvénye (`getGnssTimeMs`) a GPS-szolgáltató utolsó fixének idejét adja (`LocationManager.getLastKnownLocation(GPS_PROVIDER).time`, ez a GNSS-vevő ideje), ha a fix a monoton óra szerint legfeljebb 60 mp-es; különben `null`. A falióra átállítása így nem tehet frissnek egy régi fixet. Hamisított helynél a `gnss_time` `null`, mert az idejét a hamisító app adja. iOS-en mindig `null`. Ha a natív olvasás hibázik, csak a `gnss_time` marad üres, a hely megmarad. A legfeljebb 60 mp-es kor a szerver 2 perces `time_suspect` tűrésén belül marad.
  - **Fotó** (`src/photo/photo.ts`): az app saját kameranézete (expo-camera `CameraView.takePictureAsync`), mert így galériából választani sem lehet; az expo-image-picker nem kell. A kép hosszabbik oldala legfeljebb 1600 px (kisebbet nem nagyít), JPEG 0,7 (expo-image-manipulator). A fájl a dokumentumok `media/<id>.jpg` helyére kerül (nem a gyorsítótárba, amelyet a rendszer törölhet), a kamera saját fájlja törlődik. A SHA-256 a kész fájlé (`File.digest`). A `taken_at` az exponálás pillanata az eszközóra szerint, mint a bejegyzés `device_time`-ja. Az exponálás hangja ki van kapcsolva (éjszakai járőr).
  - **A `media` sor** a láncírónál születik (`ChainWriterOptions.photos`, `src/chain/media.ts`), a hivatkozó bejegyzéssel egy tranzakcióban, `uploaded_at = null`-lal. A tulajdonos az első hivatkozó bejegyzés: kézi rögzítésnél a `scan`, mert az `incident` ugyanazokra a fotókra hivatkozik. A tranzakció visszagördül, ha egy hivatkozott fotó hiányzik vagy más a lenyomata, illetve ha egy átadott fotóra nem hivatkozik semmi. Így nincs árva sor. A rögzítés előtt eltávolított fotó fájlját a képernyő törli (`discardPhoto`); az app leállása miatt sor nélkül maradt fájlokat az M4-12 takarítja.
  - **NFC Androidon** (`src/nfc/tag-events.ts`): egyetlen, app-szintű reader mode regisztráció indul a gyökér-layoutban. Előtérbe kerüléskor a react-native-nfc-manager kapcsolja vissza. A címke a kör és a betanítás képernyőjének kezelőjéhez megy (`useTagReader`, a fókusz idejére), máshol elnyelődik. Így a „nem csinál semmit” a rendszerre is igaz: nincs „új címke” ablak, és egy URL-es NDEF-rekord (pl. NTAG 424 DNA) sem nyit böngészőt. Kikapcsolt NFC mellett is regisztrál; bekapcsolás és visszatérés után olvas. **iOS:** a „Leolvasás” gomb nyit munkamenetet (`useTagReader().read`), mint az M1-ben. Az M1 NFC-próbaképernyője is a hookot használja.
  - **Visszajelzés** (`playFeedback`, `src/feedback/feedback.ts`): siker egy rövid rezgés, hiba kettő, figyelmeztetés egy hosszabb (Android: 60 / 60 + 60 / 250 ms). Androidon saját mintával, mert az expo-haptics értesítés-haptikája sikerre kettőt, hibára hármat rezeg. iOS-en a rendszer értesítés-haptikája (Success / Error / Warning), ahogy a design kéri. Mindhárom fajtának saját rövid hangja van (expo-audio, helyőrzők: `assets/sounds/scan_*.wav`); a specifikáció hangot csak a sikernél ír, de a hiba hangja is segít, ha az őr nem a kijelzőt nézi. A hangok indításkor betöltődnek. A hangmódot nem állítjuk át, mert az M3-32 ébresztés-képernyőjének hangja is ezt használja. Hiba esetén a visszajelzés csendben elmarad, a leolvasást nem állítja meg. Hogy a rossz sorrend figyelmeztetést vagy hibát kap-e, az a Q13 (M3-35).
  - **Engedélyek:** az expo-audio mikrofon- és háttérlejátszás-engedélyei, valamint az expo-file-system külső tárhely-engedélyei kikerültek (`blockedPermissions`).
- **Indok:** Specifikáció *Állapotgépek / Leolvasás 6*, *Láncolt napló* (`gnss_time`, `mock_location`, `media`), *Repo és technológiai stack (Fotó)*, *Mobilapp / NFC és QR*; DESIGN_HANDOFF 7; „az eszközön létrejött adat a szinkron előtt nem módosul és nem törlődik” – ezért születik a sor csak a bejegyzéssel együtt.
- **Érintett:** `src/location/`, `src/photo/`, `src/nfc/`, `src/feedback/`, `src/chain/media.ts`, `src/chain/writer.ts`, `src/chain/payloads.ts`, `modules/waypost-clock/`, `src/app/_layout.tsx`, `src/app/prototype/` (`field.tsx`, `nfc.tsx`, `qr.tsx`), `app.json`, `assets/sounds/`, M3-20 – M3-22, M3-33, M3-35 – M3-37, M4-10, M4-12, M5-10, M5-12, M5-13, Q13.

## 2026-10-29 – A téma kézi választása (M3-25)

- **Kérdés:** Hol tárolódik a kézi témaválasztás (Rendszer / Sötét / Világos), és hol lehet átállítani, ha a designban nincs beállítások képernyő? (Az M1-02 döntése a tárolást a beállítások képernyőjére hagyta.)
- **Döntés:**
  - A választás a `kv` táblába kerül (`ui.theme_preference`, `src/theme/preference.ts`); ha nincs (vagy ismeretlen az értéke), a téma a rendszert követi, a rendszer világos módja nélkül sötét. A választás telefonra szól, nem felhasználóra: a telephelyi telefont több őr használja.
  - Induláskor a session mellett töltődik be, így már az első képernyő a választott témával jelenik meg. Ha az indulás hibával áll le (nincs adatbázis), a téma a rendszert követi, és a választás nem tárolódik.
  - A `ThemeProvider` `onPreferenceChange` propot kapott; a tárolást a gyökér-layout köti be, így a provider adatbázis nélkül is tesztelhető.
  - Átállítani egyelőre a fejlesztői eszközök képernyőjén lehet. A végleges helye a supervisor felületén lesz, a telefon beállításainál (M5-10), mert a telephelyi telefonon az őr ne változtassa.
- **Indok:** DESIGN_HANDOFF 2.1 és 3; az M1-02 döntése.
- **Érintett:** `src/theme/`, `src/db/kv.ts`, `src/app/_layout.tsx`, `src/app/dev/index.tsx`, `src/i18n/hu.json` (`theme.*`), M3-25, M5-10.

## 2026-10-29 – Alapkomponensek I. (M3-26)

- **Kérdés:** Honnan jönnek az ikonok, és hova kerülnek a komponensek azon méretei, amelyek a design szerint kellenek, de a `tokens.ts`-ben nincsenek (a „szín és méret csak a tokenekből” szabály miatt)?
- **Döntés:**
  - **Ikonok:** `lucide-react-native` + `react-native-svg` (DESIGN_HANDOFF 4); a `react-native-svg` natív, új dev build kell hozzá. Ikononként importálva (`lucide-react-native/icons/<név>`), mert a csomag indexe mind a ~2000 ikont becsomagolná. Az `Icon` komponens jelentés szerinti neveket ad (`check`, `exclam`, `nfc`, `back` …; a `statusStyle.icon` nevei fordítási időben ellenőrizve). Ahol a lucide-ban nincs megfelelő, a design útvonalai rajzolnak: felkiáltójel (hiányos) és a három ív (NFC-leolvasás). Az ikon díszítés: a jelentését mindig felirat vagy `accessibilityLabel` adja.
  - **Jestben** a lucide ESM-változata nem fut, ezért a `moduleNameMapper` a CommonJS-változatra mutat (`package.json`).
  - **Új tokenek** (`tokens.ts`, a handoff fájljától eltérés): `color.knob` (a kapcsoló fehér gombja, mindkét témában); `typography.badge` (13/800), `segment` (15/800), `banner` (14/600, sormagasság 20); `size.buttonDashed` 56, `buttonDanger` 52, `buttonTonal` 44, `iconButtonMap` 52, `field` 56, `textArea` 100, `segmentOption` 40, `segmentPadding` 4; `iconSize`, `border` (1 / 2 / 2,5), `iconStroke` (2 / 2,8), `press` (0,85 / 0,98 / 0,4). A `chip` a szinkronjelzőé maradt (13/700), az állapotjelvény a referencia szerint 800-as.
  - **`StatusBadge`:** a DESIGN_HANDOFF 5.5 szerinti 30 dp-s kapszula sima ikonnal, ahogy a képernyők referenciái használják (a `T-Komponensek` 40 dp-s, teli körös változata csak a komponenstáblán szerepel).
  - **`Switch`:** a platform natív kapcsolója a téma színeivel (a handoff megengedi): akadálymentes és animált, Androidon kisebb, mint az 56×34.
  - **`SegmentedControl`:** a 40 dp-s opció `hitSlop`-pal éri el a 48 dp-s érintési minimumot; az opciók `radio` szerepűek, `checked` állapottal. Kettőnél több opciót is elfogad (a téma választója hármat).
  - **`TextField`:** fókuszban 2 dp-s `accent` keret; a keret növekedését a belső margó kompenzálja, a szöveg nem mozdul. Az akadálymentes név a címke és a „kötelező” / „nem kötelező” jelölés. Kártyán belül (`onCard`) a `field` kitöltés. A jelszómező szem gombja `togglebutton`.
  - **Lint:** az `src/` tesztfájljai kikerültek a „beégetett szöveg” szabály alól (a címkéik tesztadatok, mint a `__tests__/`-ben).
  - **Bemutató:** `/dev/components` (csak fejlesztői build) a komponensekkel és a témaváltóval, a `T-Komponensek.dc.html`-lel való összevetéshez.
- **Indok:** DESIGN_HANDOFF 2, 4, 5.1–5.5, 5.10–5.13, 8; a CLAUDE.md token- és feliratszabálya.
- **Érintett:** `src/components/`, `src/theme/tokens.ts`, `src/app/dev/`, `src/i18n/hu.json`, `package.json`, `eslint.config.js`, M3-27 – M3-38, M5.

## 2026-10-29 – Alapkomponensek II. (M3-27)

- **Kérdés:** Hogyan viselkedjenek a design 13 körre rajzolt elemei más számú körnél, mit csinálnak a komponensek és mit a képernyők, és hogyan fut a Reanimated a Jestben?
- **Döntés:**
  - **`RoundTimeline`:** annyi oszlop, ahány kör (a design 13-at rajzol). 13 körig ikonok és minden óra felirata; fölötte ikon nélkül, és csak minden n-edik cella kap órafeliratot (n = ⌈körök / 13⌉), mert a cellák keskenyek. Állapotok: teljesítve, hiányos, elmaradt, következik (csengő), később. A futó kört a képernyő „következik”-ként adja át. Változatok: `full` (40 dp, jelmagyarázattal), `compact` (28 dp, műszakzárás), `mini` (8 dp, telephelykártya). A képernyőolvasó egy szövegként kapja: „Körök idővonala: 20:00 Teljesítve, 21:00 Hiányos, 22:00 Következik, a többi később”.
  - **`SyncIndicator`:** csak a chip (állapot, várakozó tételek száma, koppintás). Offline és feltöltés közben ikon (felhő áthúzva / feltöltés), a többi állapotban pötty, ahogy a képernyők referenciái. A `useSyncStatus`-ból való levezetés és a lenyíló részletek az M3-28 feladata. A 30 dp-s chip `hitSlop`-pal éri el a 48 dp-t.
  - **`PointListItem`:** hat állapot (leolvasva, kézi, időgyanús, rossz sorrend, hátravan, hiányzik). A meta sort („22:03 · NFC”) a képernyő állítja össze; kötött sorrendnél a hátralévő pont számozott pöttyöt kap. A sor egy akadálymentes elem: „név, állapot, meta”.
  - **`ProgressRing`:** a referencia 104-es viewBoxában rajzolva; a nagy (96 dp) változatban a „5/9 pont” középen, a kicsiben (52 dp) mellette. `progressbar` szerepű, értékkel. A `ProgressSegments` díszítés, a mellette lévő szám a szöveg.
  - **`PinPad` + `PinDots`:** a billentyűzet csak számjegyet, törlést és a supervisor gombot adja tovább; a PIN összegyűjtése, ellenőrzése, a zárolás és a hiba haptikája (`playFeedback('error')`) a PIN-képernyőé (M3-29). A rázást a `shakeKey` változása indítja (Reanimated, 3 × 10 dp oda-vissza). A supervisor gomb nélkül a helye üres marad.
  - **`PhotoSlot` / `PhotoAdd`:** a kép `expo-image`-dzsel, `cover` kitöltéssel; a csempe szélessége a rácsé (a képernyő teszi 3 oszlopba). Hogy a koppintás mit csinál (pl. törlés), azt a képernyő mondja meg (`accessibilityHint`).
  - **`CategoryTile`:** általános (ikon + felirat + kijelölés); a kategória → ikon leképezés az esemény képernyőjén lesz (M3-37). Az esemény-kategóriák ikonjai: rongálás a design rajzából, a többi lucide (`DoorOpen`, `Droplet`, `User`, `Ellipsis`).
  - **`ResultScreen`:** az elrendezés (két kör, állapotsor, cím, magyarázat, tartalom, gombok) és a megjelenés animációja (fade + scale 0,96 → 1, 200 ms, Reanimated `Keyframe`). A tartalmat (haladás kártya, utasítás, leolvasott azonosító, sorrend-összevetés), a gombokat, a 3 mp-es visszaszámlálást és a haptikát az M3-35 adja.
  - **`Button`:** `iconColor` a saját színű ikonhoz („Esemény ennél a pontnál” zászlója `warn`, a kézi rögzítés ceruzája `manual`).
  - **Új tokenek:** tipográfia (`tile`, `pinKey`, `ringValue`, `ringValueSm`, `unit`, `resultLine`, `resultBody`), méretek (PIN-pötty, szinkronpötty, gyűrűk, szegmens, idővonal-cellák, jelmagyarázat, fotócsempe, kategóriacsempe), lekerekítés (`cell`, `cellSm`, `swatch`), ikonméret (`sync`, `result`), `motion` (rázás, eredményképernyő).
  - **Jest:** a `react-native-reanimated/jest/resolver` (a csomag saját resolvere: a natív helyett a webes megvalósítást tölti be); így a komponensek a valódi Reanimateddel futnak a tesztekben, mock nélkül.
- **Indok:** DESIGN_HANDOFF 5.3, 5.6–5.9, 5.14–5.17, 7, 8; a képernyő-referenciák (`B-Kor`, `B-Kezdolap`, `B-Zaras`, `B-PIN`, `B-Esemeny`, `B-Siker`, `B-Ismeretlen`, `B-Sorrend`).
- **Érintett:** `src/components/`, `src/theme/tokens.ts`, `src/i18n/hu.json`, `src/app/dev/components.tsx`, `package.json` (Jest), M3-28 – M3-38, M5.

## 2026-10-29 – Szinkronjelző a fejlécben (M3-28)

- **Kérdés:** Melyik chip-állapot tartozik a szinkronállapothoz (`useSyncStatus`), mi van a lenyíló részletekben, és hogyan kerül a jelző minden képernyőre?
- **Döntés:**
  - **Állapot** (`syncIndicatorState`, `src/components/sync-status-indicator.tsx`), elsőbbségi sorrendben: nincs hálózat → *Offline · N vár*; szinkron fut, és van feltöltendő tétel → *Feltöltés… N*; az utolsó szinkron hibás → *Szinkronhiba · újra* (a következő sikeresig); sikeres szinkron volt, és semmi sem vár → *Szinkronizálva*; különben *Online*, várakozó tételnél *Online · N vár* (új `syncStyle.online.labelQueued`, a specifikáció „N tétel vár feltöltésre” állapota hálózattal, pl. a 2 mp-es késleltetés alatt). A csak letöltő (semmit fel nem töltő) szinkron nem változtat a chipen, hogy 5 percenként ne villogjon. A NetInfo első jelzéséig online-nak számít.
  - **Részletek:** a chip alatt lenyíló kártya (átlátszó `Modal`, a chip helyét `measureInWindow` adja; a kártya a chiphez igazodik a képernyő margóin belül, legfeljebb 320 dp széles): „Utolsó szinkron: HH:MM” (más napon hónappal és nappal: „10. 28. 22:14”; az eszköz időzónájában) vagy „Még nem volt szinkron”; a várakozó tételek száma; offline-nál a magyarázat, hibánál a hiba fajtájának szövege (`sync.errors.*`); „Szinkronizálás most” gomb, amely szinkron közben letiltva „Szinkronizálás…”. A kártyán kívüli koppintás és az Android vissza gomb zárja; képernyőolvasónak a háttér a „Szinkron részleteinek bezárása” gomb. A chip `expanded` állapotot és tippet kap.
  - **Minden képernyőn:** új `ScreenHeader` (DESIGN_HANDOFF 6 fejlécmintája: vissza gomb, cím, alcím, jobbra alapból a szinkronjelző); a helyőrző képernyők már ezt használják, a G- és S-képernyők (M3-29 –, M5) is erre épülnek. Ahol a design máshová teszi (a PIN-képernyőn középre), ott a képernyő maga helyezi el a `SyncStatusIndicator`-t. A fejlesztői és a próbaképernyők natív fejlécében jobbra (`headerRight`).
  - **Új elemek:** `InfoBanner` `error` változat (`miss`), `refresh` ikon (lucide `RefreshCw`), `size.syncPanel`, a `SyncIndicator` `ref`, `expanded` és `accessibilityHint` propja.
- **Indok:** specifikáció, Mobilapp (szinkronjelző); DESIGN_HANDOFF 2.4, 5.3, 6, 8; a `useSyncStatus` (M3-08) mezői.
- **Érintett:** `src/components/sync-status-indicator.tsx`, `src/components/screen-header.tsx`, `src/components/placeholder-screen.tsx`, `src/components/sync-indicator.tsx`, `src/components/info-banner.tsx`, `src/components/icon.tsx`, `src/theme/tokens.ts`, `src/i18n/hu.json`, `src/app/dev/_layout.tsx`, `src/app/prototype/_layout.tsx`, M3-29 – M3-38, M5.

## 2026-10-29 – PIN-képernyő (M3-29)

- **Kérdés:** Mi történik a helyes PIN után (mikor íródik a `shift_started`), mit mutat a képernyő a billentyűzet fölött, és mire való a pajzsgomb a telephelyi telefonon?
- **Döntés:**
  - **Belépés** (`signInWithPin`, `src/guard/login.ts`): `pinLogin` (M3-15), majd őrnél a műszak-állapotgép (`guardLogin`) a láncíró zárja alatt, a megbízható idővel; a bejegyzések (új műszak, ill. átadásnál a nyitott körök zárása, `shift_closed (handover)`, `shift_started`) **a PIN-belépéskor** íródnak, ahogy a specifikáció írja, és ahogy a design is feltételezi (a G2 már a lezárt átadást jelzi). Csak sikeres írás után nyílik meg a munkamenet (`activeUser`), a navigáció ezt követi. Új műszaknál azonnali ütemező lépés (`requestSchedulerStep('shift_started')`), hogy az esedékes kör megnyíljon; az ébresztések a láncesemény miatt cserélődnek. Supervisor PIN-je: supervisor mód, láncbejegyzés nélkül. A G2 (M3-30) a belépés után jöhet, a műszak addigra már él.
  - **Beküldés:** a „Műszak kezdése” gombbal (a design szerint), amely 6 számjegyig letiltva; a hetedik számjegyet a képernyő nem veszi fel. Ha már nyitott műszak van, a gomb felirata „Belépés”. Ellenőrzés közben (PBKDF2) „Ellenőrzés…”, a billentyűzet letiltva.
  - **Hibás PIN:** a pöttyök rázása, `playFeedback('error')`, a pöttyök kiürülnek, „Hibás PIN-kód”; ha már csak 1–2 próbálkozás van a zárolásig, „Hibás PIN-kód · még N próbálkozás”. **Zárolás** alatt a billentyűzet letiltva, „Túl sok hibás PIN-kód. Újra próbálhatod m:ss múlva.” másodpercenként frissítve. A zárolás ideje a specifikációé (5 perc, duplázódó), nem a DESIGN_HANDOFF 5.16 60 másodperce.
  - **Fölötte:** a szinkronjelző középen; a telephely neve; köszönés a telephely órája szerint (4–9 „Jó reggelt!”, 9–18 „Jó napot!”, egyébként „Jó estét!”); alatta, ha műszak van, „{név} műszakban”, különben a következő kör (`nextRound`, `src/domain/shift.ts`): ha az a menetrendi nap első köre, „A műszak 20:00-kor kezdődik”, egyébként „A következő kör 22:00-kor indul”. A „műszak kezdete” így a menetrendből jön, mert a specifikációban a műszaknak nincs kezdési ideje. Az adatok pull után, láncbejegyzés után (pl. automatikus zárás) és 30 másodpercenként frissülnek.
  - **A telephely még nincs lehúzva** (hozzárendelés után, az első pull előtt): „PIN-belépés” cím, magyarázó sáv, a billentyűzet letiltva – így a próbálkozások nem vezetnek zároláshoz, amíg nincs kivel egyeztetni a PIN-t.
  - **Pajzsgomb:** a telephelyi telefonon a PIN azonosít (a supervisoré is), ezért nem visz másik képernyőre; egy sávban elmagyarázza, hogy a supervisor is a saját PIN-jével lép be. (A design `/supervisor/login`-ja a hozzárendeletlen telefoné.)
  - **Figyelmeztető sáv** (M3-24): ha az `allAlarmPermissionsGranted` hamis, `warn` sáv a hiányzó beállításokkal (értesítések, pontos riasztás, akkumulátorkímélés alóli kivétel) és „Szólj a supervisornak”; az ellenőrzés előtérbe kerüléskor újra fut. iOS-en az értesítések hiányára is figyelmeztet. A javítás a supervisor ellenőrzőlistája (M5-10).
  - **Új token:** `typography.siteName` (15/600).
- **Indok:** Specifikáció *Azonosítás / PIN-kód*, *Állapotgépek / Műszak*, *Mobilapp* (`(auth)/pin`, Ébresztés); DESIGN_HANDOFF 5.16, 6 (G1), `B-PIN`.
- **Érintett:** `src/app/(auth)/pin.tsx`, `src/guard/login.ts`, `src/domain/shift.ts`, `src/theme/tokens.ts`, `src/i18n/hu.json`, `__tests__/pin-screen.test.tsx`, `__tests__/navigation.test.tsx`, M3-30 – M3-32, M3-38, M5-10.

## 2026-10-29 – Műszakkezdés képernyő (M3-30, Q1 a G2-re)

- **Kérdés:** A design G2-je (Műszakkezdés) a specifikációban nincs benne (Q1). Része legyen az 1. lépcsőnek? Ha igen, mikor jelenik meg, mit mutat, és mi a kapcsolata a PIN-belépéskor már elindított műszakkal (M3-29)?
- **Döntés:**
  - **Az 1. lépcsőbe tartozik**, útvonala `(guard)/shift-start` (a specifikáció csoportja szerint). Új láncbejegyzést nem ír: a műszak a PIN-belépéskor indult (vagy vette át az őr). A képernyő a műszak éjszakáját és a telefon készenlétét mutatja, mielőtt az őr a kezdőlapra lép. Ez a specifikáció egyetlen szabályát sem változtatja meg.
  - **Mikor:** új műszak (`started`) vagy átadás (`handover`) után; ugyanannak az őrnek a visszalépésekor (`continued`) a kezdőlap jön. A munkamenet `shiftStart` mezője jelzi (`src/auth/session.ts`, `signInWithPin` állítja). A kezdőképernyő (`homeHref`) ilyenkor `/shift-start`. „Műszak indítása” → kezdőlap (a jelzés törlődik). A vissza gomb („Kilépés a PIN-képernyőre”) kijelentkeztet; a műszak nyitva marad, és ugyanaz az őr folytatja.
  - **Tartalom:** „Szia, {név}!”, „Te vagy szolgálatban.” (a design „Ma éjjel”-e nappali műszakban nem igaz). Kártya: **Műszak** „20:00 – 08:00” = a menetrendi nap első és utolsó köre (`shiftDay`, `src/domain/shift.ts`: az a nap, amelynek körei közrefogják a mostani időt, különben a következő egy napon belül). Útvonalanként **Útvonal** „{név} · N pont” (az aktuális verzió pontjai) és **Körök** „13 · óránként · 25 perc” (a nap köreinek száma, a menetrend gyakorisága – óránként / N óránként / N percenként / listánál „N időpont” –, és az időkeret, ha a menetrendjeinek közös). Ha a következő egy napban nincs kör, egy tájékoztató sáv. Átadásnál sáv: „{előző őr} műszakját lezártuk (átadás HH:MM). Ez a jelentésben is látszik.”
  - **Készenlét** (`src/guard/readiness.ts`): NFC bekapcsolva (NFC nélküli telefonon: „QR-kóddal olvass”, javítás nélkül); ébresztés (értesítés + pontos riasztás); helymeghatározás (előtérbeli engedély); Androidon akkumulátorkímélés alóli kivétel. A hiányzó sor `warn` jelzésű, egy mondattal a következményéről, és „Javítás” gombbal, amely a rendszer párbeszédét vagy beállítását nyitja (NFC-beállítás, értesítés-kérés vagy az app beállításai, pontos riasztás, helyengedély vagy az app beállításai, akkumulátor-kivétel). Visszatéréskor újra ellenőriz. A hiány nem akadályozza a műszakot (DESIGN_HANDOFF 6, G2). A sor közös komponens (`CheckRow`), az M5-10 ellenőrzőlistája is használhatja.
  - **Új elemek:** `GuardLogin.closed_shift` (átadásnál), `getLocationPermission()` (`canAskAgain`-nel), a `ScreenHeader` `backLabel` propja, tokenek: `size.checkCircle` (30), `typography.rowLabel` (14/600).
- **Indok:** A design G2-je az egyetlen pont, ahol az őr a műszak elején látja, hogy a telefon kész-e (a hiányzó pontos riasztás vagy akkumulátor-kivétel csendben elmaradó ébresztést okoz). A műszak indítása a PIN-belépésnél marad, mert a specifikáció így írja, és az átadás azonnal rögzül.
- **Érintett:** `src/app/(guard)/shift-start.tsx`, `src/guard/login.ts`, `src/guard/readiness.ts`, `src/domain/shift.ts`, `src/auth/session.ts`, `src/navigation/access.ts`, `src/components/check-row.tsx`, `src/components/screen-header.tsx`, `src/location/location.ts`, `src/theme/tokens.ts`, `src/i18n/hu.json`, M3-31, M5-10, Q1.

## 2026-10-30 – Műszak kezdőlap (M3-31)

- **Kérdés:** A design G3-ja egy útvonalat és egy éjszakai műszakot feltételez. Melyik körök tartoznak a műszakhoz, mi látszik több útvonalnál, nappali műszakban, nyitott körnél és a körök végeztével, és hogyan jut másik őr a PIN-képernyőre?
- **Döntés:**
  - **A műszak körei** (`shiftHome`, `src/domain/shift.ts`): a műszak napja az automatikus zárás napja (a műszak kezdetekor első, még futó vagy következő kör indulási napja, Q10), nem a G2 `shiftDay`-e, így az utolsó kör után sem vált a következő éjszakára. Ide tartozik e nap minden olyan menetrendjének minden köre, amelynek van még előttünk lévő köre (a nappali menetrend lefutott körei az éjszakai műszakban nem látszanak), és más nap köre, ha az ütemező még az automatikus zárás előtt megnyitja. A kör nélküli időpont `Elmaradt`, ha a határideje már a műszak kezdete előtt lejárt, mert az ütemező sosem nyitja meg, és a szerver jelentése is elmaradtnak számolja; a sorában „Nem volt nyitott műszak” áll. Az előző műszak (átadás) köre a saját állapotával látszik.
  - **Több útvonal:** útvonalanként külön idővonal az útvonal nevével, a jelmagyarázat csak az utolsó alatt; a „Következik” útvonalanként az első még meg nem nyitott kör. A lezárt körök sorában is ott az útvonal neve. Egy útvonalnál pontosan a design szerinti kép.
  - **Felirat:** „A műszak körei” a design „Ma éjjel”-e helyett, mert nappali műszakban nem igaz (mint a G2-n). A gombok a design rövid feliratai („Esemény”, „Műszakzárás”), mert a specifikáció „Esemény rögzítése” és „Műszak zárása” szövege két egymás melletti gombon nem fér ki egy sorba.
  - **Visszaszámlálás:** a megbízható időhöz, másodpercenként; 1 óra alatt mm:ss, felette h:mm felfelé kerekítve. Nullánál azonnali ütemező lépést kér (`round_due`), nem várja meg a 30 másodperces lépést.
  - **Nyitott kör:** a G5 (M3-33) elkészültéig és tartalékként a kártya „{idő}-s kör” felirattal a határidőig számol vissza, az idővonalon új `running` állapot látszik (`status.inProgress`, a jelmagyarázatban nincs, mert a design szerint ilyenkor a G5 látszik).
  - **Nincs több kör:** „Nincs több kör ebben a műszakban”, és hogy a műszak mikor zárul automatikusan.
  - **Kijelentkezés:** a design G3-ján nincs vissza gomb, de a specifikáció átadási szabályához a másik őrnek el kell jutnia a PIN-képernyőre, ezért a fejlécben ott a G2-vel azonos „Kilépés a PIN-képernyőre” gomb; a műszak nyitva marad. Ha a műszak közben lezárul (automatikus zárás), a képernyő kijelentkeztet.
  - **Új elemek:** `ScreenHeader.overline`, `RoundTimeline.legend`, `PlaceholderScreen.onBack`, `shiftEnd` ikon, helyőrző útvonalak a specifikáció nevével: `(guard)/incident/new`, `(guard)/shift/close`.
- **Indok:** Specifikáció *Műszak*, *Kör*, *Mobilapp* (`(guard)/home`); DESIGN_HANDOFF 5.9, 6 (G3), `B-Kezdolap`. A körök a jelentéssel egyezően, a műszak teljes napjára látszanak, és az őr nem kap félrevezető visszaszámlálást nyitott körnél.
- **Érintett:** `src/app/(guard)/home.tsx`, `src/app/(guard)/incident/new.tsx`, `src/app/(guard)/shift/close.tsx`, `src/guard/home.ts`, `src/guard/login.ts`, `src/guard/scheduler.ts`, `src/domain/shift.ts`, `src/components/round-timeline.tsx`, `src/components/screen-header.tsx`, `src/components/placeholder-screen.tsx`, `src/components/icon.tsx`, `src/i18n/hu.json`, M3-33, M3-37, M3-38.

## 2026-10-30 – Ébresztés képernyő (M3-32, Q1 a G4-re)

- **Kérdés:** A design G4-e a specifikációban nincs benne (Q1). Része legyen az 1. lépcsőnek? Mikor nyílik meg, meddig szól, mit jelent a „Hang némítása”, és megoldható-e a design teljes képernyős értesítése (M1-06-ból nyitva maradt)?
- **Döntés:**
  - **Az 1. lépcsőbe tartozik**, útvonala `(guard)/alarm`. Láncbejegyzést nem ír: a kör az ütemezett időben nyílik, az idő az első leolvasással indul. A specifikáció „az értesítésre koppintva a kör képernyője nyílik meg” szabálya ennyiben módosul: a kör képernyője az „Indulok” után jön.
  - **Teljes képernyős értesítés (full-screen intent) nincs:** az `expo-notifications` (58.1) nem tudja, saját natív modul kellene hozzá, a saját értesítés-kezelésével. Az 1. lépcsőben a MAX fontosságú, riasztáshangú értesítés szól (M1-06); zárolt képernyőn a koppintás után a feloldás következik, és csak utána jön a G4. Ha a próbaidőszak (M7) ezt kevésnek találja, külön feladat.
  - **Mikor nyílik:** belépett őrnél, ha a kör még várja az indulást, (1) az értesítés megérkezésekor, ha az app fut, (2) koppintásra, (3) előtérbe kerüléskor, ha az ébresztés még az értesítési listában van (koppintás nélküli megnyitás, a design iOS-mondata). Minden más képernyő fölé nyílik.
  - **Mikor nem:** ha a kör már elindult vagy lezárult, a határideje lejárt, nincs nyitott műszak, vagy a menetrendből kikerült (`roundAlarmInfo`, `src/domain/alarms.ts`), pl. egy későn megnyomott régi értesítésnél. Ilyenkor az értesítés lekerül a listáról, és a képernyő, amelyen az őr van, marad. Nyitott képernyő esetén, ha a kör közben elindul vagy lezárul, a képernyő magától bezárul.
  - **Belépett őr nélkül** a riasztás nem vár: a telefon a PIN-képernyőn van (hidegindításkor is, mert a munkamenet nem perzisztens), és belépés után az őr a műszakból (G2/G3, M3-33-tól G5) jut a körhöz, nem csengetjük újra. A telephelyi telefonon belépett supervisor a saját képernyőjén marad, a munkamenetét nem szakítjuk meg.
  - **Hang és rezgés:** a saját hang ismétlődve (`expo-audio`, `loop`), az értesítés mintája szünettel ismétlődve (`Vibration`), csak amíg az app aktív; ezért a képernyő ébren marad (`expo-keep-awake`). Előtérben az értesítés nem jelenik meg és nem szól külön, ha a G4 átveszi (`setForegroundTakeover`), hogy némításkor ne szóljon tovább. Androidon az `expo-audio` a média-hangerőn játszik (nincs alarm-használat beállítás), tehát az ismétlődő hang a média-hangerőt követi, az értesítés első hangja a riasztás-hangerőt; iOS-en `playsInSilentMode`, némítókapcsolóval is szól (és ettől kezdve a leolvasás hangja is).
  - **„Hang némítása”:** a design két helye eltér (6. G4: „csak a hang áll le”; 7. táblázat: hang + rezgés „amíg Indulok vagy Hang némítása”). A 7. táblázat szerint a hang **és** a rezgés is leáll, a képernyő marad, a gomb „Hang némítva” felirattal letiltva. Az 5 perces emlékeztető újra megszólaltatja.
  - **Vissza nincs:** a rendszer vissza gombja és az iOS-gesztus tiltva; a képernyőről az „Indulok” visz tovább (nincs halasztás).
  - **„Indulok”:** azonnal leállítja a riasztást, futtat egy ütemező lépést (ha a kör még nem nyílt meg), és a kör képernyőjére visz; ha az már a veremben van (emlékeztető a G5 fölött), oda tér vissza (`router.dismissTo`), nem nyit másodikat. A riasztás és az emlékeztető értesítése lekerül a listáról. Ha a kör még nem nyílt meg (pl. a telefon órája pár másodperccel előbbre jár), vissza az előző képernyőre. Az „Indulok” nem törli az emlékeztetőt: a specifikáció szerint azt a kör indulása (első leolvasás) törli, így 5 perc leolvasás nélkül a G4 újra megnyílik.
  - **Több riasztás egyszerre** (több útvonal): sorban, a legrégebbi az első; az „Indulok” után a következő nyílik. Ugyanannak a körnek az emlékeztetője nem nyit második képernyőt.
  - **Tartalom:** a design szerint; időkeret nélküli menetrendnél csak a pontszám; több útvonalas telephelyen elöl az útvonal neve. Az előző kör jelvénye az útvonal közvetlenül előző köréé (a G3 listájával egyező állapottal), ha már lezárult.
  - **Új elemek:** `expo-keep-awake` a `package.json`-ban (eddig az `expo` függőségeként már a buildben volt, új dev build nem kell), tokenek: `ring1`, `ring2`, `typography.alarmTime` (38/800), `size.buttonAlarm` (76), helyőrző útvonal: `(guard)/round/[id]`.
- **Indok:** Specifikáció *Mobilapp / Ébresztés*, *Műszak* 5. pont; DESIGN_HANDOFF 6 (G4), 7, 10, `B-Ebresztes`; az M1-06 döntése. Az értesítés csak egyszer szól, az éjszakai ébresztéshez kell az ismétlés, ha az app fut.
- **Érintett:** `src/app/(guard)/alarm.tsx`, `src/app/(guard)/round/[id].tsx`, `src/app/(guard)/_layout.tsx`, `src/app/_layout.tsx`, `src/alarms/active-alarms.ts`, `src/alarms/ringing.ts`, `src/alarms/foreground.ts`, `src/alarms/round-alarms.ts`, `src/guard/alarm.ts`, `src/domain/alarms.ts`, `src/navigation/app-stack.tsx`, `src/navigation/use-alarm-screen.ts`, `src/theme/tokens.ts`, `src/i18n/hu.json`, M3-33, M7, Q1.

## 2026-10-30 – Kör folyamatban, lista (M3-33)

- **Kérdés:** A design G5-je iOS-en nem ad utat a QR-hoz és a kézi rögzítéshez, és vissza gombja sincs, miközben a G3 helyett jelenik meg. Mit csinál a „Leolvasás” Androidon, hogyan jut az őr nyitott körnél a műszakzáráshoz és az átadáshoz, és mi történik a kör zárulásakor?
- **Döntés:**
  - **Gombok:** a specifikáció szerint mindkét platformon látszik a „QR” és a „Címke nem olvasható” gomb a „Leolvasás” fölött, a design Androidra rajzolt lapja helyett; így egyforma a két platform, és iOS-en is elérhető mindkettő. A „Leolvasás” iOS-en az NFC-ablakot nyitja. Androidon, ahol a címke gomb nélkül is olvas, egy sávban ezt mondja el; kikapcsolt NFC-nél a beállításokat nyitja (a sáv is jelzi); NFC nélküli telefonon mindkét platformon a QR-olvasót.
  - **G3 és G5:** a G3 a design szerint magától a G5-re vált, ha nyitott kör van, de körönként belépésenként csak egyszer (`src/guard/round.ts`, az újra belépés törli). A G5-ön a design rajzától eltérően van vissza gomb, és a G3-on a nyitott kör kártyáján „Kör megnyitása” gomb. Enélkül időkeret nélküli menetrendnél (ahol a határidő a következő kör) a G3 és vele a műszakzárás és a kijelentkezés (átadás) szinte soha nem lenne elérhető. Ha épp ébresztés szól, a G3 nem vált: az „Indulok” nyitja a kört.
  - **Sorrend a listán:** a leolvasott pontok időrendben felül, alattuk a hátralévők pozíció szerint, kötött sorrendnél számozott körrel (DESIGN_HANDOFF 5.6). Rossz sorrendnél a sor `wrongOrder` állapotú, a meta végén „Rossz sorrend”; kézinél „Kézi – nem igazolt”.
  - **Hátralévő idő:** a határidő a kör saját adataiból, a G3-mal azonos visszaszámlálással (`useCountdown`, mm:ss, 1 óra felett h:mm). Az utolsó 5 percben `warn` szín és egy rezgés hang nélkül (`playHaptic`), lejártkor `miss` szín és azonnali ütemező lépés. Ha a képernyő már az utolsó 5 percben nyílik meg, a rezgés akkor szól.
  - **Zárulás:** ha a kör lezárul, a képernyő visszalép, de csak ha felül van, így a kört befejező leolvasás előbb az eredményét mutatja. **Toast nincs**, a design 7. táblázatával szemben: nincs még ilyen komponens; a lezárt kör a G3 listájának tetején látszik. A G11 toastja (M3-37) idején érdemes visszatérni rá.
  - **Rögzítés** (`recordTagRead`): először a helyadat (`currentLocation()`, legfeljebb 5 mp), utána a láncíró zárja alatt a döntés és a bejegyzés, így a leolvasás ideje legfeljebb ennyivel késhet a címke érintéséhez képest. Közben a gomb „Rögzítés…”, és a további olvasás elvész (ugyanaz a címke kétszer érintve). Sikertelen írásnál hibajelzés és sáv, a kör megy tovább. Érvénytelen UID-jú címkénél nincs mit rögzíteni (a séma nem fogadja el), csak hibajelzés és sáv.
  - **Visszajelzés:** a leolvasás pillanatában (`scanFeedback`): siker, ismeretlen címke = hiba, már leolvasva és rossz sorrend = figyelmeztetés. A rossz sorrendé a Q13 javaslata szerint, ideiglenesen; a Q13 az M3-35-ben dől el. Az eredményképernyő a kimenetet paraméterben kapja.
  - **QR-olvasó:** `(guard)/qr`, a specifikáció teljes képernyős kameranézete, engedélykéréssel, lámpával; csak `waypost:cp:` kódot fogad el (`QrScanner`), a találat után az eredményképernyő váltja fel, így onnan vissza a körhöz jut.
  - **Lista/Térkép választó nincs** a térkép elkészültéig (M3-34, Q1).
  - **Új elemek:** `qr` ikon, `playHaptic`, `countdownText` (`src/time/countdown.ts`), `useCountdown` (`src/guard/use-countdown.ts`), `deadlineOfRound`, `ShiftHome.running.round_id`, `routeNameAmongSeveral` (`src/guard/alarm.ts`), helyőrzők: `(guard)/scan-result`, `(guard)/manual`.
- **Indok:** Specifikáció *Mobilapp* (`(guard)/round/[id]`, NFC és QR), *Leolvasás* 6., *Műszak*; DESIGN_HANDOFF 5.6, 5.7, 6 (G3, G5), 7, `B-Kor`.
- **Érintett:** `src/app/(guard)/round/[id].tsx`, `src/app/(guard)/qr.tsx`, `src/app/(guard)/home.tsx`, `src/app/(guard)/scan-result.tsx`, `src/app/(guard)/manual/index.tsx`, `src/guard/round.ts`, `src/guard/scan.ts`, `src/guard/use-countdown.ts`, `src/guard/alarm.ts`, `src/navigation/use-scan-recorder.ts`, `src/domain/rounds.ts`, `src/domain/shift.ts`, `src/feedback/feedback.ts`, `src/time/countdown.ts`, `src/components/icon.tsx`, `src/i18n/hu.json`, M3-34 – M3-38, Q13.

## 2026-10-30 – Kör folyamatban, térkép (M3-34, Q1 a G6-ra)

- **Kérdés:** A specifikáció nem említi a térképet: az 1. lépcsőbe tartozik-e, és mi legyen ott, ahol a design nem ad választ (Google-kulcs, csempe nélküli állapot, sorszámok)?
- **Döntés:**
  - **Q1 a G6-ra:** az 1. lépcsőbe tartozik (a feladat megrendelése szerint). Nem külön útvonal (`?view=map`): a `(guard)/round/[id]` belső nézete, Lista/Térkép választóval; a kör mindig listával nyílik, és a nézet megmarad az eredményképernyőről visszatérve. Ez felülírja az M3-33 „választó nincs” pontját.
  - **Google Maps-kulcs:** Androidon a `GOOGLE_MAPS_ANDROID_API_KEY` környezeti változóból (`app.config.ts`, a kulcs nincs a repóban). A Google Maps kulcs nélkül megnyitva leállítja az appot, ezért a kulcs nélküli build az `extra.googleMapsConfigured` alapján (`mapsConfigured()`) a térkép helyett üzenetet mutat. iOS-en Apple Maps, kulcs nélkül; ott a téma `userInterfaceStyle`-lal, Androidon `customMapStyle`-lal (`src/theme/map-style.ts`) érvényesül, mindkét témában a `map*` tokenekből.
  - **Csempe nélkül (offline):** üres háttéren a jelölők és a vonal (DESIGN_HANDOFF 5.18 második lehetősége). **Alaprajz-kép nincs**: nincs hozzá feltöltés, séma és végpont; ha kell, külön feladat.
  - **Jelölő helye:** leolvasott pont a leolvasás GPS-helyén, ha nincs, a betanított helyén; hátralévő pont a betanított helyén. Helyadat nélküli pont nincs a térképen; ha egyiknek sincs, üzenet áll a térkép helyén.
  - **Megtett út:** csak a helyadattal rögzített leolvasásokat köti össze, időrendben; a kapszula ezek első és utolsó idejét mutatja. A referencia rajzától annyiban tér el, hogy a kapszula első helyadatos leolvasásig nem látszik.
  - **Sorszám:** a pont helye az útvonalverzióban, tehát kör közben nem változik; szabad vagy rossz sorrendnél eltérhet a bejárás sorrendjétől (a design rajzán a kettő egybeesik).
  - **Állapotok:** leolvasott, kézi, hátravan. Az `időgyanús` jelölő nincs (az app nem állít ilyen jelölést, a szerver dönt róla), a `hiányzik` nincs (nyitott körön nem fordul elő); az S4 (M5-20) veheti fel őket. A rossz sorrendű leolvasás a térképen `ok` színű, a design nem ad rá jelölőt; a Lista nézet mutatja.
  - **Saját helyzet:** `watchPosition` (`src/location/location.ts`): csak amíg a térkép látszik és a képernyő felül van, csak kijelzésre, nem tároljuk, és nem kér engedélyt (azt a műszakkezdés kéri). Engedély nélkül nincs pötty, a középre igazítás tiltott. Méret a `B-Terkep` szerint: 16 és 36 dp átmérő (r 8 és r 18), a handoff 5.18 „8 és 18 dp” értékét sugárnak olvasva.
  - **Fejléc és alsó sáv a térképen:** a `B-Terkep` szerint kisebb gyűrű (52), kisebb idő (`counterSm`, 34), határidősor nélkül; alul csak az esemény és a Leolvasás. A QR és a „Címke nem olvasható” a Lista nézetben marad, így több hely jut a térképnek; NFC nélküli telefonon a Leolvasás a térképről is a QR-olvasót nyitja.
  - **Google-logó:** a `mapPadding` a jelmagyarázat fölé tolja, mert a jelmagyarázat különben takarná.
  - **Új elemek:** `react-native-maps` (natív, új dev build kell), `SiteMap`, `roundMapOf`, `usePosition`, `coordinateOfE7`, `regionAround`, tokenek: `size.legendDot`, `mapMarker`, `mapMarkerRing`, `mapMe`, `mapHalo`, `mapRoute`, `mapRouteSwatch`, `mapRouteAhead`, `mapRouteAheadDash`, `mapAccuracyDash`, `mapCapsule`, `typography.counterSm`, `mapMarker`, `mapCapsule`.
- **Indok:** DESIGN_HANDOFF 5.18, 6 (G6), 10; `B-Terkep`; Specifikáció *Repo és technológiai stack* (expo-location, előtér), *Állapotgépek / Leolvasás 6*. A helyadat továbbra is csak a leolvasás és az esemény része a láncban; folyamatos nyomvonal a 2. lépcsőben.
- **Érintett:** `src/app/(guard)/round/[id].tsx`, `src/components/site-map.tsx`, `src/guard/round.ts`, `src/location/` (`coordinate.ts`, `maps.ts`, `use-position.ts`, `location.ts`), `src/theme/map-style.ts`, `src/theme/tokens.ts`, `src/i18n/hu.json`, `__mocks__/react-native-maps.tsx`, `app.config.ts`, `Makefile`, `docs/device-test.md`, M5-20, Q1.
