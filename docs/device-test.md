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

## Eredmények

Sablon (egy futáshoz másold le, és a fejlécbe írd a dátumot és a mérföldkövet):

```markdown
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
