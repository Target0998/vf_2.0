# Változások

Rövid, nem technikai összefoglaló az egyes frissítésekről, a staging oldalt átnézőknek. Részletek: [TRACKER.md](TRACKER.md).

## 2026. október 6. (este)

- **Élő számláló a Futás oldalon:** a kártyás adományok maguktól hozzáadódnak az összeghez a Stripe-ból, percenként frissül (egy friss fizetés kb. 1–2 perc múlva jelenik meg). Visszatérített fizetések nem számítanak bele, a havi támogatások minden kifizetett hónapja igen.
- **Kézi rész:** a „futas-gyujtes” oldal CÍME a **nem kártyás** összeg: átutalások és a korábbi gyűjtés, **csak ellenőrzött összeg**. A honlapon kártyával adott összegeket **ne** írd bele, különben kétszer számolódnak.
- **A „9 millió már összegyűlt” állítás lekerült** (oldal szövege, sárga sáv, megosztási leírás), mert nem ellenőrzött szám. A számláló 0-ról indul a 18 milliós cél felé, egyetlen sávval. Ha megvan a valós eddigi összeg (pénzügy: átutalások + korábbi kártyás gyűjtés), az a „futas-gyujtes” címébe kerül; ha tényleg megvan a cél fele, visszatehetjük a két félre bontott sávot.
- **Sárga sáv új szövege:** „*Futás kampány* Október 16-án Budapestről Kerecsendig futunk váltóban a kerecsendi gyerekekért. Fuss velünk – támogasd te is!”

## 2026. október 6. (délután)

- **Új oldal: Futás kampány** – `/futas/`. Önálló, megosztható kampányoldal a Claude Design terv alapján (piros színvariáns): haladásjelző a 18 millió forintos célhoz, adománydoboz, Facebook-megosztás és linkmásolás, átutalási adatok („Közlemény: Futás”). A kártyás adományok a Stripe-ban „futas” kampánycímkét kapnak, így külön szűrhetők.
- A szöveg a Ghost Adminban szerkeszthető (Futás oldal). A kézenálló kisfiús kép a történet mellett van, és ez jelenik meg Facebook-megosztáskor is.
- **Sárga sáv minden oldal tetején:** most a futásra hív („Futás kampány – Október 16-án Budapestről Kerecsendig futunk…”), a „Részletek →” a kampányoldalra visz. A szöveg elején *csillagok közé* írt rész félkövér címke (Design → Theme settings).

## 2026. október 6.

- **Átláthatóság:** a teljes közgyűlési jegyzőkönyvek helyett a **jegyzőkönyvi kivonatok** szerepelnek, „Jegyzőkönyvi kivonatok” címmel (8 db, 2022–2026). A legrégebbi (2022. július 10.) kivonat eredetijét Éva küldi, utána cseréljük.
- **Tevékenységünk:** két új rész került az oldal elejére: **Számokban** (adósságkezelés, munkaerőpiaci mentorálás, várandósok és kisgyermekek kísérése, Éjszakai Klub, kertprogram, idősek) és **Munkatársaink és a családok kísérése** (családmentorok, pszichológus, fejlesztőpedagógus). A szövegek a Közleményből valók; Kata anyaga után bővítjük.
- **Rólunk:** az **Értékeink** rész egyelőre nem látszik, amíg nincsenek megírva a kifejtések. Ha elkészülnek, a Ghost Adminban az „Értékek” oldalakat kell kitölteni és közzétenni, és a rész magától visszakerül.

## 2026. október 5.

- Az új oldal első staging változata: régi oldal tartalmai átköltöztetve (Tevékenységünk, Kapcsolat, Átláthatóság, Galéria, TOP Plusz), Közlemény bejegyzés, új adatkezelési tájékoztató.
- Javítások: lábléc linkjei, HU/EN kapcsoló elrejtve, partnerlogók kattinthatók (Gál Tibor is), az adománydoboz nem ugrál összegváltáskor, a betűtípusok saját szerverről töltődnek.
