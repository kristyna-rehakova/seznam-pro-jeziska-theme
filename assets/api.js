/* =====================================================================
   SEZNAM PRO JEŽÍŠKA — klientské API
   ---------------------------------------------------------------------
   Přesná náhrada prototypového server.js. Místo dat v prohlížeči volá
   PHP endpoint, ale rozhraní (window.Api) je stejné — proto views.js
   i app.js zůstaly beze změny.

   Žádné rozhodování o tom, co kdo smí vidět, tady není a být nesmí.
   Dělá to server v inc/gifts.php.
   ===================================================================== */
(function () {
'use strict';

function ApiError(message, code) { this.message = message; this.code = code || 400; }
ApiError.prototype = Object.create(Error.prototype);
ApiError.prototype.name = 'ApiError';

/** Jedno volání API. Odpověď je buď data, nebo chyba se srozumitelnou hláškou. */
async function call(action, args) {
  let res;
  try {
    res = await fetch(SPJ.rest + 'call', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-WP-Nonce': SPJ.nonce
      },
      body: JSON.stringify({ action: action, args: args || [] })
    });
  } catch (e) {
    throw new ApiError('Nepodařilo se spojit se serverem. Zkontroluj připojení.', 0);
  }

  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }

  if (!res.ok) {
    const code = data && data.code ? data.code : '';
    // Platnost bezpečnostního tokenu vypršela (otevřená karta přes noc).
    if (code === 'rest_cookie_invalid_nonce' || res.status === 403 && !data) {
      location.reload();
      throw new ApiError('Obnovuji stránku…', 403);
    }
    const msg = (data && data.message) ? data.message : 'Něco se nepovedlo.';
    throw new ApiError(msg, res.status);
  }
  return data;
}

const Api = {
  /* --- autentizace a profil --- */
  me:                   ()                 => call('me'),
  login:                (email, pwd, rem)  => call('login', [email, pwd, rem !== false]),
  logout:               ()                 => call('logout'),
  changePassword:       (cur, next)        => call('changePassword', [cur, next]),
  requestPasswordReset: (email)            => call('requestPasswordReset', [email]),
  updateProfile:        (d)                => call('updateProfile', [d]),

  /* --- moje přání --- */
  myGifts:    ()        => call('myGifts'),
  createGift: (d)       => call('createGift', [d]),
  updateGift: (id, d)   => call('updateGift', [id, d]),
  deleteGift: (id)      => call('deleteGift', [id]),

  /* --- rodina --- */
  familyGroups:  ()     => call('familyGroups'),
  familyMembers: ()     => call('familyMembers'),
  familyTree:    ()     => call('familyTree'),
  memberGifts:   (id)   => call('memberGifts', [id]),

  /* --- rezervace --- */
  reserve:           (id) => call('reserve', [id]),
  cancelReservation: (id) => call('cancelReservation', [id]),
  myReservations:    ()   => call('myReservations'),

  /* --- děti pod správou --- */
  myWards:        ()        => call('myWards'),
  wardGifts:      (id)      => call('wardGifts', [id]),
  createWardGift: (id, d)   => call('createWardGift', [id, d]),

  /* --- administrace --- */
  adminUsers:         ()        => call('adminUsers'),
  adminGuardians:     ()        => call('adminGuardians'),
  adminCreateUser:    (d)       => call('adminCreateUser', [d]),
  adminUpdateUser:    (id, d)   => call('adminUpdateUser', [id, d]),
  adminResetPassword: (id, pwd) => call('adminResetPassword', [id, pwd]),
  adminDeleteUser:    (id)      => call('adminDeleteUser', [id]),
  adminGifts:         ()        => call('adminGifts'),
  adminCancelReservation: (id)  => call('adminCancelReservation', [id]),

  /* --- pomocné --- */
  fetchLinkPreview: (url) => call('fetchLinkPreview', [url])
};

window.Api = Api;
window.ApiError = ApiError;
})();
