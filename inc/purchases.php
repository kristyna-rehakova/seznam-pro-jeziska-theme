<?php
/**
 * Seznam pro Ježíška – nákupy
 *
 * Osobní nákupní seznam: co komu pořizuju a co už mám koupené.
 * Skládá se ze dvou zdrojů:
 *   1) rezervace z rodinných seznamů (sloupec bought_at v tabulce reservations)
 *   2) vlastní položky mimo seznamy (tabulka purchases) – třeba vrtáky,
 *      které si taťka nikam nenapsal
 *
 * ===================================================================
 *  Tohle všechno je SOUKROMÉ pro kupujícího.
 * ===================================================================
 * Vlastní položky nevidí nikdo jiný, obdarovaný už vůbec ne – jediná
 * cesta k nim je přes buyer_id přihlášeného. Ani příznak „koupeno"
 * u rezervace neopouští tuhle vrstvu: do spj_gift_dto() se nedostane,
 * takže ostatní dál vidí jen „Rezervováno" a vlastník pořád nic.
 */
if (!defined('ABSPATH')) exit;

/** Vlastní položka podle id, jen pokud patří kupujícímu. */
function spj_purchase($id, $person) {
    global $wpdb;
    $t = spj_table('purchases');
    return $wpdb->get_row($wpdb->prepare(
        "SELECT * FROM $t WHERE id = %d AND buyer_id = %d",
        (int) $id, (int) $person->id
    ));
}

/** Kontrola a očištění vstupu vlastní položky. @return array|WP_Error */
function spj_validate_purchase_input($d) {
    $name = trim((string) ($d['name'] ?? ''));
    if ($name === '')            return new WP_Error('spj_invalid', 'Vyplň: Název.', ['status' => 400]);
    if (mb_strlen($name) > 120)  return new WP_Error('spj_invalid', 'Název je příliš dlouhý (max 120 znaků).', ['status' => 400]);

    $note = trim((string) ($d['note'] ?? ''));
    if (mb_strlen($note) > 500) {
        return new WP_Error('spj_invalid', 'Poznámka je příliš dlouhá (max 500 znaků).', ['status' => 400]);
    }

    $price = null;
    $raw   = $d['price'] ?? '';
    if ($raw !== '' && $raw !== null) {
        $clean = str_replace([' ', "\xc2\xa0", ','], ['', '', '.'], (string) $raw);
        if (!is_numeric($clean)) {
            return new WP_Error('spj_invalid', 'Cena musí být číslo v Kč.', ['status' => 400]);
        }
        $price = (int) round((float) $clean);
        if ($price < 0 || $price > 10000000) {
            return new WP_Error('spj_invalid', 'Cena musí být v rozmezí 0 – 10 000 000 Kč.', ['status' => 400]);
        }
    }

    // Příjemce: buď někdo z rodiny, nebo volně napsané jméno.
    $for_id   = (int) ($d['forPersonId'] ?? 0);
    $for_name = trim((string) ($d['forName'] ?? ''));

    if ($for_id) {
        $p = spj_person($for_id);
        if (!$p) return new WP_Error('spj_invalid', 'Zvolený člověk neexistuje.', ['status' => 400]);
        $for_name = '';
    } else {
        $for_id = null;
        if (mb_strlen($for_name) > 60) {
            return new WP_Error('spj_invalid', 'Jméno je příliš dlouhé (max 60 znaků).', ['status' => 400]);
        }
    }

    return [
        'for_person_id' => $for_id,
        'for_name'      => sanitize_text_field($for_name),
        'name'          => sanitize_text_field($name),
        'price'         => $price,
        'note'          => sanitize_textarea_field($note),
    ];
}

function spj_create_purchase($d, $person) {
    global $wpdb;
    $v = spj_validate_purchase_input($d);
    if (is_wp_error($v)) return $v;

    $wpdb->insert(spj_table('purchases'), array_merge($v, [
        'buyer_id'   => (int) $person->id,
        'bought_at'  => !empty($d['bought']) ? spj_now() : null,
        'created_at' => spj_now(),
    ]), ['%d', '%s', '%s', '%d', '%s', '%d', '%s', '%s']);

    return ['ok' => true, 'id' => (int) $wpdb->insert_id];
}

function spj_update_purchase($id, $d, $person) {
    global $wpdb;
    $row = spj_purchase($id, $person);
    if (!$row) return new WP_Error('spj_not_found', 'Položka nebyla nalezena.', ['status' => 404]);

    $v = spj_validate_purchase_input($d);
    if (is_wp_error($v)) return $v;

    $wpdb->update(spj_table('purchases'), $v, ['id' => (int) $row->id],
        ['%d', '%s', '%s', '%d', '%s'], ['%d']);
    return ['ok' => true];
}

