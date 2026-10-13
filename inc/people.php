<?php
/**
 * Seznam pro Ježíška – lidé
 *
 * Dva druhy profilů v jedné tabulce:
 *   account – má účet ve WordPressu (wp_user_id), přihlašuje se
 *   child   – dětský profil bez přihlášení, spravuje ho poručník
 *
 * Vlastníkem dárku je vždy řádek z téhle tabulky, takže dárky dětí
 * fungují úplně stejně jako dárky dospělých.
 */
if (!defined('ABSPATH')) exit;

/** Načte profil podle id. */
function spj_person($id) {
    global $wpdb;
    $t = spj_table('people');
    return $wpdb->get_row($wpdb->prepare("SELECT * FROM $t WHERE id = %d", (int) $id));
}

/** Profil navázaný na WordPress účet. */
function spj_person_by_user($user_id) {
    global $wpdb;
    $t = spj_table('people');
    return $wpdb->get_row($wpdb->prepare("SELECT * FROM $t WHERE wp_user_id = %d", (int) $user_id));
}

/**
 * Profil přihlášeného uživatele. Když ještě neexistuje (typicky admin,
 * který právě nainstaloval WordPress), založí se – ať nevznikne stav
 * „přihlášený člověk bez seznamu".
 */
function spj_current_person() {
    $uid = get_current_user_id();
    if (!$uid) return null;

    $person = spj_person_by_user($uid);
    if ($person) return $person;

    $user = get_userdata($uid);
    if (!$user) return null;

    $name = $user->display_name ? $user->display_name : $user->user_login;
    $id   = spj_create_account_person($uid, $name, '', '');
    return $id ? spj_person($id) : null;
}

/** Je přihlášený uživatel správce aplikace? */
function spj_is_admin() {
    return current_user_can('manage_options');
}

/** Založí profil pro existující WordPress účet. */
function spj_create_account_person($wp_user_id, $name, $avatar = '', $group = '') {
    global $wpdb;
    $ok = $wpdb->insert(spj_table('people'), [
        'wp_user_id'   => (int) $wp_user_id,
        'kind'         => 'account',
        'name'         => $name,
        'avatar'       => $avatar,
        'family_group' => $group,
        'guardian_id'  => null,
        'created_at'   => spj_now(),
    ], ['%d', '%s', '%s', '%s', '%s', '%d', '%s']);
    return $ok ? (int) $wpdb->insert_id : 0;
}

/** Založí dětský profil bez přihlášení. */
function spj_create_child_person($name, $avatar, $group, $guardian_id) {
    global $wpdb;
    $ok = $wpdb->insert(spj_table('people'), [
        'wp_user_id'   => null,
        'kind'         => 'child',
        'name'         => $name,
        'avatar'       => $avatar,
        'family_group' => $group,
        'guardian_id'  => (int) $guardian_id,
        'created_at'   => spj_now(),
    ], ['%d', '%s', '%s', '%s', '%s', '%d', '%s']);
    return $ok ? (int) $wpdb->insert_id : 0;
}

/** Je 'owner_id' dítě, které spravuje 'person'? */
function spj_is_ward_of($owner_id, $person) {
    $owner = spj_person($owner_id);
    return $owner
        && $owner->kind === 'child'
        && (int) $owner->guardian_id === (int) $person->id;
}

/** Smí 'person' upravovat dárky vlastníka 'owner_id'? */
function spj_can_manage_gifts_of($owner_id, $person) {
    return (int) $owner_id === (int) $person->id
        || spj_is_admin()
        || spj_is_ward_of($owner_id, $person);
}

/** Počet dárků v seznamu daného profilu. */
function spj_gift_count($person_id) {
    global $wpdb;
    $t = spj_table('gifts');
    return (int) $wpdb->get_var(
        $wpdb->prepare("SELECT COUNT(*) FROM $t WHERE owner_id = %d", (int) $person_id)
    );
}

