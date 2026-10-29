/**
 * Őrjárat – design tokenek (B irány: „Éjszakai kártya”)
 *
 * Forrás: a Design vászon „E-mail és tokenek” oldala.
 * Használat: const t = useTheme(); <View style={{ backgroundColor: t.color.bg }} />
 * A sötét téma az elsődleges; a világos téma ugyanazokat a kulcsokat adja.
 *
 * Átvéve: docs/orjarat-design-handoff/src/theme/tokens.ts. Eltérések: a statusStyle és a syncStyle
 * feliratai a src/i18n/hu.json kulcsai (label → t(label)), nem magyar szövegek; a komponensekhez
 * (M3-26) új kulcsok: knob szín, a DESIGN_HANDOFF 5. méretei (typography, size, iconSize, border, press).
 */

import type { TranslationKey } from '@/i18n';

export type ThemeName = 'dark' | 'light';

export const palette = {
  dark: {
    // felületek
    bg: '#0F1420',          // képernyő háttér
    surface: '#182033',     // kártya, chip, gomb (másodlagos), szegmens
    card: '#141B2B',        // listaelem
    field: '#0F1420',       // beviteli mező kitöltés, kártyán belüli mező
    cardBorder: 'transparent', // sötétben nincs keret
    line: '#2C3650',        // elválasztó vonal
    track: '#2C3650',       // haladásjelző háttér, kikapcsolt kapcsoló
    dash: '#2C3650',        // szaggatott keret (hátralévő pont, „hozzáadás”)
    scrim: 'rgba(5,8,14,0.72)',
    knob: '#FFFFFF',        // kapcsoló gombja

    // szöveg
    text: '#E8ECF5',
    text2: '#9AA6BF',

    // akcentus
    accent: '#8AB4FF',
    onAccent: '#0B1630',

    // állapotok (fg = ikon/szöveg/teli jel, bg = halvány háttér)
    ok: '#6EE7A8', okBg: '#1E3A2E',             // teljesítve, leolvasva
    run: '#8AB4FF', runBg: '#1D2B4A',           // folyamatban, info
    warn: '#FFB38A', warnBg: '#3A2418',         // hiányos, esemény, figyelmeztetés
    miss: '#FF8A8A', missBg: '#3D1C22',         // elmaradt, hiányzik, hiba, veszélyes akció
    manual: '#C9B8FF', manualBg: '#2E2747',     // nem igazolt (kézi rögzítés)
    time: '#F5D06B', timeBg: '#3A3216',         // időgyanús
    offFg: '#FFCF7A', offBg: '#2A2414',         // offline / feltöltésre vár
    pending: '#5A6788',                         // hátralévő pont gyűrűje

    // térkép
    mapBg: '#121A2A', mapRoad: '#1B2438', mapBuild: '#222D45', mapLabel: '#8E9BB6',
    mapFence: '#3A4664', mapMarkerText: '#0B1630', mapMe: '#FFFFFF', mapMeHalo: 'rgba(138,180,255,0.3)',
  },
  light: {
    bg: '#EEF2F8',
    surface: '#FFFFFF',
    card: '#FFFFFF',
    field: '#EEF2F8',
    cardBorder: '#DCE3EE',
    line: '#DCE3EE',
    track: '#C7D1E0',
    dash: '#BAC6D8',
    scrim: 'rgba(15,23,38,0.45)',
    knob: '#FFFFFF',

    text: '#0F1726',
    text2: '#4F5B73',

    accent: '#2F6BDB',
    onAccent: '#FFFFFF',

    ok: '#157F4A', okBg: '#D7F2E3',
    run: '#2F6BDB', runBg: '#DCE7FB',
    warn: '#B4470F', warnBg: '#FDE6D8',
    miss: '#C0262D', missBg: '#FBE0E1',
    manual: '#6B46C1', manualBg: '#ECE5FB',
    time: '#8A6100', timeBg: '#FBF0C9',
    offFg: '#8A5300', offBg: '#FDF0D5',
    pending: '#8592AD',

    mapBg: '#E6ECF4', mapRoad: '#FFFFFF', mapBuild: '#D2DBE8', mapLabel: '#4F5B73',
    mapFence: '#9AA6BF', mapMarkerText: '#FFFFFF', mapMe: '#0F1726', mapMeHalo: 'rgba(47,107,219,0.22)',
  },
} as const;

