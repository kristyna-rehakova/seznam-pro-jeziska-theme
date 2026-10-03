<?php
/**
 * Seznam pro Ježíška – dárky
 *
 * ===================================================================
 *  SRDCE OCHRANY REZERVACÍ
 * ===================================================================
 * Dárek smí opustit server výhradně funkcí spj_gift_dto().
 *
 *   vlastní dárek  → klíče 'reserved'/'reservedByMe' v odpovědi VŮBEC
 *                    NEEXISTUJÍ (ne false, ne null – prostě nejsou).
 *                    Platí i pro administrátora u jeho vlastních dárků.
 *   cizí dárek     → jen reserved (true/false) + reservedByMe pro vlastní
 *                    rezervaci. Identita rezervujícího neodchází nikdy.
 *
 * Žádná jiná funkce nesmí posílat klientovi řádek z tabulky dárků.
 */
if (!defined('ABSPATH')) exit;

/** Načte dárek podle id. */
function spj_gift($id) {
    global $wpdb;
    $t = spj_table('gifts');
    return $wpdb->get_row($wpdb->prepare("SELECT * FROM $t WHERE id = %d", (int) $id));
}

/**
 * Jediná povolená cesta dárku ven.
 *
 * @param object $g      řádek z tabulky dárků
 * @param object $viewer profil toho, kdo se dívá
 */
function spj_gift_dto($g, $viewer) {
    $dto = [
        'id'       => (int) $g->id,
        'ownerId'  => (int) $g->owner_id,
        'name'     => $g->name,
        'url'      => $g->url,
        'priority' => (int) $g->priority,
        'price'    => $g->price === null ? null : (int) $g->price,
        'image'    => $g->image,
        'note'     => $g->note,
    ];

    // Vlastníkovi se o rezervaci nedostane vůbec nic.
    if ((int) $g->owner_id === (int) $viewer->id) {
        return $dto;
    }

    $r = spj_reservation_of($g->id);
    $dto['reserved']     = (bool) $r;
    $dto['reservedByMe'] = $r && (int) $r->reserver_id === (int) $viewer->id;
    return $dto;
}

/** Seznam dárků daného vlastníka, seřazený jako v prototypu. */
function spj_gifts_of($owner_id) {
    global $wpdb;
    $t = spj_table('gifts');
    $rows = $wpdb->get_results($wpdb->prepare(
        "SELECT * FROM $t WHERE owner_id = %d ORDER BY priority DESC, name ASC",
        (int) $owner_id
    ));
    return $rows ? $rows : [];
}

/* ------------------------------------------------------------------
   Validace vstupů. Klientská validace je jen kosmetika, rozhoduje tahle.
   ------------------------------------------------------------------ */

