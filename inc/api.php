<?php
/**
 * Seznam pro Ježíška – API
 *
 * Jeden endpoint s rozcestníkem akcí. Záměrně: klientské assets/api.js je
 * díky tomu doslovná náhrada prototypového server.js, takže views.js i app.js
 * zůstaly beze změny. A hlavně je kontrola oprávnění na jednom místě,
 * kde se dá přečíst celá najednou.
 *
 *   POST /wp-json/jezisek/v1/call   { "action": "...", "args": [...] }
 */
if (!defined('ABSPATH')) exit;

/**
 * Akce dostupné i nepřihlášenému.
 * 'me' sem patří proto, že nepřihlášenému vrací null – klient se tak
 * dozví, že má ukázat přihlašovací obrazovku, místo aby dostal chybu.
 */
function spj_public_actions() {
    return ['me', 'login', 'requestPasswordReset'];
}

/** Mapa akcí na obslužné funkce. Co tu není, to z venku nejde zavolat. */
function spj_actions() {
    return [
        // autentizace a profil
        'me'                   => 'spj_act_me',
        'login'                => 'spj_act_login',
        'logout'               => 'spj_act_logout',
        'changePassword'       => 'spj_act_change_password',
        'requestPasswordReset' => 'spj_act_forgot_password',
        'updateProfile'        => 'spj_act_update_profile',
        // moje přání
        'myGifts'              => 'spj_act_my_gifts',
        'createGift'           => 'spj_act_create_gift',
        'updateGift'           => 'spj_act_update_gift',
        'deleteGift'           => 'spj_act_delete_gift',
        // rodina
        'familyGroups'         => 'spj_act_family_groups',
        'familyTree'           => 'spj_act_family_tree',
        'memberGifts'          => 'spj_act_member_gifts',
        // rezervace
        'reserve'              => 'spj_act_reserve',
        'cancelReservation'    => 'spj_act_cancel_reservation',
        'myReservations'       => 'spj_act_my_reservations',
        // děti pod správou
        'myWards'              => 'spj_act_my_wards',
        'wardGifts'            => 'spj_act_ward_gifts',
        'createWardGift'       => 'spj_act_create_ward_gift',
        // administrace
        'adminUsers'           => 'spj_act_admin_users',
        'adminGuardians'       => 'spj_act_admin_guardians',
        'adminCreateUser'      => 'spj_act_admin_create_user',
        'adminUpdateUser'      => 'spj_act_admin_update_user',
        'adminResetPassword'   => 'spj_act_admin_reset_password',
        'adminDeleteUser'      => 'spj_act_admin_delete_user',
        'adminGifts'           => 'spj_act_admin_gifts',
        'adminCancelReservation' => 'spj_act_admin_cancel_reservation',
        // pomocné
        'fetchLinkPreview'     => 'spj_act_link_preview',
    ];
}

function spj_register_routes() {
    register_rest_route('jezisek/v1', '/call', [
        'methods'             => 'POST',
        'callback'            => 'spj_handle_call',
        'permission_callback' => '__return_true', // kontroluje se v spj_handle_call
    ]);
}
add_action('rest_api_init', 'spj_register_routes');

/** Rozcestník. Tady se rozhoduje o přístupu, dřív než se sáhne na data. */
function spj_handle_call(WP_REST_Request $request) {
    $action = (string) $request->get_param('action');
    $args   = $request->get_param('args');
    if (!is_array($args)) $args = [];

    $map = spj_actions();
    if (!isset($map[$action])) {
        return new WP_Error('spj_unknown_action', 'Neznámá akce.', ['status' => 400]);
    }

    $public = in_array($action, spj_public_actions(), true);

    if (!$public) {
        if (!is_user_logged_in()) {
            return new WP_Error('spj_unauthorized', 'Nejste přihlášeni.', ['status' => 401]);
        }
        // Dokud si uživatel nezmění dočasné heslo, neprojde nic jiného.
        if ($action !== 'changePassword' && $action !== 'me' && $action !== 'logout'
            && spj_must_change_password(get_current_user_id())) {
            return new WP_Error('spj_must_change_password',
                'Nejdřív je potřeba změnit dočasné heslo.', ['status' => 403]);
        }
    }

    return call_user_func($map[$action], $args);
}

