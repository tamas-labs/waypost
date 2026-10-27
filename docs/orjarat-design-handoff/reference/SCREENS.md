# Képernyőlista

A `*.dc.html` fájlok HTML mockupok (a Design vászon forrásai). Böngészőben nem futnak önállóan. Olvasd őket szövegként: a `style` attribútumokban vannak a méretek, a `{{t.xxx}}` helyeken a `tokens.ts` színkulcsai (pl. `{{t.accent}}` → `color.accent`), a `renderVals()`-ban a mintaadatok és a sötét/világos színkészlet.

| # | Képernyő | Referencia | Javasolt route |
|---|---|---|---|
| G1 | PIN-belépés | `B-PIN.dc.html` | `/(guard)/pin` |
| G2 | Műszakkezdés | `B-Muszakkezdes.dc.html` | `/(guard)/shift-start` |
| G3 | Műszak kezdőlap | `B-Kezdolap.dc.html` | `/(guard)/home` |
| G4 | Ébresztés / kör indul | `B-Ebresztes.dc.html` | `/(guard)/alarm` |
| G5 | Kör folyamatban – lista | `B-Kor.dc.html` | `/(guard)/round` |
| G6 | Kör folyamatban – térkép | `B-Terkep.dc.html` | `/(guard)/round?view=map` |
| G7 | Sikeres leolvasás | `B-Siker.dc.html` | `/(guard)/scan-result?kind=success` (modal) |
| G8 | Ismeretlen címke | `B-Ismeretlen.dc.html` | `/(guard)/scan-result?kind=unknown` (modal) |
| G9 | Rossz sorrend | `B-Sorrend.dc.html` | `/(guard)/scan-result?kind=order` (modal) |
| G10 | Kézi rögzítés | `B-Kezi.dc.html` | `/(guard)/manual` |
| G11 | Esemény rögzítése | `B-Esemeny.dc.html` | `/(guard)/incident` |
| G12 | Műszakzárás | `B-Zaras.dc.html` | `/(guard)/shift-end` |
| S1 | Supervisor belépés | `B-Login.dc.html` | `/supervisor/login` |
| S2 | Telephelyek | `S-Telephelyek.dc.html` | `/supervisor/sites` |
| S3 | Telephely részletei | `S-Telephely.dc.html` | `/supervisor/sites/[id]` |
| S4 | Kör részletei térképpel | `S-KorReszletek.dc.html` | `/supervisor/rounds/[id]` |
| S5 | Betanítás – bejárás | `S-Betanitas.dc.html` | `/supervisor/routes/[id]/train` |
| S6 | Betanítás – pont adatai | `S-PontAdatai.dc.html` | `/supervisor/routes/[id]/train/point` |
| S7 | Útvonal szerkesztése | `S-Utvonal.dc.html` | `/supervisor/routes/[id]/edit` |
| S8 | Menetrend | `S-Menetrend.dc.html` | `/supervisor/routes/[id]/schedule` |
| S9 | Őrök és PIN-kódok | `S-Orok.dc.html` | `/supervisor/sites/[id]/guards` |
| S10 | Jelentésbeállítások | `S-Jelentesek.dc.html` | `/supervisor/sites/[id]/reports` |
| E1 | Műszakjelentés e-mail (mockup) | `E-Muszakjelentes.dc.html` | – (backend: `email/shift-report.blade.php`) |
| T1 | Design tokenek (tábla) | `T-Tokenek.dc.html` | – |
| T2 | Komponensek (mindkét témában) | `T-Komponensek.dc.html` | – |

Képernyőméret a mockupokon: 390 × 844 (iPhone 14/15). A felső 52 px a status bar + safe area helye; az alsó 30 px a home indicator.
