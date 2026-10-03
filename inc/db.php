<?php
/**
 * Seznam pro Ježíška – databáze
 *
 * Vlastní tabulky, NE custom post types. Důvod je ten hlavní požadavek
 * aplikace: WordPress svoje příspěvky a jejich meta vystavuje přes REST API
 * (/wp-json/wp/v2/...). Kdyby dárky a rezervace byly příspěvky, dala by se
 * informace o rezervaci vytáhnout mimo náš kód. Takhle vede ven jediná
 * cesta – funkce v inc/gifts.php.
 */
if (!defined('ABSPATH')) exit;

define('SPJ_DB_VERSION', '1');

/** Názvy tabulek (s prefixem instalace). */
function spj_table($name) {
    global $wpdb;
    return $wpdb->prefix . 'jezisek_' . $name;
}

/** Skupiny v rodině. Pevné pořadí = pořadí sekcí na stránce Rodina. */
function spj_family_groups() {
    return apply_filters('spj_family_groups', [
        'Rodiče+', 'Řehákovi', 'Zadinovi', 'Pecháčkovi',
    ]);
}

/**
 * Vytvoření a aktualizace schématu. Volá se při aktivaci tématu a pak při
 * každém načtení, pokud se změní SPJ_DB_VERSION.
 */
function spj_install_tables() {
    global $wpdb;
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';

    $charset = $wpdb->get_charset_collate();
    $people  = spj_table('people');
    $gifts   = spj_table('gifts');
    $res     = spj_table('reservations');

    // Pozor: dbDelta je háklivý na formát – dvě mezery za PRIMARY KEY,
    // klíče jako KEY (ne INDEX), typy malými písmeny.
    $sql = "CREATE TABLE $people (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        wp_user_id bigint(20) unsigned DEFAULT NULL,
        kind varchar(10) NOT NULL DEFAULT 'account',
        name varchar(60) NOT NULL,
        avatar varchar(255) NOT NULL DEFAULT '',
        family_group varchar(40) NOT NULL DEFAULT '',
        guardian_id bigint(20) unsigned DEFAULT NULL,
        created_at datetime NOT NULL,
        PRIMARY KEY  (id),
        UNIQUE KEY wp_user_id (wp_user_id),
        KEY guardian_id (guardian_id)
    ) $charset;

    CREATE TABLE $gifts (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        owner_id bigint(20) unsigned NOT NULL,
        name varchar(120) NOT NULL,
        url varchar(500) NOT NULL DEFAULT '',
        priority tinyint(3) unsigned NOT NULL DEFAULT 2,
        price int(10) unsigned DEFAULT NULL,
        image varchar(500) NOT NULL DEFAULT '',
        note varchar(500) NOT NULL DEFAULT '',
        created_at datetime NOT NULL,
        updated_at datetime NOT NULL,
        PRIMARY KEY  (id),
        KEY owner_id (owner_id)
    ) $charset;

    CREATE TABLE $res (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        gift_id bigint(20) unsigned NOT NULL,
        reserver_id bigint(20) unsigned NOT NULL,
        created_at datetime NOT NULL,
        PRIMARY KEY  (id),
        UNIQUE KEY gift_id (gift_id),
        KEY reserver_id (reserver_id)
    ) $charset;";

    dbDelta($sql);
    update_option('spj_db_version', SPJ_DB_VERSION);
}

/** Doinstaluje tabulky, když se změní verze schématu (i po Git Updateru). */
function spj_maybe_install() {
    if (get_option('spj_db_version') !== SPJ_DB_VERSION) {
        spj_install_tables();
    }
}
add_action('after_switch_theme', 'spj_install_tables');
add_action('admin_init', 'spj_maybe_install');

/** Aktuální čas ve formátu pro DATETIME sloupce. */
function spj_now() {
    return current_time('mysql');
}