/** Profil přihlášeného, nebo chyba 401. */
function spj_require_person() {
    $p = spj_current_person();
    if (!$p) return new WP_Error('spj_unauthorized', 'Nejste přihlášeni.', ['status' => 401]);
    return $p;
}

function spj_must_change_password($user_id) {
    return (bool) get_user_meta($user_id, 'spj_must_change_password', true);
}

/* ==================================================================
   Autentizace a profil
   ================================================================== */

function spj_act_me($a) {
    if (!is_user_logged_in()) return null;
    $p = spj_current_person();
    if (!$p) return null;
    $dto = spj_user_dto($p);
    $dto['mustChangePassword'] = spj_must_change_password(get_current_user_id());
    return $dto;
}

function spj_act_login($a) {
    $email    = isset($a[0]) ? trim((string) $a[0]) : '';
    $password = isset($a[1]) ? (string) $a[1] : '';
    $remember = isset($a[2]) ? (bool) $a[2] : true;

    // Hádání hesel: jednoduchá brzda podle IP.
    $block = spj_login_throttle_check();
    if (is_wp_error($block)) return $block;

    $user = get_user_by('email', $email);
    if (!$user) $user = get_user_by('login', $email);

    $signed = null;
    if ($user) {
        $signed = wp_signon([
            'user_login'    => $user->user_login,
            'user_password' => $password,
            'remember'      => $remember,
        ], is_ssl());
    }

    if (!$user || is_wp_error($signed)) {
        spj_login_throttle_hit();
        // Stejná hláška pro neznámý e-mail i špatné heslo.
        return new WP_Error('spj_login_failed', 'Nesprávný e-mail nebo heslo.', ['status' => 401]);
    }

    spj_login_throttle_clear();
    wp_set_current_user($signed->ID);

    $person = spj_current_person();
    $dto = $person ? spj_user_dto($person) : [];
    $dto['mustChangePassword'] = spj_must_change_password($signed->ID);
    return $dto;
}

function spj_act_logout($a) {
    wp_logout();
    return ['ok' => true];
}

function spj_act_change_password($a) {
    $current = isset($a[0]) ? (string) $a[0] : '';
    $next    = isset($a[1]) ? (string) $a[1] : '';

    $user = wp_get_current_user();
    if (!$user || !$user->ID) {
        return new WP_Error('spj_unauthorized', 'Nejste přihlášeni.', ['status' => 401]);
    }
    if (!wp_check_password($current, $user->user_pass, $user->ID)) {
        return new WP_Error('spj_invalid', 'Současné heslo není správné.', ['status' => 400]);
    }
    if (strlen($next) < 8) {
        return new WP_Error('spj_invalid', 'Heslo musí mít alespoň 8 znaků.', ['status' => 400]);
    }
    if (wp_check_password($next, $user->user_pass, $user->ID)) {
        return new WP_Error('spj_invalid', 'Nové heslo musí být jiné než současné.', ['status' => 400]);
    }

    wp_set_password($next, $user->ID);
    delete_user_meta($user->ID, 'spj_must_change_password');

    // wp_set_password odhlásí všechna zařízení – přihlásíme tohle zpátky.
    wp_set_current_user($user->ID);
    wp_set_auth_cookie($user->ID, true);

    $p = spj_current_person();
    $dto = $p ? spj_user_dto($p) : [];
    $dto['mustChangePassword'] = false;
    return $dto;
}

/** Použije vestavěný mechanismus WordPressu – odkaz i e-mail obstará on. */
function spj_act_forgot_password($a) {
    $email = isset($a[0]) ? trim((string) $a[0]) : '';
    $user  = get_user_by('email', $email);
    if ($user) {
        retrieve_password($user->user_login);
    }
    // Odpověď je vždy stejná – neprozradíme, které e-maily existují.
    return ['ok' => true];
}

