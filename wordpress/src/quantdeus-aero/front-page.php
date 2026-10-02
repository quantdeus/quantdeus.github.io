<?php if (!defined('ABSPATH')) { exit; } get_header(); ?>
<main>
<section class="qd-hero" id="holding"><div class="qd-shell qd-hero-grid">
  <div class="qd-hero-copy">
    <div class="qd-kicker">QuantDeus Holding · WordPress Core</div>
    <h1>Неоновый горизонт</h1>
    <p>Исследования, автоматизация, продукты, медиа и сообщество в едином WordPress-контуре с человеческим контролем и проверяемыми результатами.</p>
    <div class="qd-actions"><a class="qd-btn" href="#services">Оставить заявку</a><a class="qd-btn alt" href="#community">Сообщество</a></div>
    <div class="qd-authline"><span data-auth-state>Гость · можно отправлять заявки без регистрации</span><a class="qd-btn alt qd-auth-cta" href="<?php echo esc_url(home_url('/login/')); ?>" data-guest-only>Войти</a></div>
  </div>
  <figure class="qd-hero-visual">
    <img src="https://eol.jsc.nasa.gov/DatabaseImages/ESC/large/ISS075/ISS075-E-22382.JPG" alt="Земля с Международной космической станции" fetchpriority="high">
    <figcaption>Earth from ISS · NASA/JSC · ISS075-E-22382</figcaption>
  </figure>
</div></section>

<section class="qd-section" id="directions"><div class="qd-shell">
  <div class="qd-section-head"><div><span class="qd-kicker">Портфель</span><h2>Технологии с человеческим смыслом</h2></div><p>Cosmic Frutiger Aero здесь не просто фон: реальная Земля, стекло, вода, неон и живые системы соединяют технологичность с ощущением будущего, в котором хочется жить.</p></div>
  <div class="qd-grid">
    <article class="qd-card qd-card-photo"><div class="qd-photo-wrap"><img src="https://eol.jsc.nasa.gov/DatabaseImages/ESC/large/ISS075/ISS075-E-34867.JPG" alt="Вид Земли с орбиты" loading="lazy"></div><span class="qd-tag">AI</span><h3>Автоматизация</h3><p>Интеграции, AI-агенты, бизнес-процессы и прикладные цифровые системы.</p></article>
    <article class="qd-card"><span class="qd-icon">🛰️</span><span class="qd-tag">R&amp;D</span><h3>Исследования</h3><p>Научные гипотезы, evidence gates, космос, энергия и технологии будущего.</p><div class="qd-mini-orbit"><i></i><b></b><em></em></div></article>
    <article class="qd-card"><span class="qd-icon">🌿</span><span class="qd-tag">Media</span><h3>Культура</h3><p>Креативные проекты, выступления, медиа и эстетика Cosmic Frutiger Aero.</p><div class="qd-bubble-row"><i></i><i></i><i></i></div></article>
  </div>
</div></section>

<section class="qd-section qd-visuals" id="visuals"><div class="qd-shell">
  <div class="qd-section-head">
    <div><span class="qd-kicker">Cosmic Frutiger Aero</span><h2>Земля, вода и орбита</h2></div>
    <p>Живой визуальный слой QuantDeus: зелёные холмы, стекло, пузырьки, вода и реальные виды Земли из космоса.</p>
  </div>
  <div class="qd-visual-grid">
    <figure class="qd-visual qd-visual-wide qd-visual-aero">
      <img src="<?php echo esc_url(get_template_directory_uri().'/aero-world.svg'); ?>" alt="Frutiger Aero мир QuantDeus: зелёные холмы, вода, пузырьки и футуристический город" loading="lazy">
      <figcaption><strong>QuantDeus Aero World</strong><span>Собственная иллюстрация темы</span></figcaption>
    </figure>
    <figure class="qd-visual">
      <img src="https://eol.jsc.nasa.gov/DatabaseImages/ESC/large/ISS023/ISS023-E-58455.JPG" alt="Полярное сияние над Землёй с Международной космической станции" loading="lazy">
      <figcaption><strong>Aurora from ISS</strong><span>NASA/JSC · ISS023-E-58455</span></figcaption>
    </figure>
    <figure class="qd-visual">
      <img src="https://eol.jsc.nasa.gov/DatabaseImages/ESC/large/ISS016/ISS016-E-27586.JPG" alt="Ночной город Земли с Международной космической станции" loading="lazy">
      <figcaption><strong>Earth at night</strong><span>NASA/JSC · ISS016-E-27586</span></figcaption>
    </figure>
    <figure class="qd-visual qd-visual-wide qd-visual-space">
      <img src="<?php echo esc_url(get_template_directory_uri().'/orbital-garden.svg'); ?>" alt="Космический сад QuantDeus с Землёй, астронавтом и Frutiger Aero элементами" loading="lazy">
      <figcaption><strong>Orbital Garden</strong><span>QuantDeus · Frutiger Aero × space</span></figcaption>
    </figure>
  </div>
