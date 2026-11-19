/* =====================================================================
   KLIENT — stav, router, obsluha akcí.
   Veškerá data si bere z window.Api (async), takže záměna simulovaného
   serveru za /api/*.php se odehraje výhradně v server.js.
   ===================================================================== */
(function () {
'use strict';

const V = window.V, Api = window.Api;
const app = document.getElementById('app');
const modalRoot = document.getElementById('modalRoot');
const toastRoot = document.getElementById('toastRoot');

const state = {
  screen: 'login',      // login | forgot | forgotSent | reset | mustChange | app
  // Po přihlášení se jde rovnou na Moje přání; Přehled zůstává v menu.
  view: 'mine',         // home | mine | family | member | reserved | profile | admin
  user: null,
  memberId: null,
  wardId: null,          // vybraný seznam dítěte na stránce Moje přání
  adminTab: 'users',
  pendingConfirm: null
};

/* ---------- drobnosti ---------- */
function toast(msg, kind) {
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.textContent = msg;
  toastRoot.appendChild(el);
  setTimeout(() => el.remove(), 3600);
}
function showError(scope, err) {
  const msg = (err && err.message) ? err.message : 'Něco se nepovedlo.';
  const box = scope && scope.querySelector('[data-err]');
  if (box) { box.textContent = msg; box.classList.remove('hidden'); }
  else toast(msg, 'bad');
}
function fields(form) {
  const o = {};
  Array.prototype.forEach.call(form.elements, el => {
    if (!el.name) return;
    // U checkboxu je .value vždy "on" — rozhoduje .checked.
    o[el.name] = (el.type === 'checkbox') ? el.checked : el.value;
  });
  return o;
}
/* Dialogy se vrství. Dřív každý další přepsal ten předchozí, takže když
   se nad formulářem dárku otevřel výřez obrázku, formulář i s rozepsanými
   údaji zmizel. Spodní dialog se teď jen schová a po zavření vrchního se
   vrátí i s tím, co v něm bylo napsané. */
function openModal(html) {
  const prev = modalRoot.lastElementChild;
  if (prev) prev.style.display = 'none';

  const back = document.createElement('div');
  back.className = 'modal-back';
  back.dataset.act = 'backdrop';
  back.innerHTML = '<div class="modal">' + html + '</div>';
  modalRoot.appendChild(back);
  document.body.style.overflow = 'hidden';
}

/** Zavře vrchní dialog a odkryje ten pod ním. */
function closeModal() {
  const top = modalRoot.lastElementChild;
  if (top) top.remove();
  const prev = modalRoot.lastElementChild;
  if (prev) prev.style.display = '';
  else document.body.style.overflow = '';
  state.pendingConfirm = null;
}

/** Zavře všechny dialogy – používá se, když je akce dotažená do konce. */
function closeAll() {
  modalRoot.innerHTML = '';
  document.body.style.overflow = '';
  state.pendingConfirm = null;
}
function confirmAsk(title, text, okLabel, danger, cb) {
  state.pendingConfirm = cb;
  openModal(V.confirmDialog(title, text, okLabel, danger));
}

/* ---------- obrázky: nahrání + zmenšení ---------- */
function pickImageFile(onDone) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*';
  inp.onchange = () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    if (f.size > 12 * 1024 * 1024) { toast('Obrázek je moc velký (max 12 MB).', 'bad'); return; }
    const fr = new FileReader();
    fr.onload = () => openCrop(fr.result, onDone);
    fr.readAsDataURL(f);
  };
  inp.click();
}
/* ---------- výřez do čtverce ----------
   Karty mají obrázky čtvercové, takže u fotky je potřeba říct, co z ní
   má zůstat. Výsledek je vždycky 800×800 JPEG. */
const CROP_OUT = 800;
let crop = null;   // { img, stage, zoom, x, y, base, onDone }

function openCrop(src, onDone) {
  const img = new Image();
  img.onload = () => {
    openModal(V.cropDialog());
    const stageEl = document.querySelector('[data-cropstage]');
    const size = stageEl.clientWidth;

    crop = { img: img, stage: size, zoom: 1, x: 0, y: 0, onDone: onDone,
             base: Math.max(size / img.naturalWidth, size / img.naturalHeight) };
    centerCrop();
    drawCrop();
    bindCropDrag(stageEl);
  };
  img.onerror = () => toast('Obrázek se nepodařilo načíst.', 'bad');
  img.src = src;
}

function cropScale() { return crop.base * crop.zoom; }

function centerCrop() {
  const s = cropScale();
  crop.x = (crop.stage - crop.img.naturalWidth * s) / 2;
  crop.y = (crop.stage - crop.img.naturalHeight * s) / 2;
}