/** @return array|WP_Error */
function spj_validate_gift_input($d) {
    $name = trim((string) ($d['name'] ?? ''));
    if ($name === '')       return new WP_Error('spj_invalid', 'Vyplň: Název.', ['status' => 400]);
    if (mb_strlen($name) > 120) return new WP_Error('spj_invalid', 'Název je příliš dlouhý (max 120 znaků).', ['status' => 400]);

    $url = trim((string) ($d['url'] ?? ''));
    if ($url !== '') {
        if (mb_strlen($url) > 500) return new WP_Error('spj_invalid', 'Odkaz je příliš dlouhý.', ['status' => 400]);
        if (!preg_match('#^https?://.+#i', $url)) {
            return new WP_Error('spj_invalid', 'Odkaz musí začínat http:// nebo https://.', ['status' => 400]);
        }
        $url = esc_url_raw($url);
    }

    $priority = (int) ($d['priority'] ?? 0);
    if ($priority < 1 || $priority > 3) {
        return new WP_Error('spj_invalid', 'Priorita musí být 1–3 hvězdičky.', ['status' => 400]);
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

    $note = trim((string) ($d['note'] ?? ''));
    if (mb_strlen($note) > 500) {
        return new WP_Error('spj_invalid', 'Poznámka je příliš dlouhá (max 500 znaků).', ['status' => 400]);
    }

    // Obrázek: buď už uložená adresa z našich uploadů, nebo nový data: URL.
    $image = (string) ($d['image'] ?? '');
    if ($image !== '' && strpos($image, 'data:') === 0) {
        $stored = spj_store_image($image);
        if (is_wp_error($stored)) return $stored;
        $image = $stored;
    } elseif ($image !== '' && !preg_match('#^https?://#i', $image)) {
        $image = '';
    }

    return [
        'name'     => sanitize_text_field($name),
        'url'      => $url,
        'priority' => $priority,
        'price'    => $price,
        'image'    => $image,
        'note'     => sanitize_textarea_field($note),
    ];
}

/**
 * Uloží obrázek poslaný jako data: URL do složky uploads a vrátí jeho adresu.
 * Klient posílá JPEG zmenšený na 900 px, takže se sem nic velkého nedostane.
 */
function spj_store_image($data_url) {
    if (!preg_match('#^data:image/(jpeg|png|webp);base64,#i', $data_url, $m)) {
        return new WP_Error('spj_invalid', 'Nepodporovaný formát obrázku.', ['status' => 400]);
    }
    $ext    = strtolower($m[1]) === 'jpeg' ? 'jpg' : strtolower($m[1]);
    $base64 = substr($data_url, strlen($m[0]));
    $bytes  = base64_decode($base64, true);

    if ($bytes === false) {
        return new WP_Error('spj_invalid', 'Obrázek se nepodařilo načíst.', ['status' => 400]);
    }
    if (strlen($bytes) > 3 * 1024 * 1024) {
        return new WP_Error('spj_invalid', 'Obrázek je příliš velký.', ['status' => 400]);
    }
    // Ověříme, že to opravdu je obrázek, ne jen přejmenovaný soubor.
    $info = @getimagesizefromstring($bytes);
    if ($info === false) {
        return new WP_Error('spj_invalid', 'Soubor není platný obrázek.', ['status' => 400]);
    }

    $name   = 'darek-' . wp_generate_password(12, false, false) . '.' . $ext;
    $upload = wp_upload_bits($name, null, $bytes);
    if (!empty($upload['error'])) {
        return new WP_Error('spj_upload', 'Obrázek se nepodařilo uložit.', ['status' => 500]);
    }
    return esc_url_raw($upload['url']);
}

/* ------------------------------------------------------------------
   Operace
   ------------------------------------------------------------------ */

/** Vytvoří dárek pro daného vlastníka. Oprávnění se ověřuje tady. */
function spj_create_gift($owner_id, $d, $person) {
    global $wpdb;
    if (!spj_can_manage_gifts_of($owner_id, $person)) {
        return new WP_Error('spj_forbidden', 'K tomuto seznamu nemáte přístup.', ['status' => 403]);
    }
    $v = spj_validate_gift_input($d);
    if (is_wp_error($v)) return $v;

    $now = spj_now();
    $wpdb->insert(spj_table('gifts'), array_merge($v, [
        'owner_id'   => (int) $owner_id,
        'created_at' => $now,
        'updated_at' => $now,
    ]), ['%s', '%s', '%d', '%d', '%s', '%s', '%d', '%s', '%s']);

    $g = spj_gift($wpdb->insert_id);
    return spj_gift_dto($g, $person);
}

/** Úprava dárku. Rezervujícímu odejde e-mail – vlastník se to nedozví. */
function spj_update_gift($id, $d, $person) {
    global $wpdb;
    $g = spj_gift($id);
    if (!$g) return new WP_Error('spj_not_found', 'Dárek nebyl nalezen.', ['status' => 404]);
    if (!spj_can_manage_gifts_of($g->owner_id, $person)) {
        return new WP_Error('spj_forbidden', 'K tomuto dárku nemáte přístup.', ['status' => 403]);
    }
    $v = spj_validate_gift_input($d);
    if (is_wp_error($v)) return $v;

    $wpdb->update(spj_table('gifts'), array_merge($v, ['updated_at' => spj_now()]),
        ['id' => (int) $g->id],
        ['%s', '%s', '%d', '%d', '%s', '%s', '%s'], ['%d']);

    $fresh = spj_gift($g->id);
    spj_mail_reserver_about_edit($fresh);

    // Odpověď je stejná bez ohledu na to, jestli e-mail odešel.
    return spj_gift_dto($fresh, $person);
}

/** Smazání dárku. Rezervujícímu odejde e-mail ještě před zahozením rezervace. */
function spj_delete_gift($id, $person) {
    global $wpdb;
    $g = spj_gift($id);
    if (!$g) return new WP_Error('spj_not_found', 'Dárek nebyl nalezen.', ['status' => 404]);
    if (!spj_can_manage_gifts_of($g->owner_id, $person)) {
        return new WP_Error('spj_forbidden', 'K tomuto dárku nemáte přístup.', ['status' => 403]);
    }

    spj_mail_reserver_about_delete($g);
    $wpdb->delete(spj_table('reservations'), ['gift_id' => (int) $g->id], ['%d']);
    $wpdb->delete(spj_table('gifts'), ['id' => (int) $g->id], ['%d']);

    return ['ok' => true];
}
