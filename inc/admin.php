<?php
/**
 * Seznam pro Ježíška – administrace
 *
 * Správce zakládá účty i dětské profily. Účet = WordPress uživatel + řádek
 * v naší tabulce lidí; dítě = jen řádek v naší tabulce.
 *
 * Platí tu stejné pravidlo jako všude jinde: správce nesmí u SVÝCH
 * vlastních dárků vidět, že jsou rezervované – zařizuje to spj_gift_dto().
 */
if (!defined('ABSPATH')) exit;

function spj_require_admin() {
    if (!spj_is_admin()) {
        return new WP_Error('spj_forbidden', 'K této akci nemáte oprávnění.', ['status' => 403]);
    }
    return true;
}

function spj_act_admin_users($a) {
    global $wpdb;
    $guard = spj_require_admin();
    if (is_wp_error($guard)) return $guard;

    $t    = spj_table('people');
    $rows = $wpdb->get_results("SELECT * FROM $t ORDER BY kind ASC, name ASC");
    $me   = spj_current_person();

    $out = [];
    foreach (($rows ? $rows : []) as $p) {
        $user     = $p->wp_user_id ? get_userdata($p->wp_user_id) : null;
        $guardian = $p->guardian_id ? spj_person($p->guardian_id) : null;

        $out[] = [
            'id'                 => (int) $p->id,
            'name'               => $p->name,
            'email'              => $user ? $user->user_email : null,
            'avatar'             => $p->avatar,
            'role'               => ($user && user_can($user, 'manage_options')) ? 'admin' : 'member',
            'familyGroup'        => $p->family_group,
            'kind'               => $p->kind,
            'guardianId'         => $p->guardian_id ? (int) $p->guardian_id : null,
            'guardianName'       => $guardian ? $guardian->name : '',
            'wardCount'          => (int) $wpdb->get_var($wpdb->prepare(
                "SELECT COUNT(*) FROM $t WHERE kind = 'child' AND guardian_id = %d", (int) $p->id)),
            'giftCount'          => spj_gift_count($p->id),
            'mustChangePassword' => $user ? spj_must_change_password($user->ID) : false,
        ];
    }
    return $out;
}

/** Účty, které mohou být poručníkem (dítě poručníkem být nemůže). */
function spj_act_admin_guardians($a) {
    global $wpdb;
    $guard = spj_require_admin();
    if (is_wp_error($guard)) return $guard;

    $t    = spj_table('people');
    $rows = $wpdb->get_results("SELECT id, name FROM $t WHERE kind = 'account' ORDER BY name ASC");
    $out  = [];
    foreach (($rows ? $rows : []) as $r) {
        $out[] = ['id' => (int) $r->id, 'name' => $r->name];
    }
    return $out;
}

function spj_act_admin_create_user($a) {
    $guard = spj_require_admin();
    if (is_wp_error($guard)) return $guard;

    $d     = isset($a[0]) && is_array($a[0]) ? $a[0] : [];
    $name  = trim((string) ($d['name'] ?? ''));
    $group = (string) ($d['familyGroup'] ?? '');
    $kind  = ($d['kind'] ?? 'account') === 'child' ? 'child' : 'account';

    if ($name === '' || mb_strlen($name) > 60) {
        return new WP_Error('spj_invalid', 'Vyplň jméno (max 60 znaků).', ['status' => 400]);
    }
    if ($group !== '' && !in_array($group, spj_family_groups(), true)) {
        return new WP_Error('spj_invalid', 'Neznámá rodinná skupina.', ['status' => 400]);
    }

    $avatar = (string) ($d['avatar'] ?? '');
    if (strpos($avatar, 'data:') === 0) {
        $stored = spj_store_image($avatar);
        if (is_wp_error($stored)) return $stored;
        $avatar = $stored;
    }

    // --- dětský profil: bez e-mailu a hesla ---
    if ($kind === 'child') {
        $guardian = spj_person((int) ($d['guardianId'] ?? 0));
        if (!$guardian || $guardian->kind !== 'account') {
            return new WP_Error('spj_invalid',
                'Vyber poručníka — účet, který bude seznam spravovat.', ['status' => 400]);
        }
        $id = spj_create_child_person(sanitize_text_field($name), $avatar, $group, $guardian->id);
        if (!$id) return new WP_Error('spj_db', 'Profil se nepodařilo založit.', ['status' => 500]);
        return spj_user_dto(spj_person($id));
    }

    // --- účet s přihlášením ---
    $email = sanitize_email((string) ($d['email'] ?? ''));
    if (!is_email($email)) {
        return new WP_Error('spj_invalid', 'E-mail nemá platný formát.', ['status' => 400]);
    }
    if (email_exists($email)) {
        return new WP_Error('spj_invalid', 'Tento e-mail už je použitý.', ['status' => 400]);
    }
    $password = (string) ($d['tempPassword'] ?? '');
    if (strlen($password) < 8) {
        return new WP_Error('spj_invalid', 'Heslo musí mít alespoň 8 znaků.', ['status' => 400]);
    }

    $login = sanitize_user(current(explode('@', $email)), true);
    if ($login === '' || username_exists($login)) {
        $login = 'uzivatel' . wp_rand(1000, 9999);
    }

    $user_id = wp_insert_user([
        'user_login'   => $login,
        'user_email'   => $email,
        'user_pass'    => $password,
        'display_name' => sanitize_text_field($name),
        'role'         => ($d['role'] ?? '') === 'admin' ? 'administrator' : 'subscriber',
    ]);
    if (is_wp_error($user_id)) {
        return new WP_Error('spj_invalid', 'Účet se nepodařilo založit.', ['status' => 400]);
    }

    update_user_meta($user_id, 'spj_must_change_password', 1);
    $id = spj_create_account_person($user_id, sanitize_text_field($name), $avatar, $group);
    if (!$id) return new WP_Error('spj_db', 'Profil se nepodařilo založit.', ['status' => 500]);

    spj_mail_new_account($user_id, sanitize_text_field($name));

    return spj_user_dto(spj_person($id));
}

