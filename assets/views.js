/* =====================================================================
   KLIENT — šablony. Čisté funkce: data → HTML string.
   Nic tady nerozhoduje o tom, co uživatel smí vidět; view jen zobrazí,
   co dostane od Api. (Proto se tady například vůbec nepracuje s tím,
   kdo dárek rezervoval — server to neposílá.)
   ===================================================================== */
(function () {
'use strict';

/* ---------- pomůcky ---------- */
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const czk = n => (n == null || n === '')
  ? '' : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' Kč';

const stars = p => '⭐'.repeat(Math.max(1, Math.min(3, p || 1)));

function avatar(user, size) {
  const a = user && user.avatar ? String(user.avatar) : '';
  const cls = 'av s' + (size || 48);
  if (a.indexOf('data:') === 0 || /^https?:\/\//i.test(a)) {
    return '<span class="' + cls + '"><img src="' + esc(a) + '" alt=""></span>';
  }
  if (a) return '<span class="' + cls + '">' + esc(a) + '</span>';
  const initial = (user && user.name ? user.name.trim()[0] : '?').toUpperCase();
  return '<span class="' + cls + '">' + esc(initial) + '</span>';
}

function host(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return 'odkaz'; }
}

/* ---------- navigace ---------- */
const NAV = [
  { key: 'home',     ic: '🏠', label: 'Přehled',      short: 'Přehled' },
  { key: 'mine',     ic: '🎁', label: 'Moje přání',   short: 'Přání' },
  { key: 'family',   ic: '👨‍👩‍👧', label: 'Rodina',      short: 'Rodina' },
  { key: 'reserved', ic: '🔖', label: 'Rezervace',    short: 'Rezervace' },
  { key: 'profile',  ic: '👤', label: 'Profil',       short: 'Profil' },
  { key: 'admin',    ic: '⚙️', label: 'Administrace', short: 'Admin', adminOnly: true }
];
function navItems(user) { return NAV.filter(n => !n.adminOnly || user.role === 'admin'); }

function shell(user, view, body) {
  const items = navItems(user);
  const isOn = k => (view === k || (k === 'family' && view === 'member')) ? ' on' : '';
  return '' +
    '<div class="topbar">' +
      '<div class="inner">' +
        '<div class="brand"><span class="tree">🎄</span><span>Seznam pro Ježíška</span></div>' +
        '<div class="spacer"></div>' +
        '<nav class="navpills">' +
          items.map(n => '<button data-act="nav" data-view="' + n.key + '" class="' +
            isOn(n.key).trim() + '"><span>' + n.ic + '</span>' + n.label + '</button>').join('') +
        '</nav>' +
        '<button class="userchip" data-act="nav" data-view="profile" aria-label="Profil">' +
          avatar(user, 32) + '<span class="nm">' + esc(user.name) + '</span></button>' +
      '</div>' +
      '<div class="hair"></div>' +
    '</div>' +
    '<main>' + body + '</main>' +
    '<nav class="bottomnav">' +
      items.map(n => '<button data-act="nav" data-view="' + n.key + '" class="' + isOn(n.key).trim() +
        '" aria-label="' + esc(n.label) + '"><span class="ic">' + n.ic + '</span>' +
        '<span class="lb">' + esc(n.short) + '</span></button>').join('') +
    '</nav>';
}

/* ---------- přihlášení ---------- */
function authFrame(inner) {
  return '<div class="auth"><div class="box">' +
    '<div class="logo"><span class="tree">🎄</span><h1>Seznam pro Ježíška</h1>' +
    '<div class="sub">Soukromý rodinný seznam vánočních dárků</div></div>' + inner +
    '</div></div>';
}

function loginView() {
  return authFrame(
    '<form class="card pad" data-form="login">' +
      '<div class="fld"><label>E-mail</label>' +
        '<input name="email" type="email" autocomplete="username" required placeholder="jmeno@rodina.cz"></div>' +
      '<div class="fld"><label>Heslo</label>' +
        '<input name="password" type="password" autocomplete="current-password" required></div>' +
      '<label class="check">' +
        '<input type="checkbox" name="remember" checked>' +
        '<span>Zapamatovat si přihlášení' +
          '<span class="sub">Na cizím zařízení nech vypnuté.</span></span>' +
      '</label>' +
      '<div class="err small hidden" data-err></div>' +
      '<button class="btn block" type="submit">Přihlásit se</button>' +
      '<button class="link" type="button" data-act="goForgot">Zapomenuté heslo?</button>' +
    '</form>');
}

function forgotView(sent) {
  if (sent) {
    return authFrame('<div class="card pad center">' +
      '<div style="font-size:2.2rem">📧</div>' +
      '<h2 style="margin:10px 0 8px">E-mail odeslán</h2>' +
      '<p class="muted small">Pokud účet s tímhle e-mailem existuje, poslali jsme na něj ' +
        'odkaz pro nastavení nového hesla. Mrkni i do spamu.</p>' +
      '<button class="btn ghost block" style="margin-top:16px" data-act="goLogin">' +
        'Zpět na přihlášení</button>' +
    '</div>');
  }
  return authFrame(
    '<form class="card pad" data-form="forgot">' +
      '<h2 style="margin-bottom:6px">Zapomenuté heslo</h2>' +
      '<p class="muted small" style="margin-bottom:16px">Zadej svůj e-mail. Pošleme ti ' +
        'bezpečný odkaz pro nastavení nového hesla.</p>' +
      '<div class="fld"><label>E-mail</label>' +
        '<input name="email" type="email" required placeholder="jmeno@rodina.cz"></div>' +
      '<div class="err small hidden" data-err></div>' +
      '<button class="btn block" type="submit">Poslat odkaz</button>' +
      '<button class="link" type="button" data-act="goLogin">← Zpět na přihlášení</button>' +
    '</form>');
}
function mustChangeView(user) {
  return authFrame(
    '<form class="card pad" data-form="mustChange">' +
      '<div class="center" style="margin-bottom:16px">' + avatar(user, 64) + '</div>' +
      '<h2 style="margin-bottom:6px">Vítej, ' + esc(user.name) + '</h2>' +
      '<p class="muted small" style="margin-bottom:16px">Tvůj účet má zatím dočasné heslo. ' +
        'Než budeš pokračovat, nastav si prosím vlastní.</p>' +
      '<div class="fld"><label>Dočasné heslo</label>' +
        '<input name="current" type="password" required></div>' +
      '<div class="fld"><label>Nové heslo</label>' +
        '<input name="p1" type="password" autocomplete="new-password" required>' +
        '<span class="hint">Alespoň 8 znaků.</span></div>' +
      '<div class="fld"><label>Nové heslo znovu</label>' +
        '<input name="p2" type="password" autocomplete="new-password" required></div>' +
      '<div class="err small hidden" data-err></div>' +
      '<button class="btn block" type="submit">Uložit a pokračovat</button>' +
      '<button class="link" type="button" data-act="logout">Odhlásit se</button>' +
    '</form>');
}

/* ---------- karta dárku ---------- */
/* mode: 'mine' = vlastní (žádná informace o rezervaci)
         'other' = cizí (volný / rezervováno)
         'admin' = správa všech dárků */
/* Stav rezervace. Vrací prázdno, pokud ho server neposlal — tedy
   u vlastních dárků (klíč 'reserved' v DTO vůbec není). */
function statusBadge(g) {
  if (!('reserved' in g)) return '';
  if (!g.reserved) return '<span class="badge free">🟢 Volný</span>';
  return g.reservedByMe
    ? '<span class="badge mine">🔴 Rezervováno — tebou</span>'
    : '<span class="badge taken">🔴 Rezervováno</span>';
}

function ownerChip(g, size) {
  if (!g.ownerName) return '';
  return '<div class="metarow small muted">' +
    avatar({ name: g.ownerName, avatar: g.ownerAvatar }, size || 32) +
    '<span>' + esc(g.ownerName) + '</span></div>';
}

/* Akce u dárku. 'big' = plná velikost pro detail, jinak kompaktní na kartě. */
function giftActions(g, mode, big) {
  const c = big ? 'btn' : 'btn sm';
  if (mode === 'mine') {
    return '<button class="' + c + ' ghost" data-act="editGift" data-id="' + g.id + '">✏️ Upravit</button>' +
           '<button class="' + c + ' danger" data-act="deleteGift" data-id="' + g.id + '">🗑 Smazat</button>';
  }
  if (mode === 'other') {
    if (!g.reserved) {
      return '<button class="' + c + '" data-act="reserve" data-id="' + g.id + '">🎁 Rezervovat dárek</button>';
    }
    if (g.reservedByMe) {
      return '<button class="' + c + ' ghost" data-act="cancelReserve" data-id="' + g.id + '">Zrušit rezervaci</button>';
    }
    return '';
  }
  /* Seznam dítěte: poručník ho spravuje, a v detailu si dárek může
     i rezervovat („tohle kupuju já"). */
  if (mode === 'ward') {
    let s = '<button class="' + c + ' ghost" data-act="editGift" data-id="' + g.id + '">✏️ Upravit</button>' +
            '<button class="' + c + ' danger" data-act="deleteGift" data-id="' + g.id + '">🗑 Smazat</button>';
    if (big && !g.reserved) {
      s += '<button class="' + c + '" data-act="reserve" data-id="' + g.id + '">🎁 Koupím já</button>';
    } else if (big && g.reservedByMe) {
      s += '<button class="' + c + ' ghost" data-act="cancelReserve" data-id="' + g.id + '">Zrušit rezervaci</button>';
    }
    return s;
  }
  if (mode === 'admin') {
    return '<button class="' + c + ' ghost" data-act="editGift" data-id="' + g.id + '">✏️' +
             (big ? ' Upravit' : '') + '</button>' +
           '<button class="' + c + ' danger" data-act="deleteGift" data-id="' + g.id + '">🗑' +
             (big ? ' Smazat' : '') + '</button>' +
           (g.reserved ? '<button class="' + c + ' ghost" data-act="adminCancelReserve" data-id="' +
              g.id + '">Zrušit rez.</button>' : '');
  }
  return '';
}

/* Karta v mřížce. Celá je klikací a otevře detail; tlačítka uvnitř mají
   vlastní data-act, takže si klik vezmou dřív než karta. */
function giftCard(g, mode) {
  const pic = g.image
    ? '<div class="pic"><img src="' + esc(g.image) + '" alt=""></div>'
    : '<div class="pic">🎁</div>';
  const status = statusBadge(g);
  const acts = giftActions(g, mode, false);

  return '<article class="card gift" data-act="openGift" data-id="' + g.id + '" ' +
      'tabindex="0" role="button" aria-label="Detail dárku: ' + esc(g.name) + '">' +
    pic + '<div class="body">' +
    ownerChip(g) +
    '<h3>' + esc(g.name) + '</h3>' +
    '<div class="metarow"><span class="stars" title="Priorita">' + stars(g.priority) + '</span>' +
      (g.price != null && g.price !== '' ? '<span class="price">' + czk(g.price) + '</span>' : '') +
    '</div>' +
    (status ? '<div class="metarow">' + status + '</div>' : '') +
    (g.url ? '<a class="shoplink" href="' + esc(g.url) + '" target="_blank" rel="noopener noreferrer">' +
      '🔗 ' + esc(host(g.url)) + ' ↗</a>' : '') +
    (g.note ? '<p class="note clamp">' + esc(g.note) + '</p>' : '') +
    (acts ? '<div class="acts">' + acts + '</div>' : '') +
  '</div></article>';
}

/* Detail dárku. Pořadí údajů je stejné jako ve formuláři:
   obrázek → název → odkaz → priorita → cena → poznámka. */
function giftDetail(g, mode) {
  const status = statusBadge(g);
  const acts = giftActions(g, mode, true);
  const row = (label, value) => value
    ? '<div class="drow"><span class="dl">' + label + '</span><span class="dv">' + value + '</span></div>'
    : '';
  return '' +
    '<div class="mhead"><h2>Detail dárku</h2>' +
      '<button class="xbtn" data-act="closeModal">✕</button></div>' +
    '<div class="mbody">' +
      (g.image
        ? '<div class="dpic"><img src="' + esc(g.image) + '" alt=""></div>'
        : '<div class="dpic">🎁</div>') +
      ownerChip(g, 32) +
      '<h2 class="dname">' + esc(g.name) + '</h2>' +
      (status ? '<div class="metarow" style="margin-bottom:14px">' + status + '</div>' : '') +
      row('Odkaz', g.url
        ? '<a href="' + esc(g.url) + '" target="_blank" rel="noopener noreferrer">' +
          esc(host(g.url)) + ' ↗</a>' : '') +
      row('Priorita', '<span class="stars">' + stars(g.priority) + '</span>') +
      row('Cena', (g.price != null && g.price !== '')
        ? '<span class="price">' + czk(g.price) + '</span>' : '') +
      row('Poznámka', g.note ? esc(g.note) : '') +
    '</div>' +
    (acts ? '<div class="mfoot wrap">' + acts + '</div>' : '');
}

function emptyBox(icon, title, text, btn) {
  return '<div class="empty"><span class="ic">' + icon + '</span>' +
    '<div style="font-weight:600;color:var(--ink);margin-bottom:4px">' + esc(title) + '</div>' +
    '<div class="small">' + esc(text) + '</div>' +
    (btn || '') + '</div>';
}

/* ---------- stránky ---------- */
function plural(n, one, few, many) {
  if (n === 1) return one;
  return (n >= 2 && n <= 4) ? few : many;   // 0 a 5+ → „členů"
}

/* Velké čtvercové tlačítko pro přidání přání. */
const addSquare = '<button class="addsq" data-act="newGift" aria-label="Přidat přání">' +
  '<span class="pl">＋</span><span class="tx">Přidat</span></button>';

function memberCard(m) {
  return '<button class="member" data-act="openMember" data-id="' + m.id + '" ' +
    'aria-label="Seznam přání: ' + esc(m.name) + '">' +
    avatar(m, 48) + '<span class="mi"><span class="nm">' + esc(m.name) +
    (m.isChild ? ' <span class="badge gold">dítě</span>' : '') + '</span>' +
    '<span class="ct">' + m.giftCount + ' ' +
      plural(m.giftCount, 'přání', 'přání', 'přání') + '</span></span>' +
    '<span class="arrow">›</span></button>';
}

function homeView(user, myCount, resCount, members) {
  return '' +
    '<div class="hero"><span class="orn">✦</span>' +
      '<p>Do Vánoc zbývá ještě chvilka — ať má Ježíšek přehled.</p></div>' +
    '<div class="tiles">' +
      '<button class="tile" data-act="nav" data-view="mine">' +
        '<span class="n">' + myCount + '</span>' +
        '<span class="l">Přání</span><span class="ic">🎁</span></button>' +
      '<button class="tile" data-act="nav" data-view="reserved">' +
        '<span class="n">' + resCount + '</span>' +
        '<span class="l">Rezervace</span><span class="ic">🔖</span></button>' +
    '</div>' +
    '<div class="btnrow stretch" style="margin-bottom:8px">' +
      '<button class="btn" data-act="newGift">＋ Přidat přání</button>' +
      '<button class="btn ghost" data-act="nav" data-view="family">👨‍👩‍👧 Seznamy rodiny</button>' +
    '</div>' +
    '<div class="sect"><h2>Rodina</h2><span class="ln"></span></div>' +
    '<div class="grid">' + members.map(memberCard).join('') + '</div>';
}

/* Jedna stránka pro vlastní seznam i pro seznamy dětí, které uživatel
   spravuje. 'active' = null (vlastní) nebo { id, name, avatar } dítěte. */
function myGiftsView(gifts, wards, active) {
  const ws = wards || [];
  const count = gifts.length + ' ' + plural(gifts.length, 'přání', 'přání', 'přání');

  const switcher = ws.length
    ? '<div class="switch">' +
        '<button class="chip' + (active ? '' : ' on') + '" data-act="pickList" data-id="">' +
          '🎁 Moje přání</button>' +
        ws.map(w => '<button class="chip' + (active && active.id === w.id ? ' on' : '') +
          '" data-act="pickList" data-id="' + w.id + '">' +
          (w.avatar ? esc(w.avatar) + ' ' : '') + esc(w.name) + '</button>').join('') +
      '</div>'
    : '';

  const head = active
    ? '<div class="pagehead">' + avatar(active, 48) + '<div class="t">' +
        '<h1>' + esc(active.name) + '</h1>' +
        '<div class="sub">' + count + ' · spravuješ tento seznam, ' +
        'u rezervovaných dárků nevidíš, kdo je drží</div></div>' + addSquare + '</div>'
    : '<div class="pagehead"><div class="t"><h1>Moje přání</h1>' +
        '<div class="sub">' + count + ' · O rezervacích se tady nic nedozvíš 🤫</div></div>' +
        addSquare + '</div>';

  const body = gifts.length
    ? '<div class="grid">' + gifts.map(g => giftCard(g, active ? 'ward' : 'mine')).join('') + '</div>'
    : emptyBox('🎁', 'Zatím žádná přání',
        active ? 'Přidej první dárek do seznamu — ' + active.name + ' zatím nic nemá.'
               : 'Přidej první dárek, ať rodina ví, co tě potěší.',
        '<div style="margin-top:14px"><button class="btn" data-act="newGift">＋ Přidat přání</button></div>');

  return switcher + head + body;
}

/* 'tree' = [{ name, members:[…] }] v pevném pořadí skupin. */
function familyView(tree) {
  const anyone = tree.some(gr => gr.members.length);
  return '' +
    '<div class="pagehead"><div class="t"><h1>Rodina</h1>' +
      '<div class="sub">Vyber člena rodiny a podívej se na jeho seznam.</div></div></div>' +
    tree.map(gr =>
      '<div class="sect"><h2>' + esc(gr.name) + '</h2><span class="ln"></span>' +
        '<span class="small muted">' + gr.members.length + ' ' +
        plural(gr.members.length, 'člen', 'členové', 'členů') + '</span></div>' +
      (gr.members.length
        ? '<div class="grid">' + gr.members.map(memberCard).join('') + '</div>'
        : '<p class="small muted" style="margin:0">Zatím tu nikdo není.</p>')
    ).join('') +
    (anyone ? '' : '<div style="margin-top:18px">' +
      emptyBox('👨‍👩‍👧', 'Žádní další členové', 'Další účty může vytvořit administrátor.') + '</div>');
}

function memberView(member, gifts) {
  return '' +
    '<button class="backlink" data-act="nav" data-view="family">← Rodina</button>' +
    '<div class="pagehead">' + avatar(member, 48) + '<div class="t">' +
      '<h1>' + esc(member.name) + '</h1>' +
      '<div class="sub">' + gifts.length + ' ' + plural(gifts.length, 'přání', 'přání', 'přání') +
      ' · u rezervovaných dárků nikdy neuvidíš, kdo je drží</div></div></div>' +
    (gifts.length
      ? '<div class="grid">' + gifts.map(g => giftCard(g, 'other')).join('') + '</div>'
      : emptyBox('🎁', 'Seznam je prázdný', member.name + ' si zatím nic nepřeje.'));
}

function reservedView(gifts) {
  return '' +
    '<div class="pagehead"><div class="t"><h1>Rezervace</h1>' +
      '<div class="sub">Dárky, které sháníš ty. Vlastník se o rezervaci nedozví.</div>' +
    '</div></div>' +
    (gifts.length
      ? '<div class="grid">' + gifts.map(g => giftCard(g, 'other')).join('') + '</div>'
      : emptyBox('🔖', 'Zatím nic nerezervováno',
          'Projdi seznamy v sekci Rodina a rezervuj dárek, který chceš pořídit.',
          '<div style="margin-top:14px"><button class="btn" data-act="nav" data-view="family">' +
          '👨‍👩‍👧 Přejít na Rodinu</button></div>'));
}

function profileView(user) {
  return '' +
    '<div class="pagehead"><div class="t"><h1>Profil</h1>' +
      '<div class="sub">Tvoje jméno, e-mail a avatar.</div></div></div>' +
    '<form class="card pad" data-form="profile" style="margin-bottom:14px">' +
      '<div class="fld"><label>Avatar</label>' +
        '<div class="imgpick">' +
          '<span class="prev" data-avprev>' + avatarInner(user) + '</span>' +
          '<span class="ctl">' +
            '<input name="avatar" value="' + (isImg(user.avatar) ? '' : esc(user.avatar || '')) +
              '" placeholder="Emoji, např. 👩" maxlength="4" data-avemoji>' +
            '<span class="hint">Zadej emoji, nebo nahraj obrázek. Bez obojího se ' +
              'zobrazí iniciála.</span>' +
            '<button class="btn ghost sm" type="button" data-act="pickAvatar">📷 Nahrát obrázek</button>' +
          '</span>' +
        '</div>' +
      '</div>' +
      '<div class="fld"><label>Jméno</label>' +
        '<input name="name" value="' + esc(user.name) + '" required maxlength="60"></div>' +
      '<div class="fld"><label>E-mail</label>' +
        '<input value="' + esc(user.email) + '" readonly>' +
        '<span class="hint">E-mail mění administrátor.</span></div>' +
      '<div class="err small hidden" data-err></div>' +
      '<button class="btn block" type="submit">Uložit profil</button>' +
    '</form>' +
    '<form class="card pad" data-form="password" style="margin-bottom:14px">' +
      '<h2 style="margin-bottom:14px">Změna hesla</h2>' +
      '<div class="fld"><label>Současné heslo</label><input name="current" type="password" required></div>' +
      '<div class="fld"><label>Nové heslo</label><input name="p1" type="password" required>' +
        '<span class="hint">Alespoň 8 znaků.</span></div>' +
      '<div class="fld"><label>Nové heslo znovu</label><input name="p2" type="password" required></div>' +
      '<div class="err small hidden" data-err></div>' +
      '<button class="btn ghost block" type="submit">Změnit heslo</button>' +
    '</form>' +
    '<button class="btn danger block" data-act="logout">Odhlásit se</button>';
}

function isImg(a) { return a && (String(a).indexOf('data:') === 0 || /^https?:\/\//i.test(a)); }
function avatarInner(user) {
  const a = user.avatar || '';
  if (isImg(a)) return '<img src="' + esc(a) + '" alt="">';
  return a ? esc(a) : esc((user.name || '?').trim()[0].toUpperCase());
}

/* ---------- administrace ---------- */
function adminView(tab, users, gifts, meId) {
  const t = k => 'class="btn ' + (tab === k ? '' : 'ghost ') + 'sm" data-act="adminTab" data-tab="' + k + '"';
  let body;
  if (tab === 'gifts') {
    body = gifts.length
      ? '<div class="grid">' + gifts.map(g => giftCard(g, 'admin')).join('') + '</div>'
      : emptyBox('🎁', 'Žádné dárky', 'V aplikaci zatím nikdo nic nepřidal.');
  } else {
    body = '<div class="btnrow" style="margin-bottom:14px">' +
        '<button class="btn" data-act="newUser">＋ Nový profil</button></div>' +
      '<div class="rows">' + users.map(u =>
        '<div class="row">' + avatar(u, 48) +
          '<div class="info"><div class="t">' + esc(u.name) +
            (u.kind === 'child' ? ' <span class="badge gold">dítě</span>' : '') +
            (u.role === 'admin' && u.kind !== 'child' ? ' <span class="badge role">admin</span>' : '') +
            (u.mustChangePassword ? ' <span class="badge warn">dočasné heslo</span>' : '') +
            (u.id === meId ? ' <span class="badge mine">ty</span>' : '') + '</div>' +
            '<div class="s">' +
              (u.kind === 'child'
                ? 'bez přihlášení · spravuje ' + esc(u.guardianName || '—')
                : esc(u.email) +
                  (u.wardCount ? ' · spravuje ' + u.wardCount + ' ' +
                    plural(u.wardCount, 'dítě', 'děti', 'dětí') : '')) +
              ' · ' + u.giftCount + ' ' + plural(u.giftCount, 'přání', 'přání', 'přání') +
              (u.familyGroup ? ' · ' + esc(u.familyGroup) : '') + '</div></div>' +
          '<div class="ra">' +
            '<button class="btn ghost sm" data-act="editUser" data-id="' + u.id + '">✏️ Upravit</button>' +
            (u.kind === 'child' ? '' :
              '<button class="btn ghost sm" data-act="resetUserPwd" data-id="' + u.id + '">🔑 Reset hesla</button>') +
            (u.id === meId ? '' :
              '<button class="btn danger sm" data-act="deleteUser" data-id="' + u.id + '">🗑</button>') +
          '</div>' +
        '</div>').join('') + '</div>';
  }
  return '' +
    '<div class="pagehead"><div class="t"><h1>Administrace</h1>' +
      '<div class="sub">Správa účtů a všech dárků v aplikaci.</div></div></div>' +
    '<div class="btnrow" style="margin-bottom:16px">' +
      '<button ' + t('users') + '>👥 Uživatelé</button>' +
      '<button ' + t('gifts') + '>🎁 Všechny dárky</button></div>' +
    (tab === 'gifts' ? '<div class="devnote">U <b>tvých vlastních</b> dárků se ani tady ' +
      'nezobrazuje stav rezervace — to pravidlo platí i pro administrátora.</div>' : '') +
    body;
}

/* ---------- formulář dárku ---------- */
function giftForm(g) {
  const v = g || { name: '', url: '', priority: 2, price: '', image: '', note: '' };
  const pb = p => '<button type="button" class="' + (v.priority === p ? 'on' : '') +
    '" data-act="setPrio" data-p="' + p + '">' + '⭐'.repeat(p) + '</button>';
  return '' +
    '<div class="mhead"><h2>' + (g ? 'Upravit přání' : 'Nové přání') + '</h2>' +
      '<button class="xbtn" data-act="closeModal">✕</button></div>' +
    '<form class="mbody" data-form="gift" data-id="' + (g ? g.id : '') + '">' +
      '<input type="hidden" name="priority" value="' + v.priority + '">' +
      '<input type="hidden" name="image" value="' + esc(v.image) + '">' +
      '<div class="fld"><label><span class="ord">1.</span>Název</label>' +
        '<input name="name" value="' + esc(v.name) + '" required maxlength="120" ' +
          'placeholder="Např. Vlněná deka"></div>' +
      '<div class="fld"><label><span class="ord">2.</span>Odkaz</label>' +
        '<input name="url" type="url" value="' + esc(v.url) + '" maxlength="500" ' +
          'placeholder="https://…">' +
        '<button class="btn ghost sm" type="button" data-act="fetchPreview" ' +
          'style="margin-top:4px">🔎 Načíst z odkazu (název, cena, obrázek)</button>' +
        '<span class="hint" data-previewhint></span></div>' +
      '<div class="fld"><label><span class="ord">3.</span>Priorita</label>' +
        '<div class="prio">' + pb(1) + pb(2) + pb(3) + '</div></div>' +
      '<div class="fld"><label><span class="ord">4.</span>Cena</label>' +
        '<input name="price" type="number" inputmode="numeric" min="0" step="1" ' +
          'value="' + esc(v.price == null ? '' : v.price) + '" placeholder="v Kč"></div>' +
      '<div class="fld"><label><span class="ord">5.</span>Obrázek</label>' +
        '<div class="imgpick">' +
          '<span class="prev" data-imgprev>' + (v.image
            ? '<img src="' + esc(v.image) + '" alt="">' : '🎁') + '</span>' +
          '<span class="ctl">' +
            '<button class="btn ghost sm" type="button" data-act="pickImage">📷 Nahrát obrázek</button>' +
            '<button class="btn ghost sm" type="button" data-act="clearImage">✕ Odebrat obrázek</button>' +
          '</span></div></div>' +
      '<div class="fld"><label><span class="ord">6.</span>Poznámka</label>' +
        '<textarea name="note" maxlength="500" placeholder="Např. Ideálně černá, velikost M."' +
          '>' + esc(v.note) + '</textarea></div>' +
      '<div class="err small hidden" data-err></div>' +
      '<div class="btnrow stretch">' +
        '<button class="btn ghost" type="button" data-act="closeModal">Zrušit</button>' +
        '<button class="btn" type="submit">' + (g ? 'Uložit změny' : 'Přidat přání') + '</button>' +
      '</div>' +
    '</form>';
}

/* ---------- formulář uživatele (admin) ---------- */
function userForm(u, groups, guardians) {
  const isNew = !u;
  const v = u || { name: '', email: '', avatar: '', role: 'member', familyGroup: '',
                   kind: 'account', guardianId: null };
  const gs = groups || [];
  const gu = guardians || [];
  const isChild = v.kind === 'child';
  const off = on => on ? '' : ' disabled';     // skryté pole nesmí blokovat odeslání

  return '' +
    '<div class="mhead"><h2>' + (isNew ? 'Nový profil' : 'Upravit profil') + '</h2>' +
      '<button class="xbtn" data-act="closeModal">✕</button></div>' +
    '<form class="mbody" data-form="user" data-id="' + (isNew ? '' : u.id) + '" ' +
        'data-kind="' + esc(v.kind) + '">' +
      (isNew
        ? '<div class="fld"><label>Typ profilu</label>' +
            '<select name="kind" data-act="switchKind">' +
              '<option value="account">Účet s přihlášením</option>' +
              '<option value="child">Dítě — seznam bez přihlášení</option>' +
            '</select>' +
            '<span class="hint">Dítě se nepřihlašuje a nic si nerezervuje. ' +
              'Jeho seznam spravuje poručník.</span></div>'
        : '<div class="fld"><label>Typ profilu</label><input readonly value="' +
            (isChild ? 'Dítě — seznam bez přihlášení' : 'Účet s přihlášením') + '"></div>') +
      '<div class="fld"><label>Jméno</label>' +
        '<input name="name" value="' + esc(v.name) + '" required maxlength="60"></div>' +
      '<div class="fld"><label>Avatar</label>' +
        '<div class="imgpick">' +
          '<span class="prev" data-avprev>' + avatarInner(v) + '</span>' +
          '<span class="ctl">' +
            '<input name="avatar" value="' + (isImg(v.avatar) ? '' : esc(v.avatar || '')) +
              '" placeholder="Emoji, např. 👩" maxlength="4" data-avemoji>' +
            '<button class="btn ghost sm" type="button" data-act="pickAvatar">📷 Nahrát obrázek</button>' +
          '</span></div></div>' +
      '<div class="fld"><label>Rodinná skupina</label><select name="familyGroup">' +
        '<option value=""' + (!v.familyGroup ? ' selected' : '') + '>— bez skupiny —</option>' +
        gs.map(g => '<option value="' + esc(g) + '"' +
          (v.familyGroup === g ? ' selected' : '') + '>' + esc(g) + '</option>').join('') +
        '</select><span class="hint">Určuje, v které sekci se profil zobrazí na stránce Rodina.</span></div>' +

      /* --- pole jen pro účet s přihlášením --- */
      '<div data-kindblock="account"' + (isChild ? ' class="hidden"' : '') + '>' +
        '<div class="fld"><label>E-mail</label>' +
          '<input name="email" type="email" value="' + esc(v.email || '') + '" required' +
            off(!isChild) + '></div>' +
        '<div class="fld"><label>Role</label><select name="role"' + off(!isChild) + '>' +
          '<option value="member"' + (v.role === 'member' ? ' selected' : '') + '>Člen rodiny</option>' +
          '<option value="admin"' + (v.role === 'admin' ? ' selected' : '') + '>Administrátor</option>' +
          '</select></div>' +
        (isNew ? '<div class="fld"><label>Dočasné heslo</label>' +
          '<input name="tempPassword" required minlength="8" value="vanoce2026"' +
            off(!isChild) + '>' +
          '<span class="hint">Uživatel si ho při prvním přihlášení musí změnit.</span></div>' : '') +
      '</div>' +

      /* --- pole jen pro dětský profil --- */
      '<div data-kindblock="child"' + (isChild ? '' : ' class="hidden"') + '>' +
        '<div class="fld"><label>Poručník</label>' +
          '<select name="guardianId" required' + off(isChild) + '>' +
            '<option value="">— vyber účet —</option>' +
            gu.map(x => '<option value="' + x.id + '"' +
              (v.guardianId === x.id ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') +
          '</select>' +
          '<span class="hint">Tento účet bude seznam dítěte přidávat a upravovat.</span></div>' +
      '</div>' +

      '<div class="err small hidden" data-err></div>' +
      '<div class="btnrow stretch">' +
        '<button class="btn ghost" type="button" data-act="closeModal">Zrušit</button>' +
        '<button class="btn" type="submit">' + (isNew ? 'Vytvořit' : 'Uložit') + '</button>' +
      '</div>' +
    '</form>';
}

function resetPwdForm(u) {
  return '' +
    '<div class="mhead"><h2>Reset hesla</h2>' +
      '<button class="xbtn" data-act="closeModal">✕</button></div>' +
    '<form class="mbody" data-form="resetUserPwd" data-id="' + u.id + '">' +
      '<p class="muted small" style="margin-bottom:14px">Nastavíš nové dočasné heslo pro ' +
        '<b>' + esc(u.name) + '</b>. Při dalším přihlášení si ho bude muset změnit.</p>' +
      '<div class="fld"><label>Dočasné heslo</label>' +
        '<input name="tempPassword" required minlength="8" value="vanoce2026"></div>' +
      '<div class="err small hidden" data-err></div>' +
      '<div class="btnrow stretch">' +
        '<button class="btn ghost" type="button" data-act="closeModal">Zrušit</button>' +
        '<button class="btn" type="submit">Nastavit heslo</button></div>' +
    '</form>';
}

/* ---------- potvrzovací dialog ---------- */
function confirmDialog(title, text, okLabel, danger) {
  return '' +
    '<div class="mhead"><h2>' + esc(title) + '</h2>' +
      '<button class="xbtn" data-act="closeModal">✕</button></div>' +
    '<div class="mbody"><p class="muted">' + esc(text) + '</p></div>' +
    '<div class="mfoot">' +
      '<button class="btn ghost" data-act="closeModal">Zrušit</button>' +
      '<button class="btn' + (danger ? ' danger' : '') + '" data-act="confirmOk">' +
        esc(okLabel) + '</button>' +
    '</div>';
}

window.V = {
  esc: esc, czk: czk, stars: stars, avatar: avatar, avatarInner: avatarInner, isImg: isImg,
  shell: shell, loginView: loginView, forgotView: forgotView,
  mustChangeView: mustChangeView, homeView: homeView, myGiftsView: myGiftsView,
  familyView: familyView, memberView: memberView, profileView: profileView,
  adminView: adminView, giftForm: giftForm, userForm: userForm, resetPwdForm: resetPwdForm,
  confirmDialog: confirmDialog, giftCard: giftCard,
  reservedView: reservedView, giftDetail: giftDetail
};
})();
