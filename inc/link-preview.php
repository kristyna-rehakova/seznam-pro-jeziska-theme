<?php
/**
 * Seznam pro Ježíška – načtení názvu, ceny a obrázku z odkazu
 *
 * Z prohlížeče to nejde (CORS), takže to dělá server. Pořadí spolehlivosti:
 *   1) JSON-LD  <script type="application/ld+json">  → Product.offers.price
 *   2) microdata itemprop="price"
 *   3) Open Graph og:price:amount / og:title / og:image
 *
 * Ochrana proti SSRF: povolíme jen http(s), jméno si rozřešíme na IP a
 * zahodíme všechny neveřejné rozsahy – jinak by šlo přes tenhle endpoint
 * šťourat do vnitřní sítě hostingu.
 */
if (!defined('ABSPATH')) exit;

function spj_act_link_preview($a) {
    $url = trim((string) ($a[0] ?? ''));
    if ($url === '' || !preg_match('#^https?://#i', $url)) {
        return new WP_Error('spj_invalid', 'Odkaz musí začínat http:// nebo https://.', ['status' => 400]);
    }

    $parts = wp_parse_url($url);
    $host  = isset($parts['host']) ? $parts['host'] : '';
    if (!$host || !spj_host_is_public($host)) {
        return new WP_Error('spj_invalid', 'Tento odkaz načíst nelze.', ['status' => 400]);
    }

    $res = wp_safe_remote_get($url, [
        'timeout'     => 6,
        'redirection' => 3,
        'user-agent'  => 'Mozilla/5.0 (compatible; SeznamProJeziska/1.0)',
        'headers'     => ['Accept' => 'text/html,application/xhtml+xml'],
    ]);
    if (is_wp_error($res)) {
        return ['title' => '', 'price' => null, 'image' => '',
                'note'  => 'Stránku se nepodařilo načíst. Vyplň údaje prosím ručně.'];
    }

    $code = (int) wp_remote_retrieve_response_code($res);
    $html = (string) wp_remote_retrieve_body($res);

    // Velké e-shopy (Alza, Notino, Lego, Mall…) mají ochranu, která chce
    // spuštěný JavaScript. Serverové stažení stránky to z principu neobejde.
    $challenged = (bool) preg_match(
        '#cf-browser-verification|challenge-platform|Just a moment|captcha#i', $html);

    if ($code >= 400 || $html === '' || $challenged) {
        return ['title' => '', 'price' => null, 'image' => '',
                'note'  => 'Obchod ' . ($host ? $host . ' ' : '') . 'automatické načtení ' .
                           'blokuje. Vyplň údaje ručně — obrázek můžeš na stránce obchodu ' .
                           'zkopírovat a vložit sem přes Ctrl+V.'];
    }
    $html = substr($html, 0, 2 * 1024 * 1024);

    $title = spj_extract_title($html);
    $price = spj_extract_price($html);
    $image = spj_extract_image($html, $url);

    $note = ($title === '' && $price === null && $image === '')
        ? 'Z odkazu se nepodařilo nic vytáhnout. Vyplň údaje prosím ručně.' : '';

    return ['title' => $title, 'price' => $price, 'image' => $image, 'note' => $note];
}

/** Zahodí localhost a privátní rozsahy (ochrana proti SSRF). */
function spj_host_is_public($host) {
    $host = strtolower($host);
    if ($host === 'localhost' || substr($host, -6) === '.local') return false;

    $ips = [];
    if (filter_var($host, FILTER_VALIDATE_IP)) {
        $ips[] = $host;
    } else {
        $records = @dns_get_record($host, DNS_A | DNS_AAAA);
        foreach (($records ? $records : []) as $r) {
            if (!empty($r['ip']))   $ips[] = $r['ip'];
            if (!empty($r['ipv6'])) $ips[] = $r['ipv6'];
        }
        if (!$ips) {
            $resolved = gethostbyname($host);
            if ($resolved && $resolved !== $host) $ips[] = $resolved;
        }
    }
    if (!$ips) return false;

    foreach ($ips as $ip) {
        $public = filter_var($ip, FILTER_VALIDATE_IP,
            FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE);
        if (!$public) return false;
    }
    return true;
}

/** Všechny JSON-LD bloky ze stránky jako pole. */
function spj_json_ld_blocks($html) {
    $out = [];
    if (!preg_match_all(
        '#<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>#is',
        $html, $m)) {
        return $out;
    }
    foreach ($m[1] as $raw) {
        $data = json_decode(trim($raw), true);
        if (is_array($data)) $out[] = $data;
    }
    return $out;
}