/* Obrázek musí čtverec vždy celý pokrýt – nesmí vzniknout prázdný okraj. */
function clampCrop() {
  const s = cropScale();
  const w = crop.img.naturalWidth * s;
  const h = crop.img.naturalHeight * s;
  crop.x = Math.min(0, Math.max(crop.stage - w, crop.x));
  crop.y = Math.min(0, Math.max(crop.stage - h, crop.y));
}

function drawCrop() {
  clampCrop();
  const s = cropScale();
  const el = document.querySelector('[data-cropimg]');
  if (!el) return;
  el.style.backgroundImage = 'url("' + crop.img.src.replace(/"/g, '\\"') + '")';
  el.style.backgroundSize = (crop.img.naturalWidth * s) + 'px ' +
                            (crop.img.naturalHeight * s) + 'px';
  el.style.backgroundPosition = crop.x + 'px ' + crop.y + 'px';
}

function bindCropDrag(stageEl) {
  let last = null;
  stageEl.addEventListener('pointerdown', ev => {
    last = { x: ev.clientX, y: ev.clientY };
    stageEl.classList.add('dragging');
    stageEl.setPointerCapture(ev.pointerId);
  });
  stageEl.addEventListener('pointermove', ev => {
    if (!last || !crop) return;
    crop.x += ev.clientX - last.x;
    crop.y += ev.clientY - last.y;
    last = { x: ev.clientX, y: ev.clientY };
    drawCrop();
  });
  const end = () => { last = null; stageEl.classList.remove('dragging'); };
  stageEl.addEventListener('pointerup', end);
  stageEl.addEventListener('pointercancel', end);
}

/** Zoomuje kolem středu čtverce, ať se obraz „neutrhne" ke kraji. */
function setCropZoom(pct) {
  const z = Math.min(3, Math.max(1, pct / 100));
  const before = cropScale();
  const cx = (crop.stage / 2 - crop.x) / before;
  const cy = (crop.stage / 2 - crop.y) / before;
  crop.zoom = z;
  const after = cropScale();
  crop.x = crop.stage / 2 - cx * after;
  crop.y = crop.stage / 2 - cy * after;
  drawCrop();
  const slider = document.querySelector('[data-cropzoom]');
  if (slider) slider.value = Math.round(z * 100);
}

function finishCrop() {
  const s = cropScale();
  const c = document.createElement('canvas');
  c.width = c.height = CROP_OUT;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, CROP_OUT, CROP_OUT);
  // Výsek z původního obrázku, který právě vyplňuje čtverec na obrazovce.
  ctx.drawImage(crop.img,
    -crop.x / s, -crop.y / s, crop.stage / s, crop.stage / s,
    0, 0, CROP_OUT, CROP_OUT);

  let data;
  try {
    data = c.toDataURL('image/jpeg', 0.85);
  } catch (e) {
    toast('Tenhle obrázek nejde upravit, zkus ho nahrát ze souboru.', 'bad');
    return;
  }
  const done = crop.onDone;
  crop = null;
  closeModal();
  done(data);
}

/* ---------- render ---------- */
async function render() {
  if (state.screen === 'login') {
    app.innerHTML = V.loginView();
    return;
  }
  if (state.screen === 'forgot')     { app.innerHTML = V.forgotView(false); return; }
  if (state.screen === 'forgotSent') { app.innerHTML = V.forgotView(true); return; }
  if (state.screen === 'mustChange') {
    app.innerHTML = V.mustChangeView(state.user);
    return;
  }

  const u = state.user;
  let body = '';
  try {
    if (state.view === 'home') {
      const [gifts, shop, tree] = await Promise.all([
        Api.myGifts(), Api.shoppingList(), Api.familyTree(true)
      ]);
      // Na dlaždici ukazujeme, kolik zbývá koupit – to je ta akční informace.
      const todo = shop.reduce((s, g) => s + g.items.filter(i => !i.bought).length, 0);
      body = V.homeView(u, gifts.length, todo, tree);
    } else if (state.view === 'mine') {
      const wards = await Api.myWards();
      // Kdyby vybrané dítě zmizelo (admin ho smazal), spadneme na vlastní seznam.
      if (state.wardId && !wards.some(w => w.id === state.wardId)) state.wardId = null;
      if (state.wardId) {
        const d = await Api.wardGifts(state.wardId);
        body = V.myGiftsView(d.gifts, wards, d.child);
      } else {
        body = V.myGiftsView(await Api.myGifts(), wards, null);
      }
    } else if (state.view === 'family') {
      body = V.familyView(await Api.familyTree());
    } else if (state.view === 'shopping') {
      body = V.shoppingView(await Api.shoppingList());
    } else if (state.view === 'member') {
      const d = await Api.memberGifts(state.memberId);
      body = V.memberView(d.member, d.gifts);
    } else if (state.view === 'profile') {
      // Velikosti vyplňuje každý sobě; poručník navíc svým dětem.
      const wards = await Api.myWards();
      const people = [{ id: u.id, own: true }].concat(
        wards.map(w => ({ id: w.id, own: false })));
      const sizes = await Promise.all(people.map(async p => {
        const d = await Api.sizes(p.id);
        return Object.assign(d, { own: p.own });
      }));
      body = V.profileView(u, sizes);
    } else if (state.view === 'admin') {
      const [users, gifts] = await Promise.all([
        Api.adminUsers(),
        state.adminTab === 'gifts' ? Api.adminGifts() : Promise.resolve([])
      ]);
      body = V.adminView(state.adminTab, users, gifts, u.id);
    }
  } catch (e) {
    body = '<div class="empty"><span class="ic">⚠️</span><div class="small">' +
      V.esc(e.message || 'Chyba') + '</div></div>';
  }
  app.innerHTML = V.shell(u, state.view, body);
  window.scrollTo(0, 0);
}

