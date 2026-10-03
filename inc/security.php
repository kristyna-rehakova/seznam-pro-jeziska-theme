<?php
/**
 * Seznam pro Ježíška – zamčení WordPressu
 *
 * Aplikace je soukromá a běžní členové rodiny nemají co dělat v administraci.
 * Hlavně ale: WordPress ve výchozím stavu vystavuje přes REST API uživatele
 * a obsah i nepřihlášeným. To by u aplikace postavené na utajení rezervací
 * byla díra, takže se to tady zavírá.
 */
if (!defined('ABSPATH')) exit;

/** Běžný člen rodiny se do /wp-admin nedostane. */
function spj_block_admin_area() {
    if (!is_admin() || wp_doing_ajax()) return;
    if (!is_user_logged_in()) return;
    if (current_user_can('manage_options')) return;
    wp_safe_redirect(home_url('/'));
    exit;
}
add_action('admin_init', 'spj_block_admin_area');

/** Horní lišta WordPressu jen pro správce. */
function spj_hide_admin_bar() {
    if (!current_user_can('manage_options')) {
        show_admin_bar(false);
    }
}
add_action('after_setup_theme', 'spj_hide_admin_bar');

/**
 * REST API: nepřihlášenému projde jen přihlášení a žádost o nové heslo.
 * Všechno ostatní (včetně /wp/v2/users a /wp/v2/posts) je zavřené.
 */
function spj_restrict_rest($result) {
    if (!empty($result)) return $result;
    if (is_user_logged_in()) return $result;

    $route = isset($GLOBALS['wp']->query_vars['rest_route'])
        ? (string) $GLOBALS['wp']->query_vars['rest_route'] : '';

    // Celá aplikace jde přes jediný endpoint; kdo se kam dostane, rozhoduje
    // rozcestník v inc/api.php podle konkrétní akce (spj_public_actions).
    if (strpos($route, '/jezisek/v1/call') === 0) return $result;

    return new WP_Error(
        'spj_rest_forbidden',
        'Nejste přihlášeni.',
        ['status' => 401]
    );
}
add_filter('rest_authentication_errors', 'spj_restrict_rest');

/** Seznam uživatelů přes REST jen pro správce (dvojitá pojistka). */
function spj_hide_users_endpoint($result, $server, $request) {
    if (strpos((string) $request->get_route(), '/wp/v2/users') === 0
        && !current_user_can('list_users')) {
        return new WP_Error('spj_rest_forbidden', 'Nemáte oprávnění.', ['status' => 403]);
    }
    return $result;
}
add_filter('rest_pre_dispatch', 'spj_hide_users_endpoint', 10, 3);

/** XML-RPC je k ničemu a je to oblíbený cíl hádání hesel. */
add_filter('xmlrpc_enabled', '__return_false');

/** Zákaz zjišťování uživatelských jmen přes ?author=1. */
function spj_block_author_enumeration() {
    if (!is_admin() && isset($_GET['author']) && !is_user_logged_in()) {
        wp_safe_redirect(home_url('/'), 301);
        exit;
    }
}
add_action('template_redirect', 'spj_block_author_enumeration');

/** Ať přihlašovací stránka neprozrazuje, jestli e-mail existuje. */
function spj_generic_login_error($error) {
    if (is_wp_error($error) && $error->get_error_code()) {
        return new WP_Error('spj_login_failed', 'Nesprávný e-mail nebo heslo.');
    }
    return $error;
}
add_filter('wp_login_errors', 'spj_generic_login_error');

/** Vlastní favicon (stromeček) místo výchozího „W". */
function spj_favicon_tag() {
    $svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
         . '<text x="50%" y="52%" dominant-baseline="central" text-anchor="middle" font-size="54">🎄</text></svg>';
    echo '<link rel="icon" href="data:image/svg+xml,' . rawurlencode($svg) . '">' . "\n";
}
add_action('wp_head', 'spj_favicon_tag');
add_action('login_head', 'spj_favicon_tag');
add_action('admin_head', 'spj_favicon_tag');