export type ColorTokens = { [K in keyof typeof palette.dark]: string };

/** Manrope – expo-font / @expo-google-fonts/manrope */
export const fontFamily = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
} as const;

/** Tipográfiai skála. A számokhoz mindig fontVariant: ['tabular-nums']. */
export const typography = {
  display:   { fontSize: 72, lineHeight: 72, fontFamily: fontFamily.extrabold, letterSpacing: -2 },   // kezdőlap visszaszámláló
  counter:   { fontSize: 44, lineHeight: 46, fontFamily: fontFamily.extrabold, letterSpacing: -0.9 }, // kör hátralévő idő, betanítás óra
  alarm:     { fontSize: 36, lineHeight: 40, fontFamily: fontFamily.extrabold, letterSpacing: -0.4 }, // ébresztés cím
  result:    { fontSize: 34, lineHeight: 38, fontFamily: fontFamily.extrabold, letterSpacing: -0.3 }, // leolvasás eredmény cím
  title1:    { fontSize: 30, lineHeight: 36, fontFamily: fontFamily.extrabold, letterSpacing: -0.3 }, // képernyőcím
  title2:    { fontSize: 20, lineHeight: 26, fontFamily: fontFamily.extrabold },                      // fejléc, kártyacím
  button:    { fontSize: 20, lineHeight: 24, fontFamily: fontFamily.extrabold },                      // fő gomb (19–22)
  buttonSm:  { fontSize: 16, lineHeight: 20, fontFamily: fontFamily.extrabold },                      // másodlagos gomb
  body:      { fontSize: 16, lineHeight: 22, fontFamily: fontFamily.bold },                           // listaelem név
  bodyRegular: { fontSize: 16, lineHeight: 23, fontFamily: fontFamily.semibold },                     // mező tartalom, magyarázó szöveg
  small:     { fontSize: 13, lineHeight: 18, fontFamily: fontFamily.semibold },                       // meta sor (idő · mód)
  label:     { fontSize: 14, lineHeight: 18, fontFamily: fontFamily.extrabold },                      // szekció- és mezőcímke
  chip:      { fontSize: 13, lineHeight: 16, fontFamily: fontFamily.bold },                           // szinkronjelző
  badge:     { fontSize: 13, lineHeight: 16, fontFamily: fontFamily.extrabold },                      // állapotjelvény
  segment:   { fontSize: 15, lineHeight: 20, fontFamily: fontFamily.extrabold },                      // szegmens (aktív; inaktív: bold)
  banner:    { fontSize: 14, lineHeight: 20, fontFamily: fontFamily.semibold },                       // információs sáv
  micro:     { fontSize: 11, lineHeight: 14, fontFamily: fontFamily.bold },                           // idővonal óra-feliratok (minimum)
} as const;

/** Térközök (px / dp) */
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
/** Képernyő oldalmargó = space.l (16); felső biztonsági zóna a SafeAreaView-ból. */

/** Lekerekítések */
export const radius = {
  pill: 999,  // gombok, chipek, szegmens, kapcsoló
  card: 24,   // kártyák, térképkeret
  item: 18,   // listaelem, beviteli mező, fotó-csempe, információs sáv
  tile: 12,   // ikoncsempe (36×36)
  round: 9999 // kör: állapotjel, ikon gomb (vagy width/2)
} as const;

/** Méretek, érintési felületek */
export const size = {
  touchMin: 48,          // minden érinthető elem minimum
  buttonPrimary: 68,     // fő gomb (űrlap alján)
  buttonHero: 72,        // Leolvasás, Indulok, Tovább (76 az ébresztésen)
  buttonSecondary: 54,   // másodlagos gomb (52–56)
  buttonDashed: 56,      // szaggatott „hozzáadás” gomb (56–60)
  buttonDanger: 52,      // veszélyes szöveggomb
  buttonTonal: 44,       // figyelmeztető tónusos gomb („Javítás”)
  iconButton: 48,        // vissza gomb, kis kerek ikon gomb
  iconButtonMap: 52,     // térkép-vezérlő
  iconButtonLg: 72,      // esemény gomb a Leolvasás mellett
  field: 56,             // beviteli mező (56–58)
  textArea: 100,         // többsoros mező min. magassága (~3 sor)
  pinKey: 80,            // PIN-billentyű (kör)
  listItem: 60,          // listaelem min. magasság (60–64)
  statusDot: 32,         // állapotjel kör a listaelemben
  chipHeight: 30,        // szinkronjelző, kis jelvény
  segmentHeight: 48,     // szegmens kapcsoló (40 belső + 2×4 padding)
  segmentOption: 40,     // szegmens egy opciója
  segmentPadding: 4,
  switchW: 56, switchH: 34, switchKnob: 28,
  resultRingOuter: 196, resultRingInner: 132, // leolvasás eredmény kör
  alarmRing: [232, 180, 128],                 // ébresztés koncentrikus körök
} as const;