function spj_act_admin_update_user($a) {
    global $wpdb;
    $guard = spj_require_admin();
    if (is_wp_error($guard)) return $guard;

    $p = spj_person((int) ($a[0] ?? 0));
    if (!$p) return new WP_Error('spj_not_found', 'Profil nebyl nalezen.', ['status' => 404]);

    $d     = isset($a[1]) && is_array($a[1]) ? $a[1] : [];
    $name  = trim((string) ($d['name'] ?? ''));
    if ($name === '' || mb_strlen($name) > 60) {
        return new WP_Error('spj_invalid', 'Vyplň jméno (max 60 znaků).', ['status' => 400]);
    }

    $fields = ['name' => sanitize_text_field($name)];
    $format = ['%s'];

    if (isset($d['avatar'])) {
        $avatar = (string) $d['avatar'];
        if (strpos($avatar, 'data:') === 0) {
            $stored = spj_store_image($avatar);
            if (is_wp_error($stored)) return $stored;
            $avatar = $stored;
        }
        $fields['avatar'] = $avatar;
        $format[] = '%s';
    }
    if (isset($d['familyGroup'])) {
        $group = (string) $d['familyGroup'];
        if ($group !== '' && !in_array($group, spj_family_groups(), true)) {
            return new WP_Error('spj_invalid', 'Neznámá rodinná skupina.', ['status' => 400]);
        }
        $fields['family_group'] = $group;
        $format[] = '%s';
    }

    // Dítě nemá e-mail ani roli; mění se mu jen poručník.
    if ($p->kind === 'child') {
        if (isset($d['guardianId'])) {
            $guardian = spj_person((int) $d['guardianId']);
            if (!$guardian || $guardian->kind !== 'account') {
                return new WP_Error('spj_invalid',
                    'Vyber poručníka — účet, který bude seznam spravovat.', ['status' => 400]);
            }
            $fields['guardian_id'] = (int) $guardian->id;
            $format[] = '%d';
        }
        $wpdb->update(spj_table('people'), $fields, ['id' => (int) $p->id], $format, ['%d']);
        return spj_user_dto(spj_person($p->id));
    }

    $user = $p->wp_user_id ? get_userdata($p->wp_user_id) : null;
    if ($user) {
        $email = sanitize_email((string) ($d['email'] ?? ''));
        if (!is_email($email)) {
            return new WP_Error('spj_invalid', 'E-mail nemá platný formát.', ['status' => 400]);
        }
        $existing = email_exists($email);
        if ($existing && (int) $existing !== (int) $user->ID) {
            return new WP_Error('spj_invalid', 'Tento e-mail už je použitý.', ['status' => 400]);
        }

        $update = ['ID' => $user->ID, 'user_email' => $email,
                   'display_name' => sanitize_text_field($name)];

        if (isset($d['role'])) {
            $role = $d['role'] === 'admin' ? 'administrator' : 'subscriber';
            // Poslední správce si nesmí sebrat práva.
            if ($role !== 'administrator' && user_can($user, 'manage_options')) {
                $admins = get_users(['role' => 'administrator', 'fields' => 'ID']);
                if (count($admins) <= 1) {
                    return new WP_Error('spj_invalid',
                        'Musí zůstat alespoň jeden administrátor.', ['status' => 400]);
                }
            }
            $update['role'] = $role;
        }
        wp_update_user($update);
    }

    $wpdb->update(spj_table('people'), $fields, ['id' => (int) $p->id], $format, ['%d']);
    return spj_user_dto(spj_person($p->id));
}