/* ---------- adresy stránek ----------
   Každý pohled má svou adresu, aby fungovalo tlačítko zpět v prohlížeči
   a daly se stránky uložit do záložek. Používáme hash (#/rodina/5), ne
   cestu – nepotřebuje to žádná přepisovací pravidla ve WordPressu, takže
   se nemá co rozbít při aktualizaci nebo změně nastavení trvalých odkazů. */
const ROUTES = {
  home:     'prehled',
  mine:     'moje-prani',
  family:   'rodina',
  member:   'rodina',          // + /id
  shopping: 'nakupy',
  profile:  'profil',
  admin:    'administrace'
};

function stateToHash() {
  if (state.view === 'member' && state.memberId) return '#/rodina/' + state.memberId;
  if (state.view === 'mine' && state.wardId)     return '#/moje-prani/' + state.wardId;
  if (state.view === 'admin' && state.adminTab === 'gifts') return '#/administrace/darky';
  return '#/' + (ROUTES[state.view] || 'moje-prani');
}

/** Přepíše stav podle adresy. Vrací false, když adresa nedává smysl. */
function applyHash() {
  const raw = (location.hash || '').replace(/^#\/?/, '');
  const [first, second] = raw.split('/');

  const byPath = Object.keys(ROUTES).filter(k => k !== 'member');
  const view = byPath.find(k => ROUTES[k] === first);

  if (first === 'rodina' && second) {
    state.view = 'member';
    state.memberId = Number(second) || null;
    return !!state.memberId;
  }
  if (!view) return false;

  state.view = view;
  state.wardId = (view === 'mine' && second) ? (Number(second) || null) : null;
  if (view === 'admin') state.adminTab = (second === 'darky') ? 'gifts' : 'users';
  return true;
}

/** Přejde na jiný pohled přes adresu – render spustí až událost hashchange. */
function go(view, opts) {
  opts = opts || {};
  state.view = view;
  if ('memberId' in opts) state.memberId = opts.memberId;
  if ('wardId' in opts)   state.wardId = opts.wardId;
  if ('adminTab' in opts) state.adminTab = opts.adminTab;

  const next = stateToHash();
  if (location.hash === next) { render(); return; }   // stejná adresa → jen překreslit
  location.hash = next;
}

window.addEventListener('hashchange', () => {
  if (state.screen !== 'app') return;
  closeAll();                 // modál v adrese není, zpět ho musí zavřít
  if (!applyHash()) { go('mine'); return; }
  render();
});

async function refreshUser() {
  // Když se zjištění uživatele nepovede (výpadek, vypršelá session),
  // ukážeme přihlášení místo prázdné stránky.
  try { state.user = await Api.me(); }
  catch (e) { state.user = null; }
}

async function enterApp() {
  await refreshUser();
  if (!state.user) {
    state.screen = 'login';
  } else if (state.user.mustChangePassword) {
    state.screen = 'mustChange';
  } else {
    state.screen = 'app';
    // Příchod na konkrétní adresu (záložka, tlačítko zpět) ji respektuje;
    // jinak začínáme na Mých přáních. replaceState, ať v historii
    // nevznikne krok navíc hned po načtení.
    if (!applyHash()) {
      state.view = 'mine';
      history.replaceState(null, '',
        location.pathname + location.search + '#/moje-prani');
    }
  }
  await render();
}

/* Dárek si vždy vyzvedneme z téhož endpointu, ze kterého se vykreslil
   aktuální pohled — jen tak dostaneme DTO se správně omezenými údaji
   (u vlastních dárků tedy bez jakékoli zmínky o rezervaci). */
function giftMode() {
  if (state.view === 'admin') return 'admin';
  if (state.view === 'mine') return state.wardId ? 'ward' : 'mine';
  return 'other';                      // member
}
async function giftList() {
  if (state.view === 'admin') return Api.adminGifts();
  if (state.view === 'mine') {
    return state.wardId
      ? (await Api.wardGifts(state.wardId)).gifts
      : Api.myGifts();
  }

  if (state.view === 'member') return (await Api.memberGifts(state.memberId)).gifts;
  return [];
}
async function findGift(id) {
  return (await giftList()).find(x => x.id === Number(id)) || null;
}

function setGiftImage(form, data) {
  form.elements.image.value = data;
  form.querySelector('[data-imgprev]').innerHTML = '<img src="' + V.esc(data) + '" alt="">';
  const btn = form.querySelector('[data-act="recrop"]');
  if (btn) btn.disabled = false;
}

/* Lidé, pro které jde zapsat vlastní položku: celá rodina včetně dětí. */
async function shoppingPeople() {
  const groups = await Api.shoppingList();
  return groups.filter(g => g.personId).map(g => ({ id: g.personId, name: g.name }));
}

/**
 * Přidá řádek do tabulky velikostí. Když už položka se stejným názvem
 * existuje, nezakládá druhou — jen skočí do její hodnoty.
 */
function addSizeRow(form, label) {
  const box = form.querySelector('[data-sizerows]');

  if (label) {
    const same = Array.from(box.querySelectorAll('[data-sizerow]')).find(r =>
      r.querySelector('.slabel').value.trim().toLowerCase() === label.toLowerCase());
    if (same) { same.querySelector('.svalue').focus(); return; }
  }

  box.insertAdjacentHTML('beforeend', V.sizeRow({ label: label || '', value: '' }));
  const row = box.lastElementChild;
  row.querySelector(label ? '.svalue' : '.slabel').focus();
}

async function personName(id) {
  const groups = await Api.shoppingList();
  const g = groups.find(x => x.personId === id);
  return g ? g.name : '';
}

/* Přepočítá počítadla u lidí i v hlavičce, aniž by se překreslila stránka.
   Nekoupená položka má třídu 'todo'. */
function updateShoppingCounts() {
  const all = Array.from(document.querySelectorAll('.buy'));
  if (!all.length) return;

  document.querySelectorAll('.buygroup').forEach(group => {
    const rows  = Array.from(group.querySelectorAll('.buy'));
    const label = group.querySelector('.bhc');
    if (!label) return;
    const done = rows.filter(r => !r.classList.contains('todo')).length;
    label.textContent = rows.length ? done + ' / ' + rows.length + ' koupeno' : 'zatím nic';
  });

  const todo = all.filter(r => r.classList.contains('todo')).length;
  const sub  = document.querySelector('main .pagehead .sub');
  if (sub) {
    sub.textContent = todo
      ? 'Zbývá koupit ' + todo + ' z ' + all.length + '. Tenhle seznam vidíš jenom ty.'
      : 'Všechno koupeno 🎉 Tenhle seznam vidíš jenom ty.';
  }
}

/* ---------- akce (delegace) ---------- */
const actions = {

  /* navigace */
  nav: el => {
    // Z menu se vždy jde na vlastní seznam, ne na naposledy vybrané dítě.
    go(el.dataset.view, { wardId: null });
  },
  openMember: el => go('member', { memberId: Number(el.dataset.id) }),
  pickList: el => go('mine', { wardId: el.dataset.id ? Number(el.dataset.id) : null }),
  switchKind: el => {
    const f = el.closest('form');
    ['account', 'child'].forEach(k => {
      const box = f.querySelector('[data-kindblock="' + k + '"]');
      const on = (k === el.value);
      box.classList.toggle('hidden', !on);
      // Skryté povinné pole by jinak zablokovalo odeslání formuláře.
      box.querySelectorAll('input,select').forEach(i => { i.disabled = !on; });
    });
  },
  adminTab: el => go('admin', { adminTab: el.dataset.tab }),
  goForgot: () => { state.screen = 'forgot'; render(); },
  goLogin: () => { state.screen = 'login'; render(); },
  closeModal: closeModal,
  backdrop: (el, ev) => { if (ev.target === el) closeModal(); },

  /* Po odhlášení načteme stránku znovu — potřebujeme čerstvý
     bezpečnostní token (nonce) pro další volání API. */
  logout: async () => {
    await Api.logout();
    location.reload();
  },

  /* dárky */
  newGift: () => openModal(V.giftForm(null)),
  openGift: async el => {
    const g = await findGift(el.dataset.id);
    if (!g) { toast('Dárek nebyl nalezen.', 'bad'); return; }
    openModal(V.giftDetail(g, giftMode()));
  },
  editGift: async el => {
    const g = await findGift(el.dataset.id);
    if (!g) { toast('Dárek nebyl nalezen.', 'bad'); return; }
    openModal(V.giftForm(g));
  },
  deleteGift: el => {
    const id = Number(el.dataset.id);
    confirmAsk('Smazat dárek', 'Opravdu chcete tento dárek smazat?', 'Smazat', true,
      async () => {
        try {
          await Api.deleteGift(id);
          closeAll();
          await render();
          // Vlastník dostane neutrální hlášku — nesmí z ní poznat,
          // jestli byl dárek rezervovaný a jestli odešel e-mail.
          toast('Dárek byl smazán.', 'ok');
        } catch (e) { closeAll(); toast(e.message, 'bad'); }
      });
  },
  setPrio: el => {
    const form = el.closest('form');
    form.elements.priority.value = el.dataset.p;
    form.querySelectorAll('.prio button').forEach(b =>
      b.classList.toggle('on', b === el));
  },
  pickImage: el => {
    const form = el.closest('form');
    pickImageFile(data => setGiftImage(form, data));
  },
  /* Znovu nastavit výřez u obrázku, který už je vybraný. */
  recrop: el => {
    const form = el.closest('form');
    const src = form.elements.image.value;
    if (!src) { toast('Nejdřív vyber obrázek.', 'bad'); return; }
    openCrop(src, data => setGiftImage(form, data));
  },
  clearImage: el => {
    const form = el.closest('form');
    form.elements.image.value = '';
    form.querySelector('[data-imgprev]').innerHTML = '🎁';
    const btn = form.querySelector('[data-act="recrop"]');
    if (btn) btn.disabled = true;
  },

  /* výřez */
  cancelCrop: () => { crop = null; closeModal(); },
  applyCrop: () => { if (crop) finishCrop(); },
  cropZoom: el => {
    if (!crop) return;
    setCropZoom(Math.round(crop.zoom * 100) + Number(el.dataset.d));
  },
  fetchPreview: async el => {
    const form = el.closest('form');
    const hint = form.querySelector('[data-previewhint]');
    const url = form.elements.url.value.trim();
    if (!url) { hint.textContent = 'Nejdřív vyplň odkaz.'; return; }
    hint.textContent = 'Načítám…';
    try {
      const r = await Api.fetchLinkPreview(url);
      const got = [];
      // Prázdná pole nepřepisujeme — co už je vyplněné, má přednost.
      if (r.title && !form.elements.name.value.trim()) {
        form.elements.name.value = r.title;
        got.push('název');
      }
      if (r.price != null && r.price !== '' && !form.elements.price.value.trim()) {
        form.elements.price.value = r.price;
        got.push('cenu');
      }
      if (r.image) {
        form.elements.image.value = r.image;
        form.querySelector('[data-imgprev]').innerHTML =
          '<img src="' + V.esc(r.image) + '" alt="">';
        got.push('obrázek');
      }
      hint.textContent = got.length
        ? 'Načteno z odkazu: ' + got.join(', ') + '.'
        : (r.note || 'Z odkazu se nepodařilo nic načíst.');
    } catch (e) { hint.textContent = e.message; }
  },

  /* nákupy */
  toggleBought: async el => {
    // Zaškrtnutí nepřekresluje stránku – jen potvrdí uložení. Jinak by
    // seznam při odškrtávání poskakoval pod rukama.
    const row = el.closest('.buy');
    const on  = el.checked;
    // 'todo' = ještě nekoupeno (zašedlé). Koupené třídu nemá.
    row.classList.toggle('todo', !on);
    try {
      await Api.setBought(el.dataset.kind, Number(el.dataset.id), on);
      updateShoppingCounts();
    } catch (e) {
      el.checked = !on;
      row.classList.toggle('todo', on);
      toast(e.message, 'bad');
    }
  },
  newPurchase: async el => {
    // Pod konkrétním člověkem je příjemce daný, z velkého tlačítka se vybírá.
    const forId   = el && el.dataset.for ? Number(el.dataset.for) : 0;
    const forName = el && el.dataset.forname ? el.dataset.forname : '';
    const fixed = (forId || forName)
      ? { personId: forId || null, name: forName || await personName(forId) }
      : null;
    openModal(V.purchaseForm(null, fixed ? [] : await shoppingPeople(), fixed));
  },

  /* velikosti */
  editSizes: async el => {
    openModal(V.sizesForm(await Api.sizes(Number(el.dataset.id))));
  },
  addSizeRow: el => addSizeRow(el.closest('form'), ''),
  addSizePreset: el => addSizeRow(el.closest('form'), el.dataset.label),
  removeSizeRow: el => { el.closest('[data-sizerow]').remove(); },
  editPurchase: async el => {
    const id = Number(el.dataset.id);
    const groups = await Api.shoppingList();
    let found = null;
    groups.forEach(g => g.items.forEach(i => {
      if (i.kind === 'purchase' && i.id === id) found = i;
    }));
    if (!found) { toast('Položka nebyla nalezena.', 'bad'); return; }
    openModal(V.purchaseForm(found, await shoppingPeople()));
  },
  deletePurchase: el => {
    const id = Number(el.dataset.id);
    confirmAsk('Smazat položku', 'Opravdu chceš tuhle položku ze seznamu smazat?',
      'Smazat', true, async () => {
        try {
          await Api.deletePurchase(id);
          closeAll(); await render();
          toast('Položka byla smazána.', 'ok');
        } catch (e) { closeAll(); toast(e.message, 'bad'); }
      });
  },

  /* rezervace */
  reserve: el => {
    const id = Number(el.dataset.id);
    confirmAsk('Rezervovat dárek', 'Opravdu chcete tento dárek rezervovat?', 'Rezervovat', false,
      async () => {
        try {
          await Api.reserve(id);
          closeAll(); await render();
          toast('Dárek je rezervovaný pro tebe. 🎁', 'ok');
        } catch (e) { closeAll(); toast(e.message, 'bad'); await render(); }
      });
  },
  cancelReserve: el => {
    const id = Number(el.dataset.id);
    confirmAsk('Zrušit rezervaci', 'Dárek se znovu zobrazí ostatním jako volný.',
      'Zrušit rezervaci', true, async () => {
        try {
          await Api.cancelReservation(id);
          closeAll(); await render();
          toast('Rezervace byla zrušena.', 'ok');
        } catch (e) { closeAll(); toast(e.message, 'bad'); }
      });
  },
  adminCancelReserve: el => {
    const id = Number(el.dataset.id);
    confirmAsk('Zrušit rezervaci', 'Rezervace tohoto dárku bude zrušena.',
      'Zrušit rezervaci', true, async () => {
        try {
          await Api.adminCancelReservation(id);
          closeAll(); await render();
          toast('Rezervace byla zrušena.', 'ok');
        } catch (e) { closeAll(); toast(e.message, 'bad'); }
      });
  },

  /* profil / avatar */
  toggleEmoji: el => {
    const pop = el.closest('form').querySelector('[data-emojipop]');
    const open = pop.classList.toggle('hidden');
    if (!open) {
      const s = pop.querySelector('[data-emojisearch]');
      s.value = '';
      filterEmoji(pop, '');
      s.focus();
    }
  },
  pickEmoji: el => {
    const form = el.closest('form');
    const emoji = el.dataset.emoji;
    form.querySelector('[data-avemoji]').value = emoji;
    delete form.dataset.avatarImage;          // emoji přebije dřív nahraný obrázek
    form.querySelector('[data-avprev]').innerHTML = V.esc(emoji);
    form.querySelector('[data-emojipop]').classList.add('hidden');
  },
  pickAvatar: el => {
    const wrap = el.closest('form');
    pickImageFile(data => {
      wrap.dataset.avatarImage = data;
      wrap.querySelector('[data-avemoji]').value = '';
      wrap.querySelector('[data-avprev]').innerHTML = '<img src="' + V.esc(data) + '" alt="">';
    });
  },

  /* administrace — uživatelé */
  newUser: async () => {
    const [groups, guardians] = await Promise.all([Api.familyGroups(), Api.adminGuardians()]);
    openModal(V.userForm(null, groups, guardians));
  },
  editUser: async el => {
    const [users, groups, guardians] = await Promise.all([
      Api.adminUsers(), Api.familyGroups(), Api.adminGuardians()
    ]);
    const u = users.find(x => x.id === Number(el.dataset.id));
    if (u) openModal(V.userForm(u, groups, guardians));
  },
  resetUserPwd: async el => {
    const u = (await Api.adminUsers()).find(x => x.id === Number(el.dataset.id));
    if (u) openModal(V.resetPwdForm(u));
  },
  deleteUser: async el => {
    const u = (await Api.adminUsers()).find(x => x.id === Number(el.dataset.id));
    if (!u) return;
    confirmAsk('Smazat uživatele',
      'Opravdu chceš smazat účet „' + u.name + '“? Smažou se i všechna jeho přání.',
      'Smazat', true, async () => {
        try {
          await Api.adminDeleteUser(u.id);
          closeAll(); await render();
          toast('Účet byl smazán.', 'ok');
        } catch (e) { closeAll(); toast(e.message, 'bad'); }
      });
  },

  confirmOk: () => { const cb = state.pendingConfirm; if (cb) cb(); }
};

document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  // Pozadí modálu je samo nositelem data-act. Klik na cokoli *uvnitř* modálu
  // proto nesmí spadnout sem — jinak by preventDefault() spolkl i odeslání
  // formuláře (tlačítko type=submit nemá vlastní data-act).
  if (act === 'backdrop' && ev.target !== el) return;
  const fn = actions[act];
  if (!fn) return;
  if (el.tagName === 'A') return;
  // U zaškrtávátka by preventDefault() zrušil samotné zaškrtnutí – uložilo
  // by se správně, ale políčko by se vizuálně vrátilo zpátky.
  if (el.tagName !== 'INPUT' && el.tagName !== 'SELECT' && el.tagName !== 'TEXTAREA') {
    ev.preventDefault();
  }
  fn(el, ev);
});