function spj_delete_purchase($id, $person) {
    global $wpdb;
    $row = spj_purchase($id, $person);
    if (!$row) return new WP_Error('spj_not_found', 'Položka nebyla nalezena.', ['status' => 404]);

    $wpdb->delete(spj_table('purchases'), ['id' => (int) $row->id], ['%d']);
    return ['ok' => true];
}

/**
 * Odškrtnutí „koupeno".
 *
 * @param string $kind 'reservation' nebo 'purchase'
 */
function spj_set_bought($kind, $id, $bought, $person) {
    global $wpdb;
    $when = $bought ? spj_now() : null;

    if ($kind === 'purchase') {
        $row = spj_purchase($id, $person);
        if (!$row) return new WP_Error('spj_not_found', 'Položka nebyla nalezena.', ['status' => 404]);
        $wpdb->update(spj_table('purchases'), ['bought_at' => $when],
            ['id' => (int) $row->id], ['%s'], ['%d']);
        return ['ok' => true];
    }

    // Rezervaci smí odškrtnout jen ten, kdo ji vytvořil.
    $t   = spj_table('reservations');
    $row = $wpdb->get_row($wpdb->prepare(
        "SELECT * FROM $t WHERE id = %d AND reserver_id = %d", (int) $id, (int) $person->id));
    if (!$row) return new WP_Error('spj_not_found', 'Rezervace nebyla nalezena.', ['status' => 404]);

    $wpdb->update($t, ['bought_at' => $when], ['id' => (int) $row->id], ['%s'], ['%d']);
    return ['ok' => true];
}

/**
 * Nákupní seznam přihlášeného, seskupený po obdarovaných.
 * Nejdřív lidé z rodiny (abecedně), pak volně zapsaná jména.
 */
function spj_shopping_list($person) {
    global $wpdb;
    $gt = spj_table('gifts');
    $rt = spj_table('reservations');
    $pt = spj_table('purchases');

    $groups = [];   // klíč → ['name' =>, 'personId' =>, 'items' => []]

    $key = function ($person_id, $name) {
        return $person_id ? 'p' . (int) $person_id : 'n' . mb_strtolower($name);
    };
    $bucket = function ($k, $name, $person_id) use (&$groups) {
        if (!isset($groups[$k])) {
            $groups[$k] = ['name' => $name, 'personId' => $person_id, 'items' => []];
        }
        return $k;
    };

    // --- 1) rezervované dárky ---
    $rows = $wpdb->get_results($wpdb->prepare(
        "SELECT r.id AS res_id, r.bought_at, g.*
         FROM $rt r INNER JOIN $gt g ON g.id = r.gift_id
         WHERE r.reserver_id = %d
         ORDER BY g.priority DESC, g.name ASC",
        (int) $person->id
    ));
    foreach (($rows ? $rows : []) as $r) {
        $owner = spj_person($r->owner_id);
        $name  = $owner ? $owner->name : '?';
        $k     = $bucket($key($r->owner_id, $name), $name, (int) $r->owner_id);
        $groups[$k]['items'][] = [
            'kind'     => 'reservation',
            'id'       => (int) $r->res_id,
            'giftId'   => (int) $r->id,
            'name'     => $r->name,
            'url'      => $r->url,
            'price'    => $r->price === null ? null : (int) $r->price,
            'note'     => $r->note,
            'image'    => $r->image,
            'priority' => (int) $r->priority,
            'bought'   => !empty($r->bought_at),
        ];
    }

    // --- 2) vlastní položky mimo seznamy ---
    $buys = $wpdb->get_results($wpdb->prepare(
        "SELECT * FROM $pt WHERE buyer_id = %d ORDER BY created_at ASC", (int) $person->id));
    foreach (($buys ? $buys : []) as $b) {
        $target = $b->for_person_id ? spj_person($b->for_person_id) : null;
        $name   = $target ? $target->name : ($b->for_name !== '' ? $b->for_name : 'Bez určení');
        $pid    = $target ? (int) $target->id : null;
        $k      = $bucket($key($pid, $name), $name, $pid);
        $groups[$k]['items'][] = [
            'kind'        => 'purchase',
            'id'          => (int) $b->id,
            'name'        => $b->name,
            'price'       => $b->price === null ? null : (int) $b->price,
            'note'        => $b->note,
            'forPersonId' => $pid,
            'forName'     => $target ? '' : $b->for_name,
            'bought'      => !empty($b->bought_at),
        ];
    }

    // Lidé z rodiny napřed, pak volná jména; obojí abecedně.
    $out = array_values($groups);
    usort($out, function ($a, $b) {
        if (($a['personId'] === null) !== ($b['personId'] === null)) {
            return $a['personId'] === null ? 1 : -1;
        }
        return strcoll($a['name'], $b['name']);
    });
    return $out;
}