function spj_act_update_profile($a) {
    global $wpdb;
    $p = spj_require_person();
    if (is_wp_error($p)) return $p;

    $d    = isset($a[0]) && is_array($a[0]) ? $a[0] : [];
    $name = trim((string) ($d['name'] ?? ''));
    if ($name === '' || mb_strlen($name) > 60) {
        return new WP_Error('spj_invalid', 'Vyplň jméno (max 60 znaků).', ['status' => 400]);
    }

    $avatar = (string) ($d['avatar'] ?? '');
    if (strpos($avatar, 'data:') === 0) {
        $stored = spj_store_image($avatar);
        if (is_wp_error($stored)) return $stored;
        $avatar = $stored;
    } elseif ($avatar !== '' && !preg_match('#^https?://#i', $avatar) && mb_strlen($avatar) > 8) {
        $avatar = ''; // emoji je krátké; cokoli delšího bez http: zahodíme
    }

    $wpdb->update(spj_table('people'),
        ['name' => sanitize_text_field($name), 'avatar' => $avatar],
        ['id' => (int) $p->id], ['%s', '%s'], ['%d']);

    if ($p->wp_user_id) {
        wp_update_user(['ID' => (int) $p->wp_user_id, 'display_name' => sanitize_text_field($name)]);
    }
    return spj_user_dto(spj_person($p->id));
}

/* ==================================================================
   Moje přání
   ================================================================== */

function spj_act_my_gifts($a) {
    $p = spj_require_person();
    if (is_wp_error($p)) return $p;
    $out = [];
    foreach (spj_gifts_of($p->id) as $g) $out[] = spj_gift_dto($g, $p);
    return $out;
}

function spj_act_create_gift($a) {
    $p = spj_require_person();
    if (is_wp_error($p)) return $p;
    return spj_create_gift($p->id, isset($a[0]) && is_array($a[0]) ? $a[0] : [], $p);
}

function spj_act_update_gift($a) {
    $p = spj_require_person();
    if (is_wp_error($p)) return $p;
    return spj_update_gift((int) ($a[0] ?? 0), isset($a[1]) && is_array($a[1]) ? $a[1] : [], $p);
}

function spj_act_delete_gift($a) {
    $p = spj_require_person();
    if (is_wp_error($p)) return $p;
    return spj_delete_gift((int) ($a[0] ?? 0), $p);
}

/* ==================================================================
   Rodina
   ================================================================== */

function spj_act_family_groups($a) {
    return array_values(spj_family_groups());
}

/**
 * Rodina rozdělená do skupin.
 *
 * @param bool $a[0] zařadit i přihlášeného uživatele. Přehled ho chce vidět
 *                   (ať se člověk najde mezi svými), stránka Rodina ne –
 *                   tam se prochází seznamy ostatních.
 */
function spj_act_family_tree($a) {
    $p = spj_require_person();
    if (is_wp_error($p)) return $p;

    $rows = spj_family_others($p);
    if (!empty($a[0])) $rows[] = $p;
    usort($rows, function ($x, $y) { return strcoll($x->name, $y->name); });

    $row = function ($r) use ($p) {
        $out = spj_member_row($r);
        $out['isMe'] = ((int) $r->id === (int) $p->id);
        return $out;
    };

    $tree   = [];
    $placed = [];

    foreach (spj_family_groups() as $g) {
        $members = [];
        foreach ($rows as $r) {
            if ($r->family_group === $g) {
                $members[] = $row($r);
                $placed[(int) $r->id] = true;
            }
        }
        $tree[] = ['name' => $g, 'members' => $members];
    }

    $rest = [];
    foreach ($rows as $r) {
        if (empty($placed[(int) $r->id])) $rest[] = $row($r);
    }
    if ($rest) $tree[] = ['name' => 'Bez skupiny', 'members' => $rest];

    return $tree;
}

