<?php
/**
 * Seznam pro Ježíška – rezervace
 *
 * Identita rezervujícího se čte jen tady a v inc/mail.php. Ven ji posílá
 * výhradně spj_gift_dto(), a to pouze jako „reservedByMe" u toho, kdo
 * rezervaci sám vytvořil.
 */
if (!defined('ABSPATH')) exit;

/** Rezervace daného dárku, nebo null. */
function spj_reservation_of($gift_id) {
    global $wpdb;
    $t = spj_table('reservations');
    return $wpdb->get_row($wpdb->prepare("SELECT * FROM $t WHERE gift_id = %d", (int) $gift_id));
}

/** Rezervace dárku jiného člena rodiny. */
function spj_reserve($gift_id, $person) {
    global $wpdb;
    $g = spj_gift($gift_id);
    if (!$g) return new WP_Error('spj_not_found', 'Dárek nebyl nalezen.', ['status' => 404]);

    if ((int) $g->owner_id === (int) $person->id) {
        return new WP_Error('spj_forbidden', 'Vlastní dárky rezervovat nelze.', ['status' => 403]);
    }
    if (spj_reservation_of($g->id)) {
        return new WP_Error('spj_conflict', 'Tento dárek už je rezervovaný.', ['status' => 409]);
    }

    // UNIQUE KEY na gift_id pojistí i souběh dvou lidí ve stejnou chvíli.
    $ok = $wpdb->insert(spj_table('reservations'), [
        'gift_id'     => (int) $g->id,
        'reserver_id' => (int) $person->id,
        'created_at'  => spj_now(),
    ], ['%d', '%d', '%s']);

    if (!$ok) {
        return new WP_Error('spj_conflict', 'Tento dárek už je rezervovaný.', ['status' => 409]);
    }
    return spj_gift_dto(spj_gift($g->id), $person);
}

/** Zrušení vlastní rezervace. */
function spj_cancel_reservation($gift_id, $person) {
    global $wpdb;
    $g = spj_gift($gift_id);
    if (!$g) return new WP_Error('spj_not_found', 'Dárek nebyl nalezen.', ['status' => 404]);

    // U vlastního dárku odmítneme bez ohledu na stav rezervace – z odpovědi
    // tedy nejde vyčíst, jestli je dárek rezervovaný.
    if ((int) $g->owner_id === (int) $person->id) {
        return new WP_Error('spj_forbidden', 'K této akci nemáte oprávnění.', ['status' => 403]);
    }

    $r = spj_reservation_of($g->id);
    if (!$r || (int) $r->reserver_id !== (int) $person->id) {
        return new WP_Error('spj_forbidden', 'Tuto rezervaci nemůžete zrušit.', ['status' => 403]);
    }

    $wpdb->delete(spj_table('reservations'), ['id' => (int) $r->id], ['%d']);
    return spj_gift_dto(spj_gift($g->id), $person);
}

/** Dárky, které rezervoval přihlášený uživatel. */
function spj_my_reservations($person) {
    global $wpdb;
    $gt = spj_table('gifts');
    $rt = spj_table('reservations');

    $rows = $wpdb->get_results($wpdb->prepare(
        "SELECT g.* FROM $gt g
         INNER JOIN $rt r ON r.gift_id = g.id
         WHERE r.reserver_id = %d AND g.owner_id <> %d
         ORDER BY g.priority DESC, g.name ASC",
        (int) $person->id, (int) $person->id
    ));

    $out = [];
    foreach (($rows ? $rows : []) as $g) {
        $owner = spj_person($g->owner_id);
        $out[] = array_merge(spj_gift_dto($g, $person), [
            'ownerName'   => $owner ? $owner->name : '?',
            'ownerAvatar' => $owner ? $owner->avatar : '',
        ]);
    }
    return $out;
}

/**
 * Zrušení rezervace administrátorem. Ani admin nesmí sahat na rezervaci
 * svého vlastního dárku – jinak by z chování endpointu poznal, že existuje.
 */
function spj_admin_cancel_reservation($gift_id, $person) {
    global $wpdb;
    if (!spj_is_admin()) {
        return new WP_Error('spj_forbidden', 'K této akci nemáte oprávnění.', ['status' => 403]);
    }
    $g = spj_gift($gift_id);
    if (!$g) return new WP_Error('spj_not_found', 'Dárek nebyl nalezen.', ['status' => 404]);

    if ((int) $g->owner_id === (int) $person->id) {
        return new WP_Error('spj_forbidden', 'U vlastních dárků tuto akci provést nelze.', ['status' => 403]);
    }
    $r = spj_reservation_of($g->id);
    if (!$r) {
        return new WP_Error('spj_conflict', 'Tento dárek není rezervovaný.', ['status' => 409]);
    }
    $wpdb->delete(spj_table('reservations'), ['id' => (int) $r->id], ['%d']);
    return ['ok' => true];
}