/* Filtrování emoji podle českého názvu; diakritiku ignorujeme. */
function filterEmoji(pop, query) {
  const q = query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  let total = 0;
  pop.querySelectorAll('[data-emojigroup]').forEach(group => {
    let shown = 0;
    group.querySelectorAll('.emojibtn').forEach(b => {
      const hit = !q || b.dataset.k.indexOf(q) >= 0;
      b.classList.toggle('hidden', !hit);
      if (hit) shown++;
    });
    group.classList.toggle('hidden', shown === 0);
    total += shown;
  });
  pop.querySelector('[data-emojinone]').classList.toggle('hidden', total > 0);
}

document.addEventListener('input', ev => {
  const s = ev.target.closest && ev.target.closest('[data-emojisearch]');
  if (s) { filterEmoji(s.closest('[data-emojipop]'), s.value); return; }
  const z = ev.target.closest && ev.target.closest('[data-cropzoom]');
  if (z && crop) setCropZoom(Number(z.value));
});

/* Obrázek vložený ze schránky (Ctrl+V) — záchrana u e-shopů, které
   serverové načtení blokují. Stačí obrázek na stránce zkopírovat. */
document.addEventListener('paste', ev => {
  const form = document.querySelector('[data-form="gift"]');
  if (!form) return;
  const items = (ev.clipboardData && ev.clipboardData.items) || [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].type && items[i].type.indexOf('image/') === 0) {
      const file = items[i].getAsFile();
      if (!file) continue;
      ev.preventDefault();
      const fr = new FileReader();
      fr.onload = () => openCrop(fr.result, data => {
        form.elements.image.value = data;
        form.querySelector('[data-imgprev]').innerHTML = '<img src="' + V.esc(data) + '" alt="">';
        const btn = form.querySelector('[data-act="recrop"]');
        if (btn) btn.disabled = false;
        toast('Obrázek vložen ze schránky. 📋', 'ok');
      });
      fr.readAsDataURL(file);
      return;
    }
  }
});

