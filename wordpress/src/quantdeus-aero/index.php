<?php
if (!defined('ABSPATH')) { exit; }
?><!doctype html>
<html <?php language_attributes(); ?>>
<head>
  <meta charset="<?php bloginfo('charset'); ?>">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>
<main class="qd-shell qd-section">
  <?php if (have_posts()) : while (have_posts()) : the_post(); ?>
    <article class="qd-card">
      <h1><?php the_title(); ?></h1>
      <?php the_content(); ?>
    </article>
  <?php endwhile; else : ?>
    <article class="qd-card"><h1>QuantDeus</h1><p>WordPress canonical runtime.</p></article>
  <?php endif; ?>
</main>
<?php wp_footer(); ?>
</body>
</html>