/**
 * Tabulka velikostí. Uložená jako JSON ve sloupci people.sizes – vždy se
 * čte i zapisuje celá, takže vlastní tabulka by byla jen práce navíc.
 * Není to tajná informace, právě naopak: smysl má jedině sdílená.
 */
function spj_sizes($p) {
    if (!$p || !$p->sizes) return [];
    $data = json_decode($p->sizes, true);
    if (!is_array($data)) return [];

    $out = [];
    foreach ($data as $row) {
        if (!is_array($row)) continue;
        $label = trim((string) ($row['label'] ?? ''));
        $value = trim((string) ($row['value'] ?? ''));
        if ($label === '' && $value === '') continue;
        $out[] = ['label' => $label, 'value' => $value];
    }
    return $out;
}

/** Smí 'actor' upravovat velikosti profilu 'target'? */
function spj_can_edit_sizes($target, $actor) {
    if (!$target || !$actor) return false;
    return (int) $target->id === (int) $actor->id
        || spj_is_admin()
        || ($target->kind === 'child' && (int) $target->guardian_id === (int) $actor->id);
}

/** Uloží tabulku velikostí. @return true|WP_Error */
function spj_save_sizes($target, $rows) {
    global $wpdb;
    if (!is_array($rows)) $rows = [];
    if (count($rows) > 30) {
        return new WP_Error('spj_invalid', 'Velikostí je moc (max 30 řádků).', ['status' => 400]);
    }

    $clean = [];
    foreach ($rows as $row) {
        if (!is_array($row)) continue;
        $label = sanitize_text_field(trim((string) ($row['label'] ?? '')));
        $value = sanitize_text_field(trim((string) ($row['value'] ?? '')));
        if ($label === '' && $value === '') continue;   // prázdné řádky zahodíme
        if (mb_strlen($label) > 40 || mb_strlen($value) > 40) {
            return new WP_Error('spj_invalid', 'Název i hodnota smí mít nejvýš 40 znaků.', ['status' => 400]);
        }
        $clean[] = ['label' => $label, 'value' => $value];
    }

    $wpdb->update(spj_table('people'),
        ['sizes' => $clean ? wp_json_encode($clean) : null],
        ['id' => (int) $target->id], ['%s'], ['%d']);
    return true;
}

/** Řádek člena rodiny pro klienta (nikdy neobsahuje e-mail ani nic citlivého). */
function spj_member_row($p) {
    return [
        'id'          => (int) $p->id,
        'name'        => $p->name,
        'avatar'      => $p->avatar,
        'familyGroup' => $p->family_group,
        'isChild'     => $p->kind === 'child',
        'sizes'       => spj_sizes($p),
        'giftCount'   => spj_gift_count($p->id),
    ];
}

/** Všichni ostatní: bez sebe a bez vlastních dětí (ty jsou v Mých přáních). */
function spj_family_others($person) {
    global $wpdb;
    $t = spj_table('people');
    $rows = $wpdb->get_results($wpdb->prepare(
        "SELECT * FROM $t WHERE id <> %d AND NOT (kind = 'child' AND guardian_id = %d)",
        (int) $person->id, (int) $person->id
    ));
    return $rows ? $rows : [];
}

/** Dětské profily pod správou daného člověka. */
function spj_wards_of($person) {
    global $wpdb;
    $t = spj_table('people');
    $rows = $wpdb->get_results($wpdb->prepare(
        "SELECT * FROM $t WHERE kind = 'child' AND guardian_id = %d ORDER BY name",
        (int) $person->id
    ));
    return $rows ? $rows : [];
}

/** Údaje o přihlášeném pro klienta. */
function spj_user_dto($person) {
    $user = $person->wp_user_id ? get_userdata($person->wp_user_id) : null;
    return [
        'id'          => (int) $person->id,
        'name'        => $person->name,
        'email'       => $user ? $user->user_email : null,
        'avatar'      => $person->avatar,
        'role'        => spj_is_admin() ? 'admin' : 'member',
        'familyGroup' => $person->family_group,
        'kind'        => $person->kind,
        'guardianId'  => $person->guardian_id ? (int) $person->guardian_id : null,
    ];
}
