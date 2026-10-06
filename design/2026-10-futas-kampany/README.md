# Futás kampány – landing oldal (design 4a)

Forrás: Claude Design projekt, `templates/futas-kampany/FutasKampany.dc.html`
(https://claude.ai/design/p/ff93c644-bb5b-4a9b-b5b8-2ba98e08ff4b). Egyetlen képernyő, desktop (1440 px), **végleges**.

- Megvalósítás: `theme/page-futas.hbs` + „Campaign: Futás” blokk a `screen.css`-ben (mobil nézet a `@media` blokkokban).
- Színvariáns: **piros** (a design alapértelmezése). A többi (bordó, olíva, magenta, kék) a `.camp` CSS-változóival cserélhető:
  bordó `#481a1c / #d2d15d`, olíva `#474218 / #92c02c`, magenta `#cd0b7e / #f18844`, kék `#26409d / #7492d2`.
- Plakátgrafikák: `futas1.svg`, `futas2.svg` az eredetiek; a témában CSS-változós változatuk van
  (`theme/partials/futas-bal.hbs`, `futas-jobb.hbs`, a design `assets/futas/futas-svg.js` fájljából).
- Fotó: `assets/futas/kezenallas.png` (1400×1400) → a témában `content/futas/kezenallas.jpg`-ként, a Ghost oldal kiemelt képe.

**Eltérés a designtól (2026-10-06):** a „9 millió összegyűlt / a cél fele megvan” állítás nem ellenőrzött, ezért az oldalon egyetlen sáv van 0-tól a 18 millióig (VF-076).
