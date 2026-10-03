<?php
/**
 * Seznam pro Ježíška – jediná šablona.
 *
 * Celá aplikace se vykresluje z JavaScriptu, server posílá jen prázdnou
 * kostru. Žádná data se do stránky nevypisují – všechno jde přes API,
 * které hlídá, co kdo smí vidět.
 */
if (!defined('ABSPATH')) exit;
?><!doctype html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo('charset'); ?>">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>

<div id="app"></div>
<div id="modalRoot"></div>
<div id="toastRoot"></div>

<noscript>
  <div style="max-width:420px;margin:60px auto;padding:24px;text-align:center;
              border:1px solid #EDE5DC;border-radius:18px">
    <div style="font-size:2rem">🎄</div>
    <h1 style="font-family:Georgia,serif;color:#9B1B30">Seznam pro Ježíška</h1>
    <p style="color:#6D7482">Aplikace potřebuje zapnutý JavaScript.</p>
  </div>
</noscript>

<?php wp_footer(); ?>
</body>
</html>