</div></section>

<section class="qd-section qd-services" id="services"><div class="qd-shell">
  <div class="qd-section-head"><div><span class="qd-kicker">Quote-only</span><h2>Услуги</h2></div><p>Можно оставить заявку без регистрации. Аккаунт нужен только для функций сообщества.</p></div>
  <div class="qd-grid"><?php
  $services=get_posts(['post_type'=>'qd_service','post_status'=>'publish','numberposts'=>20]);
  foreach($services as $s): $sid=get_post_meta($s->ID,'qd_service_id',true) ?: $s->post_name; ?>
    <article class="qd-card qd-service-card"><span class="qd-tag">По запросу</span><h3><?php echo esc_html(get_the_title($s)); ?></h3><p><?php echo esc_html(wp_strip_all_tags($s->post_content)); ?></p><button class="qd-btn" data-service="<?php echo esc_attr($sid); ?>">Оставить заявку</button></article>
  <?php endforeach; ?></div>
  <div class="qd-card qd-inquiry" id="inquiryBox" hidden><h3>Заявка без регистрации</h3><form class="qd-form" id="qdInquiry"><input type="hidden" name="service_id"><textarea name="note" minlength="10" maxlength="1600" required placeholder="Опиши задачу или мероприятие"></textarea><input name="contact" maxlength="320" required placeholder="@telegram, телефон или email"><input name="website" tabindex="-1" autocomplete="off" class="qd-honeypot"><button class="qd-btn" type="submit">Отправить</button><div class="qd-notice" id="qdInquiryStatus">Заявка сохраняется напрямую в WordPress.</div></form></div>
</div></section>

<section class="qd-section" id="ksenia"><div class="qd-shell">
  <div class="qd-feature">
    <div class="qd-feature-copy"><span class="qd-kicker">Artist / Booking</span><h2>Ксения Чередникова</h2><p>Концертный и медиа-раздел управляется из WordPress: биография, фото, ссылки, видео и заявки на выступления остаются редактируемыми из CMS и добавляются только из подтверждённых источников.</p><button class="qd-btn" data-service="ksenia-cherednikova-concert">Запросить выступление</button></div>
    <div class="qd-feature-art" aria-label="Медиа-раздел Ксении Чередниковой"><div class="qd-vinyl"></div><div class="qd-glass-note">MEDIA<br>LIVE<br>BOOKING</div></div>
  </div>
</div></section>

<section class="qd-section" id="community"><div class="qd-shell">
  <div class="qd-section-head"><div><span class="qd-kicker">Identity</span><h2>Сообщество и роли</h2></div><p>Telegram — вход для участников. Модераторы получают отдельную роль. WordPress Admin доступен только после проверки admin-права в каноническом GitHub-репозитории.</p></div>
  <div class="qd-role-grid">
    <article class="qd-role"><strong>01</strong><h3>Пользователь</h3><p>Telegram identity · форум · заявки · сообщество.</p></article>
    <article class="qd-role"><strong>02</strong><h3>Модератор</h3><p>Модерация сообщества без доступа к системной админке.</p></article>
    <article class="qd-role"><strong>03</strong><h3>Админ</h3><p>Только GitHub repo permission = admin.</p></article>
  </div>
  <div class="qd-community-actions"><a class="qd-btn alt" href="<?php echo esc_url(home_url('/forum/')); ?>">Открыть форум</a><a class="qd-btn alt" href="<?php echo esc_url(home_url('/login/')); ?>">Войти</a></div>
</div></section>
</main>
<?php get_footer(); ?>