# Őrjárat – design handoff csomag

Mobilapp (React Native / Expo, TypeScript) felülete biztonsági őröknek és supervisoroknak. Magyar nyelvű, sötét téma az elsődleges, világos téma is van.

## Hogyan add át Claude Code-nak

1. Csomagold ki a projekt gyökerébe (pl. `docs/design/` mappába), vagy másold a `src/theme` és `src/i18n` mappákat a projekt `src/` mappájába.
2. Kezdő prompt Claude Code-nak, például:

   > Olvasd el a `docs/design/DESIGN_HANDOFF.md`-t és a `docs/design/reference/SCREENS.md`-t. A `src/theme/tokens.ts` a design tokenek forrása, a `src/i18n/hu.json` a feliratoké. Először készíts egy `ThemeProvider`-t (sötét/világos, rendszer szerint + kézi felülírás) és az 5. fejezet alapkomponenseit (Button, IconButton, SyncIndicator, StatusDot, StatusBadge, PointListItem, ProgressRing, RoundTimeline, SegmentedControl, InfoBanner, TextField, PhotoSlot, PinPad). Utána a képernyőket a 6. fejezet sorrendjében, a `reference/*.dc.html` mockupokat követve. Ne használj web-only effekteket.

3. A működési szabályokhoz (szinkron, láncolt napló, időkeret számítása, kör zárása) a funkcionális specifikáció a mérvadó: „Őrjárat-ellenőrző app – alap specifikáció”.

## Tartalom

```
DESIGN_HANDOFF.md            elvek, tokenek, komponensek, képernyők, interakciók
src/theme/tokens.ts          színek (dark/light), tipográfia, térközök, lekerekítés, méretek, állapot-leképezés
src/i18n/hu.json             magyar feliratok
email/shift-report.blade.php műszakjelentés e-mail sablon (Laravel Blade, táblázatos HTML)
reference/SCREENS.md         képernyő → mockup → route
reference/*.dc.html          a Design vászon képernyőinek forrása (vizuális referencia)
```

Vizuális forrás: https://claude.ai/artifact/2PDAc9BpiwMjw9Z7sr5YHB (privát; Claude Code-nak nem kell, a `reference/` mappa ugyanazt tartalmazza).

## Javasolt csomagok

`expo-router`, `@expo-google-fonts/manrope`, `expo-font`, `react-native-svg`, `lucide-react-native`, `react-native-reanimated`, `expo-haptics`, `expo-keep-awake`, `expo-navigation-bar`, `react-native-maps`, `react-native-draggable-flatlist`, `react-native-nfc-manager`, `expo-camera`, `expo-image-picker`/`expo-camera` a fotókhoz, `expo-notifications`, `expo-location`.
