<?php
/**
 * Seznam pro Ježíška – theme setup
 */
if (!defined('ABSPATH')) exit;

define('SPJ_VERSION', '0.3.0');

function spj_setup() {
    add_theme_support('title-tag');
    add_theme_support('html5', ['style', 'script']);
    // Celý web je jedna aplikace – komentáře, feedy ani emoji skripty netřeba.
    remove_action('wp_head', 'print_emoji_detection_script', 7);
    remove_action('wp_print_styles', 'print_emoji_styles');
    remove_action('wp_head', 'wp_generator');
    remove_action('wp_head', 'rsd_link');
    remove_action('wp_head', 'wlwmanifest_link');
}
add_action('after_setup_theme', 'spj_setup');

/**
 * Styl a skripty. Pořadí je důležité: api.js definuje window.Api, které
 * views.js a app.js používají – stejně jako v prototypu server.js.
 */
function spj_assets() {
    $dir = get_template_directory_uri();

    wp_enqueue_style('seznam-pro-jeziska', get_stylesheet_uri(), [], SPJ_VERSION);

    wp_enqueue_script('spj-api',   $dir . '/assets/api.js',   [],            SPJ_VERSION, true);
    wp_enqueue_script('spj-views', $dir . '/assets/views.js', ['spj-api'],   SPJ_VERSION, true);
    wp_enqueue_script('spj-app',   $dir . '/assets/app.js',   ['spj-views'], SPJ_VERSION, true);

    wp_localize_script('spj-api', 'SPJ', [
        'rest'      => esc_url_raw(rest_url('jezisek/v1/')),
        'nonce'     => wp_create_nonce('wp_rest'),
        'loggedIn'  => is_user_logged_in(),
        'lostPwUrl' => wp_lostpassword_url(),
    ]);
}
add_action('wp_enqueue_scripts', 'spj_assets');

/**
 * Po každé změně verze šablony vyprázdní PHP OPcache – jinak server může
 * po aktualizaci přes Git Updater držet starou podobu souborů.
 */
add_action('init', function () {
    if (get_option('spj_opcache_ver') === SPJ_VERSION) return;
    if (function_exists('opcache_reset')) @opcache_reset();
    if (function_exists('wp_cache_flush')) wp_cache_flush();
    update_option('spj_opcache_ver', SPJ_VERSION);
}, 1);

require get_template_directory() . '/inc/db.php';
require get_template_directory() . '/inc/people.php';
require get_template_directory() . '/inc/reservations.php';
require get_template_directory() . '/inc/gifts.php';
require get_template_directory() . '/inc/mail.php';
require get_template_directory() . '/inc/security.php';
require get_template_directory() . '/inc/link-preview.php';
require get_template_directory() . '/inc/admin.php';
require get_template_directory() . '/inc/api.php';
