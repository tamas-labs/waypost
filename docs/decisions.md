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