/* Přepínač typu profilu je <select>, ten potřebuje change, ne click. */
document.addEventListener('change', ev => {
  const el = ev.target.closest && ev.target.closest('[data-act="switchKind"]');
  if (el) actions.switchKind(el, ev);
});

document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape' && modalRoot.innerHTML) { closeModal(); return; }
  // Karta dárku není <button>, takže klávesovou obsluhu doplňujeme sami.
  if (ev.key !== 'Enter' && ev.key !== ' ') return;
  const el = ev.target.closest && ev.target.closest('[data-act][role="button"]');
  if (!el || el.tagName === 'BUTTON') return;
  ev.preventDefault();
  el.click();
});

/* ---------- formuláře ---------- */
const forms = {

  login: async f => {
    const d = fields(f);
    await Api.login(d.email, d.password, d.remember);
    // Nové přihlášení = nový bezpečnostní token, proto načteme stránku znovu.
    location.reload();
  },

  forgot: async f => {
    await Api.requestPasswordReset(fields(f).email);
    state.screen = 'forgotSent';
    await render();
  },

  mustChange: async f => {
    const d = fields(f);
    if (d.p1 !== d.p2) throw new Error('Hesla se neshodují.');
    await Api.changePassword(d.current, d.p1);
    await enterApp();
    toast('Heslo bylo změněno. Vítejte! 🎄', 'ok');
  },

  profile: async f => {
    const d = fields(f);
    const avatar = f.dataset.avatarImage || d.avatar ||
      (V.isImg(state.user.avatar) && !d.avatar && !f.dataset.avatarImage ? state.user.avatar : '');
    await Api.updateProfile({ name: d.name, avatar: avatar });
    delete f.dataset.avatarImage;
    await refreshUser();
    await render();
    toast('Profil byl uložen.', 'ok');
  },

  password: async f => {
    const d = fields(f);
    if (d.p1 !== d.p2) throw new Error('Hesla se neshodují.');
    await Api.changePassword(d.current, d.p1);
    await render();
    toast('Heslo bylo změněno.', 'ok');
  },

  gift: async f => {
    const d = fields(f);
    const payload = {
      name: d.name, url: d.url, priority: d.priority,
      price: d.price, image: d.image, note: d.note
    };
    if (f.dataset.id) {
      await Api.updateGift(Number(f.dataset.id), payload);
      closeAll(); await render();
      // Neutrální hláška: vlastník se nesmí dozvědět, že šel e-mail rezervujícímu.
      toast('Dárek byl upraven.', 'ok');
    } else {
      // Na stránce Moje přání může být vybraný seznam dítěte.
      if (state.view === 'mine' && state.wardId) {
        await Api.createWardGift(state.wardId, payload);
      } else {
        await Api.createGift(payload);
      }
      closeAll();
      if (state.view !== 'mine' && state.view !== 'admin') { go('mine'); }
      else { await render(); }
      toast('Přání bylo přidáno. 🎁', 'ok');
    }
  },

  user: async f => {
    const d = fields(f);
    const avatar = f.dataset.avatarImage != null ? f.dataset.avatarImage : d.avatar;
    const kind = f.dataset.id ? f.dataset.kind : (d.kind || 'account');
    if (f.dataset.id) {
      await Api.adminUpdateUser(Number(f.dataset.id), {
        name: d.name, email: d.email, avatar: avatar,
        role: d.role, familyGroup: d.familyGroup, guardianId: d.guardianId
      });
      toast('Profil byl uložen.', 'ok');
    } else {
      await Api.adminCreateUser({
        name: d.name, email: d.email, avatar: avatar, kind: kind,
        role: d.role, familyGroup: d.familyGroup,
        guardianId: d.guardianId, tempPassword: d.tempPassword
      });
      toast(kind === 'child'
        ? 'Dětský profil byl vytvořen. 🧒'
        : 'Účet vytvořen, poslali jsme na e-mail pozvánku. Heslo předej zvlášť.', 'ok');
    }
    closeAll();
    await refreshUser();
    await render();
  },

  sizes: async f => {
    const rows = Array.from(f.querySelectorAll('[data-sizerow]')).map(r => ({
      label: r.querySelector('.slabel').value,
      value: r.querySelector('.svalue').value
    }));
    const res = await Api.setSizes(Number(f.dataset.id), rows);

    if (f.closest('#modalRoot')) {
      closeAll();
      await render();
    } else {
      // V profilu stránku nepřekreslujeme, jen srovnáme řádky podle
      // serveru (zahodí prázdné) — jinak by to odskočilo nahoru.
      f.querySelector('[data-sizerows]').innerHTML =
        (res.sizes || []).map(V.sizeRow).join('');
    }
    toast('Velikosti byly uloženy. 📏', 'ok');
  },

  purchase: async f => {
    const d = fields(f);
    // Při přidávání pod konkrétním člověkem je příjemce v data atributech.
    const payload = {
      forPersonId: f.dataset.for ? Number(f.dataset.for)
                                 : (d.forPersonId ? Number(d.forPersonId) : 0),
      forName: f.dataset.forname || d.forName || '',
      name: d.name, note: d.note, bought: !!d.bought
    };
    if (f.dataset.id) {
      await Api.updatePurchase(Number(f.dataset.id), payload);
      toast('Položka byla uložena.', 'ok');
    } else {
      await Api.createPurchase(payload);
      toast('Položka byla přidána. 🛒', 'ok');
    }
    closeAll();
    if (state.view !== 'shopping') { go('shopping'); }
    else { await render(); }
  },

  resetUserPwd: async f => {
    const d = fields(f);
    await Api.adminResetPassword(Number(f.dataset.id), d.tempPassword);
    closeAll(); await render();
    toast('Heslo bylo resetováno na dočasné.', 'ok');
  }
};

document.addEventListener('submit', async ev => {
  const f = ev.target.closest('[data-form]');
  if (!f) return;
  ev.preventDefault();
  const fn = forms[f.dataset.form];
  if (!fn) return;
  const btn = f.querySelector('button[type=submit]');
  const box = f.querySelector('[data-err]');
  if (box) box.classList.add('hidden');
  if (btn) btn.disabled = true;
  try { await fn(f); }
  catch (e) { showError(f, e); }
  finally { if (btn && btn.isConnected) btn.disabled = false; }
});

/* ---------- start ---------- */
(async function boot() {
  await enterApp();
})();
})();
