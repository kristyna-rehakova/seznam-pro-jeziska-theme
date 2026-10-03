<?php
/**
 * Seznam pro Ježíška – e-maily
 *
 * Posílá se přes wp_mail(). Adresáta zná jen tenhle soubor – vlastník
 * dárku se nikdy nedozví, že nějaký e-mail odešel, ani komu.
 */
if (!defined('ABSPATH')) exit;

/** E-mail člověka, nebo prázdno (dětské profily e-mail nemají). */
function spj_person_email($person_id) {
    $p = spj_person($person_id);
    if (!$p || !$p->wp_user_id) return '';
    $u = get_userdata($p->wp_user_id);
    return $u ? $u->user_email : '';
}

/** Odeslání s jednotnou hlavičkou. Chybu jen zalogujeme, akce proběhne dál. */
function spj_send_mail($to, $subject, $body) {
    if (!$to) return false;
    $headers = ['Content-Type: text/plain; charset=UTF-8'];
    $sent = wp_mail($to, $subject, $body, $headers);
    if (!$sent && defined('WP_DEBUG') && WP_DEBUG) {
        error_log('[Seznam pro Ježíška] E-mail se nepodařilo odeslat: ' . $subject);
    }
    return $sent;
}

/**
 * Nový účet. Heslo se e-mailem zásadně neposílá — předá ho ten, kdo účet
 * zakládal. Dětské profily e-mail nemají, takže se jich to netýká.
 */
function spj_mail_new_account($wp_user_id) {
    $u = get_userdata($wp_user_id);
    if (!$u || !$u->user_email) return;

    spj_send_mail(
        $u->user_email,
        'Máš účet v Seznamu pro Ježíška 🎄',
        "Ahojky,\n\n" .
        "v rodinném seznamu vánočních dárků ti byl vytvořen účet.\n\n" .
        "Adresa: " . home_url('/') . "\n" .
        "Přihlašovací e-mail: {$u->user_email}\n\n" .
        "Heslo ti předá Kikuš, z bezpečnostních důvodů ho e-mailem neposíláme. " .
        "Po prvním přihlášení si ho změň.\n\n" .
        "Pak si můžeš přidat svoje přání a podívat se, co si přejí ostatní.\n\n" .
        "Ježíšek 🎄"
    );
}

/** Vlastník upravil dárek, který má někdo rezervovaný. */
function spj_mail_reserver_about_edit($gift) {
    $r = spj_reservation_of($gift->id);
    if (!$r) return;
    $to = spj_person_email($r->reserver_id);
    if (!$to) return;

    spj_send_mail(
        $to,
        'Rezervovaný dárek byl upraven',
        "Dobrý den,\n\n" .
        "dárek „{$gift->name}“, který máte rezervovaný, byl upraven. " .
        "Zkontrolujte si prosím aktuální údaje v aplikaci Seznam pro Ježíška.\n\n" .
        home_url('/') . "\n\n🎄"
    );
}

/** Vlastník smaže dárek, který má někdo rezervovaný. */
function spj_mail_reserver_about_delete($gift) {
    $r = spj_reservation_of($gift->id);
    if (!$r) return;
    $to = spj_person_email($r->reserver_id);
    if (!$to) return;

    spj_send_mail(
        $to,
        'Rezervovaný dárek byl odstraněn',
        "Dobrý den,\n\n" .
        "dárek „{$gift->name}“, který jste měli rezervovaný, byl odstraněn ze seznamu.\n\n" .
        home_url('/') . "\n\n🎄"
    );
}

/* Jméno a adresu odesílatele téma schválně nenastavuje — řeší to plugin
   WP Change Email Sender. Kdyby téma sahalo na filtr wp_mail_from_name,
   potichu by přebilo, co je nastavené tam. */