function spj_act_member_gifts($a) {
    $p = spj_require_person();
    if (is_wp_error($p)) return $p;

    $id = (int) ($a[0] ?? 0);
    if ($id === (int) $p->id) {
        return new WP_Error('spj_invalid', 'Vlastní seznam najdeš v sekci Moje přání.', ['status' => 400]);
    }
    $owner = spj_person($id);
    if (!$owner) return new WP_Error('spj_not_found', 'Uživatel nebyl nalezen.', ['status' => 404]);

    $gifts = [];
    foreach (spj_gifts_of($id) as $g) $gifts[] = spj_gift_dto($g, $p);

    return [
        'member' => ['id' => (int) $owner->id, 'name' => $owner->name, 'avatar' => $owner->avatar],
        'gifts'  => $gifts,
    ];
}

/* ==================================================================
   Rezervace
   ================================================================== */

function spj_act_reserve($a) {
    $p = spj_require_person();
    if (is_wp_error($p)) return $p;
    return spj_reserve((int) ($a[0] ?? 0), $p);
}

function spj_act_cancel_reservation($a) {
    $p = spj_require_person();
    if (is_wp_error($p)) return $p;
    return spj_cancel_reservation((int) ($a[0] ?? 0), $p);
}

function spj_act_my_reservations($a) {
    $p = spj_require_person();
    if (is_wp_error($p)) return $p;
    return spj_my_reservations($p);
}

/* ==================================================================
   Děti pod správou
   ================================================================== */

function spj_act_my_wards($a) {
    $p = spj_require_person();
    if (is_wp_error($p)) return $p;
    $out = [];
    foreach (spj_wards_of($p) as $w) $out[] = spj_member_row($w);
    return $out;
}

function spj_act_ward_gifts($a) {
    $p = spj_require_person();
    if (is_wp_error($p)) return $p;

    $child = spj_person((int) ($a[0] ?? 0));
    if (!$child || $child->kind !== 'child') {
        return new WP_Error('spj_not_found', 'Profil nebyl nalezen.', ['status' => 404]);
    }
    if ((int) $child->guardian_id !== (int) $p->id && !spj_is_admin()) {
        return new WP_Error('spj_forbidden', 'Tento seznam nemůžete spravovat.', ['status' => 403]);
    }

    $gifts = [];
    foreach (spj_gifts_of($child->id) as $g) $gifts[] = spj_gift_dto($g, $p);

    return [
        'child' => ['id' => (int) $child->id, 'name' => $child->name, 'avatar' => $child->avatar],
        'gifts' => $gifts,
    ];
}

function spj_act_create_ward_gift($a) {
    $p = spj_require_person();
    if (is_wp_error($p)) return $p;

    $child = spj_person((int) ($a[0] ?? 0));
    if (!$child || $child->kind !== 'child') {
        return new WP_Error('spj_not_found', 'Profil nebyl nalezen.', ['status' => 404]);
    }
    if ((int) $child->guardian_id !== (int) $p->id && !spj_is_admin()) {
        return new WP_Error('spj_forbidden', 'Tento seznam nemůžete spravovat.', ['status' => 403]);
    }
    return spj_create_gift($child->id, isset($a[1]) && is_array($a[1]) ? $a[1] : [], $p);
}

/* ==================================================================
   Jednoduchá brzda na hádání hesla
   ================================================================== */

function spj_login_throttle_key() {
    $ip = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '0';
    return 'spj_login_' . md5($ip);
}

function spj_login_throttle_check() {
    $tries = (int) get_transient(spj_login_throttle_key());
    if ($tries >= 8) {
        return new WP_Error('spj_too_many',
            'Příliš mnoho pokusů. Zkus to prosím za 15 minut.', ['status' => 429]);
    }
    return true;
}

function spj_login_throttle_hit() {
    $key   = spj_login_throttle_key();
    $tries = (int) get_transient($key);
    set_transient($key, $tries + 1, 15 * MINUTE_IN_SECONDS);
}

function spj_login_throttle_clear() {
    delete_transient(spj_login_throttle_key());
}