function spj_act_admin_reset_password($a) {
    $guard = spj_require_admin();
    if (is_wp_error($guard)) return $guard;

    $p = spj_person((int) ($a[0] ?? 0));
    if (!$p) return new WP_Error('spj_not_found', 'Profil nebyl nalezen.', ['status' => 404]);
    if ($p->kind === 'child' || !$p->wp_user_id) {
        return new WP_Error('spj_invalid', 'Dětský profil se nepřihlašuje, heslo nemá.', ['status' => 400]);
    }
    $password = (string) ($a[1] ?? '');
    if (strlen($password) < 8) {
        return new WP_Error('spj_invalid', 'Heslo musí mít alespoň 8 znaků.', ['status' => 400]);
    }

    wp_set_password($password, (int) $p->wp_user_id);
    update_user_meta((int) $p->wp_user_id, 'spj_must_change_password', 1);
    return ['ok' => true];
}

function spj_act_admin_delete_user($a) {
    global $wpdb;
    $guard = spj_require_admin();
    if (is_wp_error($guard)) return $guard;

    $me = spj_current_person();
    $p  = spj_person((int) ($a[0] ?? 0));
    if (!$p)  return new WP_Error('spj_not_found', 'Profil nebyl nalezen.', ['status' => 404]);
    if ($me && (int) $p->id === (int) $me->id) {
        return new WP_Error('spj_invalid', 'Vlastní účet smazat nelze.', ['status' => 400]);
    }

    $t = spj_table('people');
    $wards = $wpdb->get_results($wpdb->prepare(
        "SELECT name FROM $t WHERE kind = 'child' AND guardian_id = %d", (int) $p->id));
    if ($wards) {
        $names = [];
        foreach ($wards as $w) $names[] = $w->name;
        return new WP_Error('spj_invalid',
            'Tento účet spravuje dětské profily (' . implode(', ', $names) .
            '). Nejdřív jim přiřaď jiného poručníka.', ['status' => 400]);
    }

    if ($p->wp_user_id && user_can((int) $p->wp_user_id, 'manage_options')) {
        $admins = get_users(['role' => 'administrator', 'fields' => 'ID']);
        if (count($admins) <= 1) {
            return new WP_Error('spj_invalid',
                'Musí zůstat alespoň jeden administrátor.', ['status' => 400]);
        }
    }

    // Rezervace na jeho dárcích → upozornit rezervující, pak uvolnit.
    foreach (spj_gifts_of($p->id) as $g) {
        spj_mail_reserver_about_delete($g);
        $wpdb->delete(spj_table('reservations'), ['gift_id' => (int) $g->id], ['%d']);
    }
    $wpdb->delete(spj_table('gifts'), ['owner_id' => (int) $p->id], ['%d']);
    // Rezervace, které vytvořil on, se tiše uvolní – vlastníci se nic nedozví.
    $wpdb->delete(spj_table('reservations'), ['reserver_id' => (int) $p->id], ['%d']);
    $wpdb->delete($t, ['id' => (int) $p->id], ['%d']);

    if ($p->wp_user_id) {
        require_once ABSPATH . 'wp-admin/includes/user.php';
        wp_delete_user((int) $p->wp_user_id);
    }
    return ['ok' => true];
}

function spj_act_admin_gifts($a) {
    global $wpdb;
    $guard = spj_require_admin();
    if (is_wp_error($guard)) return $guard;

    $me = spj_require_person();
    if (is_wp_error($me)) return $me;

    $t    = spj_table('gifts');
    $rows = $wpdb->get_results("SELECT * FROM $t ORDER BY owner_id ASC, priority DESC");

    $out = [];
    foreach (($rows ? $rows : []) as $g) {
        $owner = spj_person($g->owner_id);
        // spj_gift_dto → u adminových vlastních dárků žádná informace o rezervaci
        $out[] = array_merge(spj_gift_dto($g, $me), [
            'ownerName'   => $owner ? $owner->name : '?',
            'ownerAvatar' => $owner ? $owner->avatar : '',
            'isMine'      => (int) $g->owner_id === (int) $me->id,
        ]);
    }
    return $out;
}

function spj_act_admin_cancel_reservation($a) {
    $me = spj_require_person();
    if (is_wp_error($me)) return $me;
    return spj_admin_cancel_reservation((int) ($a[0] ?? 0), $me);
}
