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
function openModal(html) {
  modalRoot.innerHTML = '<div class="modal-back" data-act="backdrop"><div class="modal">' +
    html + '</div></div>';
  document.body.style.overflow = 'hidden';
}
function closeModal() {
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
    fr.onload = () => shrink(fr.result, 900, onDone);
    fr.readAsDataURL(f);
  };
  inp.click();
}
function shrink(dataUrl, maxSide, onDone) {
  const img = new Image();
  img.onload = () => {
    const sc = Math.min(1, maxSide / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * sc);
    c.height = Math.round(img.height * sc);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    onDone(c.toDataURL('image/jpeg', 0.82));
  };
  img.onerror = () => toast('Obrázek se nepodařilo načíst.', 'bad');
  img.src = dataUrl;
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
      const [gifts, res, members] = await Promise.all([
        Api.myGifts(), Api.myReservations(), Api.familyMembers()
      ]);
      body = V.homeView(u, gifts.length, res.length, members);
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
    } else if (state.view === 'reserved') {
      body = V.reservedView(await Api.myReservations());
    } else if (state.view === 'member') {
      const d = await Api.memberGifts(state.memberId);
      body = V.memberView(d.member, d.gifts);
    } else if (state.view === 'profile') {
      body = V.profileView(u);
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

async function refreshUser() {
  // Když se zjištění uživatele nepovede (výpadek, vypršelá session),
  // ukážeme přihlášení místo prázdné stránky.
  try { state.user = await Api.me(); }
  catch (e) { state.user = null; }
}

async function enterApp() {
  await refreshUser();
  if (!state.user) { state.screen = 'login'; }
  else if (state.user.mustChangePassword) { state.screen = 'mustChange'; }
  else { state.screen = 'app'; }
  await render();
}

/* Dárek si vždy vyzvedneme z téhož endpointu, ze kterého se vykreslil
   aktuální pohled — jen tak dostaneme DTO se správně omezenými údaji
   (u vlastních dárků tedy bez jakékoli zmínky o rezervaci). */
function giftMode() {
  if (state.view === 'admin') return 'admin';
  if (state.view === 'mine') return state.wardId ? 'ward' : 'mine';
  return 'other';                      // member, reserved
}
async function giftList() {
  if (state.view === 'admin') return Api.adminGifts();
  if (state.view === 'mine') {
    return state.wardId
      ? (await Api.wardGifts(state.wardId)).gifts
      : Api.myGifts();
  }
  if (state.view === 'reserved') return Api.myReservations();
  if (state.view === 'member') return (await Api.memberGifts(state.memberId)).gifts;
  return [];
}
async function findGift(id) {
  return (await giftList()).find(x => x.id === Number(id)) || null;
}

/* ---------- akce (delegace) ---------- */
const actions = {

  /* navigace */
  nav: el => {
    // Z menu se vždy jde na vlastní seznam, ne na naposledy vybrané dítě.
    if (el.dataset.view === 'mine') state.wardId = null;
    state.view = el.dataset.view;
    render();
  },
  openMember: el => { state.memberId = Number(el.dataset.id); state.view = 'member'; render(); },
  pickList: el => { state.wardId = el.dataset.id ? Number(el.dataset.id) : null; render(); },
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
  adminTab: el => { state.adminTab = el.dataset.tab; render(); },
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
          closeModal();
          await render();
          // Vlastník dostane neutrální hlášku — nesmí z ní poznat,
          // jestli byl dárek rezervovaný a jestli odešel e-mail.
          toast('Dárek byl smazán.', 'ok');
        } catch (e) { closeModal(); toast(e.message, 'bad'); }
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
    pickImageFile(data => {
      form.elements.image.value = data;
      form.querySelector('[data-imgprev]').innerHTML = '<img src="' + V.esc(data) + '" alt="">';
    });
  },
  clearImage: el => {
    const form = el.closest('form');
    form.elements.image.value = '';
    form.querySelector('[data-imgprev]').innerHTML = '🎁';
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

  /* rezervace */
  reserve: el => {
    const id = Number(el.dataset.id);
    confirmAsk('Rezervovat dárek', 'Opravdu chcete tento dárek rezervovat?', 'Rezervovat', false,
      async () => {
        try {
          await Api.reserve(id);
          closeModal(); await render();
          toast('Dárek je rezervovaný pro tebe. 🎁', 'ok');
        } catch (e) { closeModal(); toast(e.message, 'bad'); await render(); }
      });
  },
  cancelReserve: el => {
    const id = Number(el.dataset.id);
    confirmAsk('Zrušit rezervaci', 'Dárek se znovu zobrazí ostatním jako volný.',
      'Zrušit rezervaci', true, async () => {
        try {
          await Api.cancelReservation(id);
          closeModal(); await render();
          toast('Rezervace byla zrušena.', 'ok');
        } catch (e) { closeModal(); toast(e.message, 'bad'); }
      });
  },
  adminCancelReserve: el => {
    const id = Number(el.dataset.id);
    confirmAsk('Zrušit rezervaci', 'Rezervace tohoto dárku bude zrušena.',
      'Zrušit rezervaci', true, async () => {
        try {
          await Api.adminCancelReservation(id);
          closeModal(); await render();
          toast('Rezervace byla zrušena.', 'ok');
        } catch (e) { closeModal(); toast(e.message, 'bad'); }
      });
  },

  /* profil / avatar */
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
          closeModal(); await render();
          toast('Účet byl smazán.', 'ok');
        } catch (e) { closeModal(); toast(e.message, 'bad'); }
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
  ev.preventDefault();
  fn(el, ev);
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
      closeModal(); await render();
      // Neutrální hláška: vlastník se nesmí dozvědět, že šel e-mail rezervujícímu.
      toast('Dárek byl upraven.', 'ok');
    } else {
      // Na stránce Moje přání může být vybraný seznam dítěte.
      if (state.view === 'mine' && state.wardId) {
        await Api.createWardGift(state.wardId, payload);
      } else {
        await Api.createGift(payload);
      }
      closeModal();
      if (state.view !== 'mine' && state.view !== 'admin') state.view = 'mine';
      await render();
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
        : 'Účet byl vytvořen. Předej uživateli dočasné heslo.', 'ok');
    }
    closeModal();
    await refreshUser();
    await render();
  },

  resetUserPwd: async f => {
    const d = fields(f);
    await Api.adminResetPassword(Number(f.dataset.id), d.tempPassword);
    closeModal(); await render();
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
