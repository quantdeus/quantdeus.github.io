<footer>
  <div class="qd-shell qd-footer">
    <div class="qd-footer-brand">
      <?php if (has_custom_logo()): the_custom_logo(); else: ?>
        <a class="qd-brand qd-brand-text" href="<?php echo esc_url(home_url('/')); ?>"><span class="qd-brand-orb" aria-hidden="true">◉</span><span><strong>QuantDeus</strong><small>NEON HORIZON</small></span></a>
      <?php endif; ?>
    </div>
    <div>WordPress 7.1.2 native runtime · Media Library · GitHub staff permissions · Telegram community identity</div>
    <small>QuantDeus · Neon Horizon · Federation Portal</small>
  </div>
</footer>
<?php wp_footer(); ?>
</body>
</html>
