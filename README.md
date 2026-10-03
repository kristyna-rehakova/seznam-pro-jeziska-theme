# 🎄 Seznam pro Ježíška

Soukromý rodinný seznam vánočních dárků jako WordPress téma.

Celý web je jedna aplikace — WordPress obstarává přihlašování, hesla, e-maily
a role, všechno ostatní má téma vlastní.

---

## Hlavní pravidlo

**Nikdo se nikdy nedozví, kdo dárek rezervoval. A u svých vlastních dárků
se člověk nedozví ani to, že rezervované jsou.**

Vynucuje to server, ne vzhled. Dárek smí opustit backend jedinou funkcí —
`spj_gift_dto()` v [`inc/gifts.php`](inc/gifts.php):

| Kdo se dívá | Co dostane |
|---|---|
| vlastník dárku (i když je admin) | `id, name, url, priority, price, image, note` — klíč o rezervaci v odpovědi **vůbec není** |
| kdokoli jiný | totéž + `reserved` a `reservedByMe` |
| poručník u seznamu svého dítěte | totéž co ostatní — vidí stav, ne kdo |

`reserver_id` neopustí server nikdy. Čte se jen v `inc/reservations.php`
(pro zrušení vlastní rezervace) a v `inc/mail.php` (pro odeslání notifikace).

Tři méně zjevné úniky, které jsou ošetřené:

1. **Rozdíl v chování.** Po úpravě dárku dostane vlastník vždy jen
   „Dárek byl upraven." Nikdy zmínku o odeslaném e-mailu. Odpověď API je
   stejná, ať rezervace existuje nebo ne.
2. **Probing přes chybové kódy.** Zrušení rezervace na *vlastním* dárku vrací
   vždy `403` bez ohledu na to, jestli rezervace existuje. Totéž pro admina.
3. **REST API WordPressu.** Dárky **nejsou** custom post types a rezervace
   **nejsou** post meta — jsou ve vlastních tabulkách. Jinak by je šlo vytáhnout
   přes `/wp-json/wp/v2/`. Anonymní přístup k REST je navíc zavřený úplně
   ([`inc/security.php`](inc/security.php)).

---

## Struktura

```
style.css          hlavička tématu + celý design
functions.php      setup, načtení skriptů, OPcache flush
index.php          prázdná kostra, aplikaci vykresluje JS
inc/
  db.php           vlastní tabulky (people, gifts, reservations)
  people.php       účty + dětské profily, oprávnění poručníků
  gifts.php        CRUD dárků + spj_gift_dto()  ← srdce ochrany
  reservations.php rezervace a jejich rušení
  mail.php         notifikace přes wp_mail()
  security.php     zamčení wp-adminu a REST API
  link-preview.php načtení názvu, ceny a obrázku z odkazu (+ ochrana SSRF)
  admin.php        správa profilů
  api.php          jediný endpoint s rozcestníkem akcí
assets/
  api.js           volání PHP (náhrada prototypového server.js)
  views.js         šablony (data → HTML)
  app.js           stav, router, obsluha akcí
```

API je jeden endpoint `POST /wp-json/jezisek/v1/call` s tělem
`{"action": "...", "args": [...]}`. Záměrně: `assets/api.js` je díky tomu
doslovná náhrada prototypového `server.js`, takže `views.js` a `app.js`
zůstaly beze změny — a kontrola oprávnění je na jednom místě,
kde se dá přečíst celá najednou.

---

## Datový model

Tři vlastní tabulky s prefixem instalace (`wp_jezisek_*`):

- **people** — účty i dětské profily. Účet má `wp_user_id`, dítě má `NULL`
  a místo toho `guardian_id`. Vlastníkem dárku je vždy řádek odsud, takže
  seznamy dětí fungují stejně jako seznamy dospělých.
- **gifts** — `owner_id`, název, odkaz, priorita 1–3, cena, obrázek, poznámka.
- **reservations** — `gift_id` (UNIQUE, jeden dárek = max jedna rezervace)
  a `reserver_id`.

Uživatelská jména, hesla a e-maily zůstávají v tabulkách WordPressu.

---

## Dětské profily

Dítě se nepřihlašuje a nic si nerezervuje. Má vlastní seznam přání a
poručníka, který ho spravuje — na stránce **Moje přání** se objeví přepínač
mezi vlastním seznamem a seznamy dětí.

Poručník u seznamu dítěte **vidí**, co je volné a co rezervované (ale ne kým),
protože je to on, kdo koordinuje, co dítěti koupí sám. Tajit to před ním nemá
koho chránit — dítě do aplikace nechodí.

Účet, který spravuje děti, nejde smazat, dokud se jim nepřiřadí jiný poručník.

---

## Nasazení

Téma je připravené pro **Git Updater** (hlavička obsahuje `GitHub Theme URI`
a `Primary Branch`). Postup:

1. Nahrát téma do `wp-content/themes/` a aktivovat.
2. Při aktivaci se samy vytvoří tabulky.
3. Po aktualizaci přes Git Updater stačí zvýšit `Version` ve `style.css`
   a `SPJ_VERSION` ve `functions.php` — téma si pak samo vyprázdní OPcache.

**První účet:** administrátor WordPressu, který téma aktivuje, dostane profil
v aplikaci automaticky při prvním otevření. Další členy rodiny i děti zakládá
přes sekci **Administrace** přímo v aplikaci.

---

## Co je potřeba ohlídat

- **Odesílání e-mailů.** Téma posílá přes `wp_mail()`. Pokud hosting
  neodesílá spolehlivě, doplnit SMTP plugin — aplikace se nemění.
- **HTTPS.** Trvalé přihlášení posílá cookie s příznakem `Secure`.
- **Načtení z odkazu.** Některé e-shopy roboty blokují; ruční vyplnění
  je proto vždy plnohodnotná varianta, ne nouzové řešení.