/** Ikonméretek (lucide, 24-es rács) */
export const iconSize = {
  badge: 14,      // állapotjelvény
  dot: 16,        // állapotjel kör (32) közepe
  banner: 18,     // információs sáv
  field: 22,      // mezőben (jelszó szem)
  button: 24,     // gomb felirata előtt, ikon gomb (48)
  buttonHero: 26, // hero gomb
  large: 28,      // nagy ikon gomb (72)
} as const;

/** Vonalvastagságok: keret és ikon */
export const border = {
  thin: 1,    // cardBorder
  thick: 2,   // fókusz, kijelölés, szaggatott
  ring: 2.5,  // hátralévő pont gyűrűje
} as const;
export const iconStroke = { regular: 2, bold: 2.8 } as const; // bold: kis körökben (állapotjel, jelvény)

/** Gomb lenyomva / letiltva (DESIGN_HANDOFF 5.1) */
export const press = { opacity: 0.85, scale: 0.98, disabledOpacity: 0.4 } as const;

/** Állapotok → token kulcsok + ikon + felirat (hu.json kulcs). A szöveg mindig megjelenik a szín mellett. */
export type RoundStatus = 'completed' | 'in_progress' | 'incomplete' | 'missed' | 'open';
export type ScanFlag = 'manual' | 'time_suspicious' | 'too_fast' | 'wrong_order';

export const statusStyle = {
  completed:       { fg: 'ok',     bg: 'okBg',     icon: 'check',  label: 'status.completed' },
  in_progress:     { fg: 'run',    bg: 'runBg',    icon: 'arc',    label: 'status.inProgress' },
  incomplete:      { fg: 'warn',   bg: 'warnBg',   icon: 'exclam', label: 'status.incomplete' },
  missed:          { fg: 'miss',   bg: 'missBg',   icon: 'x',      label: 'status.missed' },
  manual:          { fg: 'manual', bg: 'manualBg', icon: 'pencil', label: 'status.manual' },
  time_suspicious: { fg: 'time',   bg: 'timeBg',   icon: 'clock',  label: 'status.timeSuspicious' },
  wrong_order:     { fg: 'warn',   bg: 'warnBg',   icon: 'swap',   label: 'status.wrongOrder' },
  pending:         { fg: 'pending', bg: null,      icon: 'ring',   label: 'status.pending' },
} as const satisfies Record<string, { fg: keyof ColorTokens; bg: keyof ColorTokens | null; icon: string; label: TranslationKey }>;

/**
 * Szinkronjelző állapotai. label: hu.json kulcs; ha van labelQueued, akkor count > 0 esetén az kell.
 * A {{count}} paraméter: t(key, { count }).
 */
export const syncStyle = {
  synced:    { fg: 'text2', bg: 'surface', dot: 'ok',    label: 'sync.synced' },
  online:    { fg: 'text2', bg: 'surface', dot: 'ok',    label: 'sync.online' },
  offline:   { fg: 'offFg', bg: 'offBg',   dot: 'offFg', label: 'sync.offline', labelQueued: 'sync.offlineQueued' },
  uploading: { fg: 'run',   bg: 'runBg',   dot: 'run',   label: 'sync.uploading' },
  error:     { fg: 'miss',  bg: 'missBg',  dot: 'miss',  label: 'sync.error' },
} as const satisfies Record<string, { fg: keyof ColorTokens; bg: keyof ColorTokens; dot: keyof ColorTokens; label: TranslationKey; labelQueued?: TranslationKey }>;

export const theme = (name: ThemeName) => ({
  name,
  color: palette[name] as ColorTokens,
  typography, space, radius, size, fontFamily, iconSize, border, iconStroke, press,
});
export type Theme = ReturnType<typeof theme>;