/** Projde JSON-LD do hloubky a vrátí první hodnotu daného klíče. */
function spj_json_ld_find($data, $key, $depth = 0) {
    if ($depth > 6 || !is_array($data)) return null;
    foreach ($data as $k => $v) {
        if (is_string($k) && strcasecmp($k, $key) === 0 && (is_string($v) || is_numeric($v))) {
            return $v;
        }
        if (is_array($v)) {
            $found = spj_json_ld_find($v, $key, $depth + 1);
            if ($found !== null) return $found;
        }
    }
    return null;
}

function spj_extract_title($html) {
    foreach (spj_json_ld_blocks($html) as $block) {
        $name = spj_json_ld_find($block, 'name');
        if ($name) return spj_clean_text((string) $name, 120);
    }
    if (preg_match('#<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)#i', $html, $m)) {
        return spj_clean_text($m[1], 120);
    }
    if (preg_match('#<title[^>]*>(.*?)</title>#is', $html, $m)) {
        return spj_clean_text($m[1], 120);
    }
    return '';
}

function spj_extract_price($html) {
    foreach (spj_json_ld_blocks($html) as $block) {
        $price = spj_json_ld_find($block, 'price');
        if ($price !== null) {
            $n = spj_normalize_price((string) $price);
            if ($n !== null) return $n;
        }
    }
    if (preg_match('#itemprop=["\']price["\'][^>]+content=["\']([^"\']+)#i', $html, $m)) {
        $n = spj_normalize_price($m[1]);
        if ($n !== null) return $n;
    }
    if (preg_match('#<meta[^>]+property=["\']og:price:amount["\'][^>]+content=["\']([^"\']+)#i', $html, $m)) {
        $n = spj_normalize_price($m[1]);
        if ($n !== null) return $n;
    }
    return null;
}

function spj_extract_image($html, $base) {
    $src = '';
    if (preg_match('#<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)#i', $html, $m)) {
        $src = $m[1];
    } else {
        foreach (spj_json_ld_blocks($html) as $block) {
            $img = spj_json_ld_find($block, 'image');
            if ($img) { $src = (string) $img; break; }
        }
    }
    if (!$src) return '';

    $src = html_entity_decode($src, ENT_QUOTES, 'UTF-8');
    if (strpos($src, '//') === 0) {
        $src = 'https:' . $src;
    } elseif (strpos($src, 'http') !== 0) {
        $p = wp_parse_url($base);
        if (empty($p['scheme']) || empty($p['host'])) return '';
        $src = $p['scheme'] . '://' . $p['host'] . '/' . ltrim($src, '/');
    }
    $host = wp_parse_url($src, PHP_URL_HOST);
    if (!$host || !spj_host_is_public($host)) return '';

    return spj_download_image($src);
}

/** Stáhne obrázek k nám, ať se po smazání z e-shopu neztratí. */
function spj_download_image($src) {
    $res = wp_safe_remote_get($src, ['timeout' => 8, 'redirection' => 2]);
    if (is_wp_error($res)) return '';
    if ((int) wp_remote_retrieve_response_code($res) >= 400) return '';

    $bytes = (string) wp_remote_retrieve_body($res);
    if ($bytes === '' || strlen($bytes) > 5 * 1024 * 1024) return '';

    $info = @getimagesizefromstring($bytes);
    if ($info === false) return '';

    $map = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp'];
    if (!isset($map[$info[2]])) return '';

    $name   = 'darek-' . wp_generate_password(12, false, false) . '.' . $map[$info[2]];
    $upload = wp_upload_bits($name, null, $bytes);
    if (!empty($upload['error'])) return '';

    return esc_url_raw($upload['url']);
}

/** „1 790,00 Kč" → 1790 */
function spj_normalize_price($raw) {
    $s = html_entity_decode((string) $raw, ENT_QUOTES, 'UTF-8');
    $s = str_replace(["\xc2\xa0", ' ', 'Kč', 'CZK', 'czk'], '', $s);
    $s = str_replace(',', '.', $s);
    if (!preg_match('#-?\d+(\.\d+)?#', $s, $m)) return null;

    $n = (int) round((float) $m[0]);
    if ($n < 0 || $n > 10000000) return null;
    return $n;
}

function spj_clean_text($s, $max) {
    $s = html_entity_decode(strip_tags((string) $s), ENT_QUOTES, 'UTF-8');
    $s = trim(preg_replace('#\s+#u', ' ', $s));
    return mb_substr($s, 0, $max);
}
