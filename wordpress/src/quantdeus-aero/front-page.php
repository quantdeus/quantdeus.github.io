<?php
if (!defined('ABSPATH')) { exit; }
get_header();
$qd_count = static function(string $type): int {
    $count=wp_count_posts($type);
    return (int)($count->publish ?? 0);
};
$qd_archive = static function(string $type, string $fallback): string {
    return get_post_type_archive_link($type) ?: home_url($fallback);
};
$node_count=$qd_count('qd_node');
$project_count=$qd_count('qd_project');
$research_count=$qd_count('qd_research');
$artifact_count=$qd_count('qd_artifact');
$result_count=$qd_count('qd_result');
$forum_count=$qd_count('qd_forum_thread');
?>
<main>
<section class="qd-hero qd-portal-hero" id="quantdeus"><div class="qd-shell qd-hero-grid">
  <div class="qd-hero-copy">
    <div class="qd-kicker">QUANTDEUS // NEON HORIZON v4 · Federation Portal</div>
    <h1>Операционная система Неонового Горизонта</h1>
    <p>Федерация автономных узлов, исследования, проекты, AI Fleet, открытые артефакты, сообщество и продукты — в одном WordPress-портале с принципом <strong>Evidence Before Narrative</strong>.</p>
    <div class="qd-actions">
      <a class="qd-btn" href="#state">Состояние системы</a>
      <a class="qd-btn alt" href="<?php echo esc_url($qd_archive('qd_node','/federation/nodes/')); ?>">Federation Nodes</a>
    </div>
    <div class="qd-authline"><span data-auth-state>Гость · можно отправлять заявки без регистрации</span><a class="qd-btn alt qd-auth-cta" href="<?php echo esc_url(home_url('/login/')); ?>" data-guest-only>Войти</a></div>
  </div>
  <figure class="qd-hero-visual">
    <img src="https://eol.jsc.nasa.gov/DatabaseImages/ESC/large/ISS075/ISS075-E-22382.JPG" alt="Земля с Международной космической станции" fetchpriority="high">
    <figcaption>Earth from ISS · NASA/JSC · ISS075-E-22382</figcaption>
  </figure>
</div></section>

<section class="qd-section qd-state" id="state"><div class="qd-shell">
  <div class="qd-section-head"><div><span class="qd-kicker">Current QuantDeus State</span><h2>Цивилизационный dashboard</h2></div><p>Здесь показываются только данные, которые реально существуют в WordPress. Отсутствующие KPI не дорисовываются ради красоты.</p></div>
  <div class="qd-metric-grid">
    <a class="qd-metric" href="<?php echo esc_url($qd_archive('qd_node','/federation/nodes/')); ?>"><strong><?php echo esc_html((string)$node_count); ?></strong><span>Active / published Nodes</span></a>
    <a class="qd-metric" href="<?php echo esc_url($qd_archive('qd_project','/projects/')); ?>"><strong><?php echo esc_html((string)$project_count); ?></strong><span>Projects</span></a>
    <a class="qd-metric" href="<?php echo esc_url($qd_archive('qd_research','/research/')); ?>"><strong><?php echo esc_html((string)$research_count); ?></strong><span>Research records</span></a>
    <a class="qd-metric" href="<?php echo esc_url($qd_archive('qd_artifact','/knowledge/artifacts/')); ?>"><strong><?php echo esc_html((string)$artifact_count); ?></strong><span>Open artifacts</span></a>
    <a class="qd-metric" href="<?php echo esc_url($qd_archive('qd_result','/results/')); ?>"><strong><?php echo esc_html((string)$result_count); ?></strong><span>Verified results</span></a>
    <a class="qd-metric" href="<?php echo esc_url($qd_archive('qd_forum_thread','/forum/')); ?>"><strong><?php echo esc_html((string)$forum_count); ?></strong><span>Forum threads</span></a>
  </div>
  <div class="qd-unknown-grid" aria-label="KPI status">
    <div><span>Action Conversion</span><strong>UNKNOWN</strong></div>
    <div><span>Partner Density</span><strong>UNKNOWN</strong></div>
    <div><span>Replication Success</span><strong>NOT MEASURED</strong></div>
    <div><span>Federation Score</span><strong>NOT MEASURED</strong></div>
  </div>
</div></section>

<section class="qd-section" id="horizons"><div class="qd-shell">
  <div class="qd-section-head"><div><span class="qd-kicker">Three Horizons</span><h2>Двигатель → Прото-Федерация → цивилизационный компас</h2></div><p>Дальний горизонт задаёт направление, но не заменяет измеримый результат сегодня.</p></div>
  <div class="qd-horizon-grid">
    <article class="qd-horizon"><span>2026–2028</span><h3>IGNITION</h3><p>AI Fleet, автоматизация, evidence loops, первые узлы, работающие продукты и открытые артефакты.</p><b>Двигатель</b></article>
    <article class="qd-horizon"><span>2026–2041</span><h3>PROTO-FEDERATION</h3><p>Сеть независимых цифровых, научных, культурных, экологических и городских узлов.</p><b>Совместимость без централизации</b></article>
    <article class="qd-horizon qd-horizon-night"><span>2026–2126</span><h3>CENTURY COMPASS</h3><p>Синхронизация → Ренессанс → варп-порог → космическая цивилизация.</p><b>North Star, не обещание</b></article>
  </div>
</div></section>

<section class="qd-section qd-federation" id="federation"><div class="qd-shell">
  <div class="qd-section-head"><div><span class="qd-kicker">Federation of Nodes</span><h2>Node ↔ Federation Interface ↔ Node</h2></div><p>QuantDeus не превращает проекты в подчинённые филиалы. Узел сохраняет владельца, идентичность, локальное управление, право выхода и переносимые артефакты.</p></div>
  <div class="qd-interface-grid">
    <?php foreach (['Identity','Mission','Evidence','Artifacts','Metrics','Replication','Safety','EXIT','Governance','Human Override'] as $field): ?>
      <div class="qd-interface-field"><?php echo esc_html($field); ?></div>
    <?php endforeach; ?>
  </div>
  <div class="qd-section-actions"><a class="qd-btn" href="<?php echo esc_url($qd_archive('qd_node','/federation/nodes/')); ?>">Открыть каталог узлов</a></div>
  <?php $nodes=get_posts(['post_type'=>'qd_node','post_status'=>'publish','numberposts'=>3]); if($nodes): ?>
  <div class="qd-grid qd-live-grid">
    <?php foreach($nodes as $node): ?>
      <article class="qd-card"><span class="qd-tag">Federation Node</span><h3><a href="<?php echo esc_url(get_permalink($node)); ?>"><?php echo esc_html(get_the_title($node)); ?></a></h3><p><?php echo esc_html(wp_trim_words(wp_strip_all_tags($node->post_excerpt ?: $node->post_content),28)); ?></p></article>
    <?php endforeach; ?>
  </div>
  <?php else: ?>
    <div class="qd-empty-state">Публичные Federation Nodes пока не опубликованы. Это честный ноль, а не декоративная статистика.</div>
  <?php endif; ?>
</div></section>

<section class="qd-section qd-evidence-zone" id="research"><div class="qd-shell">
  <div class="qd-section-head"><div><span class="qd-kicker">Evidence Before Narrative</span><h2>Исследования: факт отдельно, гипотеза отдельно</h2></div><p>Каждая frontier-тема должна различать FACT, EVIDENCE, HYPOTHESIS, UNKNOWN, NEXT TEST и FALSIFIER.</p></div>
  <div class="qd-grade-grid">
    <article><strong>A</strong><h3>Independently verifiable</h3><p>Воспроизводимые данные или работающая система с измеримым эффектом.</p></article>
    <article><strong>B</strong><h3>Promising / uncertain</h3><p>Ранний результат с существенной неопределённостью.</p></article>
    <article><strong>C</strong><h3>Hypothesis / signal</h3><p>Концепт, гипотеза или непроверенный сигнал — без повышения статуса словами.</p></article>
  </div>
  <?php $research=get_posts(['post_type'=>'qd_research','post_status'=>'publish','numberposts'=>3]); ?>
  <?php if($research): ?><div class="qd-grid qd-live-grid">
    <?php foreach($research as $item):
      $grade=get_post_meta($item->ID,'qd_evidence_grade',true);
      if(!$grade){ $terms=wp_get_post_terms($item->ID,'qd_evidence_grade',['fields'=>'slugs']); $grade=$terms[0]??'UNKNOWN'; }
    ?>
      <article class="qd-card"><span class="qd-tag">Evidence <?php echo esc_html(strtoupper((string)$grade)); ?></span><h3><a href="<?php echo esc_url(get_permalink($item)); ?>"><?php echo esc_html(get_the_title($item)); ?></a></h3><p><?php echo esc_html(wp_trim_words(wp_strip_all_tags($item->post_excerpt ?: $item->post_content),28)); ?></p></article>
    <?php endforeach; ?>
  </div><?php else: ?><div class="qd-empty-state">Нет опубликованных research records — статус остаётся UNKNOWN до появления проверяемого материала.</div><?php endif; ?>
  <div class="qd-section-actions"><a class="qd-btn alt" href="<?php echo esc_url($qd_archive('qd_research','/research/')); ?>">Все исследования</a></div>
</div></section>

<section class="qd-section" id="projects"><div class="qd-shell">
  <div class="qd-section-head"><div><span class="qd-kicker">Operational Loop</span><h2>От потребности до автономного узла</h2></div><p>NEED → RESOURCE MAP → EVIDENCE → REVERSIBLE PROTOTYPE → QA → MEASURED OUTCOME → OPEN LEARNING → REPLICATION PACKAGE → AUTONOMOUS NODE.</p></div>
  <div class="qd-loop" aria-label="QuantDeus operational loop">
    <?php foreach(['NEED','RESOURCE MAP','EVIDENCE','PROTOTYPE','QA','OUTCOME','OPEN LEARNING','REPLICATION','NODE'] as $i=>$stage): ?><span><b><?php echo esc_html((string)($i+1)); ?></b><?php echo esc_html($stage); ?></span><?php endforeach; ?>
  </div>
  <?php $projects=get_posts(['post_type'=>'qd_project','post_status'=>'publish','numberposts'=>3]); ?>
  <?php if($projects): ?><div class="qd-grid qd-live-grid">
    <?php foreach($projects as $project): $stage=get_post_meta($project->ID,'qd_loop_stage',true) ?: 'UNKNOWN'; ?>
      <article class="qd-card"><span class="qd-tag"><?php echo esc_html($stage); ?></span><h3><a href="<?php echo esc_url(get_permalink($project)); ?>"><?php echo esc_html(get_the_title($project)); ?></a></h3><p><?php echo esc_html(wp_trim_words(wp_strip_all_tags($project->post_excerpt ?: $project->post_content),28)); ?></p></article>
    <?php endforeach; ?>
  </div><?php else: ?><div class="qd-empty-state">Публичные проекты ещё не заведены в WordPress-модель. Репозиторий остаётся источником инженерной истины до миграции конкретных карточек.</div><?php endif; ?>
  <div class="qd-section-actions"><a class="qd-btn alt" href="<?php echo esc_url($qd_archive('qd_project','/projects/')); ?>">Все проекты</a></div>
</div></section>

<section class="qd-section qd-fleet" id="fleet"><div class="qd-shell">
  <div class="qd-section-head"><div><span class="qd-kicker">Digital Fleet Operations</span><h2>AI ускоряет работу. Человек задаёт смысл и финальную ответственность.</h2></div><p>Роли показаны как операционная инфраструктура: исследование, логика, координация, QA и аудит — не как декоративный “чатбот-театр”.</p></div>
  <div class="qd-role-grid qd-fleet-grid">
    <article class="qd-role"><strong>7/9</strong><h3>Seven of Nine</h3><p>Coordinator / AI Chief of Staff · orchestration, decomposition, execution flow.</p></article>
    <article class="qd-role"><strong>SH</strong><h3>Sherlock Holmes</h3><p>Scientific Investigation · forensics, evidence chains, root-cause analysis.</p></article>
    <article class="qd-role"><strong>TV</strong><h3>Tuvok</h3><p>Logic &amp; Epistemic Integrity · contradictions, threat models, falsifiers.</p></article>
    <article class="qd-role"><strong>EMH</strong><h3>EMH</h3><p>Mediation / operational health · safe handoffs, QA pressure, recovery.</p></article>
  </div>
  <div class="qd-human-override"><b>Human Override</b><span>Смысл · ценности · согласие · привилегированные действия · финальная ответственность</span></div>
</div></section>

<section class="qd-section qd-knowledge" id="knowledge"><div class="qd-shell">
  <div class="qd-section-head"><div><span class="qd-kicker">Knowledge & Open Artifacts</span><h2>Результат должен быть переносимым</h2></div><p>Код, данные, исследования, инструкции, публикации и replication packages — то, что другой автономный узел может проверить и использовать.</p></div>
  <div class="qd-section-actions">
    <a class="qd-btn" href="<?php echo esc_url($qd_archive('qd_artifact','/knowledge/artifacts/')); ?>">Open Artifacts</a>
    <a class="qd-btn alt" href="<?php echo esc_url($qd_archive('qd_result','/results/')); ?>">Verified Results</a>
  </div>
</div></section>

<section class="qd-section qd-services" id="services"><div class="qd-shell">
  <div class="qd-section-head"><div><span class="qd-kicker">Store / Services · Quote-only</span><h2>Коммерческий слой — один модуль экосистемы</h2></div><p>Заявку можно оставить без регистрации. Quote-only услуги не блокируются платёжной логикой.</p></div>
  <div class="qd-grid"><?php
  $services=get_posts(['post_type'=>'qd_service','post_status'=>'publish','numberposts'=>20]);
  foreach($services as $s):
    if (get_post_meta($s->ID,'qd_available',true)==='0') continue;
    $sid=get_post_meta($s->ID,'qd_service_id',true) ?: $s->post_name; ?>
    <article class="qd-card qd-service-card"><span class="qd-tag">По запросу</span><h3><?php echo esc_html(get_the_title($s)); ?></h3><p><?php echo esc_html(wp_strip_all_tags($s->post_content)); ?></p><button class="qd-btn" data-service="<?php echo esc_attr($sid); ?>">Оставить заявку</button></article>
  <?php endforeach; ?></div>
  <div class="qd-card qd-inquiry" id="inquiryBox" hidden><h3>Заявка без регистрации</h3><form class="qd-form" id="qdInquiry"><input type="hidden" name="service_id"><textarea name="note" minlength="10" maxlength="1600" required placeholder="Опиши задачу или мероприятие"></textarea><input name="contact" maxlength="320" required placeholder="@telegram, телефон или email"><input name="website" tabindex="-1" autocomplete="off" class="qd-honeypot"><button class="qd-btn" type="submit">Отправить</button><div class="qd-notice" id="qdInquiryStatus">Заявка сохраняется напрямую в WordPress.</div></form></div>
</div></section>

<section class="qd-section" id="ksenia"><div class="qd-shell">
  <div class="qd-feature">
    <div class="qd-feature-copy"><span class="qd-kicker">Ksenia Cherednikova · Artist / Booking</span><h2>Музыка, медиа и выступления</h2><p>Раздел остаётся CMS-driven: биография, фото, ссылки, видео и заявки добавляются только из подтверждённых источников. Никаких выдуманных регалий или медиа.</p><button class="qd-btn" data-service="ksenia-cherednikova-concert">Запросить выступление</button></div>
    <div class="qd-feature-art" aria-label="Медиа-раздел Ксении Чередниковой"><div class="qd-vinyl"></div><div class="qd-glass-note">MEDIA<br>LIVE<br>BOOKING</div></div>
  </div>
</div></section>

<section class="qd-section qd-visuals" id="media"><div class="qd-shell">
  <div class="qd-section-head"><div><span class="qd-kicker">Cosmic Frutiger Aero · Real Imagery</span><h2>DAY / EARTH ↔ NIGHT / HORIZON</h2></div><p>Реальные изображения Земли, природы и космоса вместо SVG-заглушек. Атрибуция остаётся рядом с изображением.</p></div>
  <div class="qd-visual-grid">
    <figure class="qd-visual qd-visual-wide qd-visual-aero"><img src="https://upload.wikimedia.org/wikipedia/commons/d/db/Mirror_lake_with_green_hill.jpg" alt="Озеро, зелёные холмы и голубое небо" loading="lazy" decoding="async"><figcaption><strong>Frutiger Aero · Lake &amp; Sky</strong><span>Public domain · Rosendahl / Wikimedia Commons</span></figcaption></figure>
    <figure class="qd-visual"><img src="https://eol.jsc.nasa.gov/DatabaseImages/ESC/large/ISS023/ISS023-E-58455.JPG" alt="Полярное сияние над Землёй с МКС" loading="lazy"><figcaption><strong>Aurora from ISS</strong><span>NASA/JSC · ISS023-E-58455</span></figcaption></figure>
    <figure class="qd-visual"><img src="https://eol.jsc.nasa.gov/DatabaseImages/ESC/large/ISS016/ISS016-E-27586.JPG" alt="Ночной город Земли с МКС" loading="lazy"><figcaption><strong>Earth at night</strong><span>NASA/JSC · ISS016-E-27586</span></figcaption></figure>
    <figure class="qd-visual qd-visual-wide qd-visual-space"><img src="https://upload.wikimedia.org/wikipedia/commons/1/11/Trees_on_hills_with_blue_sky_landscape_image.jpg" alt="Зелёные холмы и насыщенное голубое небо" loading="lazy" decoding="async"><figcaption><strong>Frutiger Aero · Green Horizon</strong><span>Public domain · Jon Sullivan / Wikimedia Commons</span></figcaption></figure>
  </div>
</div></section>

<section class="qd-section" id="community"><div class="qd-shell">
  <div class="qd-section-head"><div><span class="qd-kicker">Community + EXIT</span><h2>Участие без захвата агентности</h2></div><p>Telegram — обычный вход. GitHub staff auth отдельно проверяет repository permission. Federation ≠ Borg: авторство, локальная автономия и право выйти сохраняются.</p></div>
  <div class="qd-role-grid">
    <article class="qd-role"><strong>01</strong><h3>Member</h3><p>Telegram identity · форум · заявки · участие.</p></article>
    <article class="qd-role"><strong>02</strong><h3>Moderator</h3><p>Форумная модерация без доступа к системным настройкам и приватным заявкам.</p></article>
    <article class="qd-role"><strong>03</strong><h3>Administrator</h3><p>GitHub repository permission = admin → native WordPress administrator.</p></article>
  </div>
  <div class="qd-community-actions"><a class="qd-btn alt" href="<?php echo esc_url($qd_archive('qd_forum_thread','/forum/')); ?>">Открыть форум</a><a class="qd-btn alt" href="<?php echo esc_url(home_url('/login/')); ?>">Войти</a></div>
</div></section>

<section class="qd-section" id="news"><div class="qd-shell">
  <div class="qd-section-head"><div><span class="qd-kicker">News / Living Manifest</span><h2>Адаптивный слой без переписывания конституционного ядра</h2></div><p>Новости и текущие сигналы могут менять приоритеты исследования, но не превращают гипотезу в доказательство.</p></div>
  <?php $news=get_posts(['post_type'=>'post','post_status'=>'publish','numberposts'=>3]); ?>
  <?php if($news): ?><div class="qd-grid qd-live-grid"><?php foreach($news as $post): ?><article class="qd-card"><span class="qd-tag">News</span><h3><a href="<?php echo esc_url(get_permalink($post)); ?>"><?php echo esc_html(get_the_title($post)); ?></a></h3><p><?php echo esc_html(wp_trim_words(wp_strip_all_tags($post->post_excerpt ?: $post->post_content),28)); ?></p></article><?php endforeach; ?></div>
  <?php else: ?><div class="qd-empty-state">В WordPress пока нет опубликованных news posts. Living Manifest остаётся в GitHub-контуре до редакционной миграции.</div><?php endif; ?>
</div></section>

<section class="qd-section qd-manifesto" id="manifesto"><div class="qd-shell">
  <div class="qd-section-head"><div><span class="qd-kicker">Manifesto v4 · Current Canon</span><h2>«Единство в цели. Свобода в путях. Доказательства в результатах.»</h2></div><p>v4 — текущий конституционный и операционный источник. Старые версии сохраняются как история эволюции проекта, а не как конкурирующие каноны.</p></div>
  <div class="qd-pillar-grid">
    <?php foreach([
      'Жизнь и достоинство человека','Безопасность как основа свободы','Прозрачность и доверие','Творчество, наука и инновации',
      'Экологическая гармония','Постдефицитное мышление','IDIC — разнообразие без унификации','Долгий горизонт и космическая цивилизация'
    ] as $i=>$pillar): ?><div><b><?php echo esc_html(sprintf('%02d',$i+1)); ?></b><span><?php echo esc_html($pillar); ?></span></div><?php endforeach; ?>
  </div>
</div></section>

<section class="qd-section qd-about" id="about"><div class="qd-shell">
  <div class="qd-section-head"><div><span class="qd-kicker">About QuantDeus</span><h2>Не центр будущего, а протокол совместимости для его создателей</h2></div><p>Human Meaning → AI Acceleration → Independent QA → Evidence → Human Override. Каждый полезный результат должен иметь шанс стать следующим автономным узлом.</p></div>
  <div class="qd-portal-chain" aria-label="Primary UX chain">
    <?php foreach(['DISCOVER','UNDERSTAND','VERIFY','EXPLORE','PARTICIPATE','CREATE','SHARE','REPLICATE','BECOME A NODE'] as $stage): ?><span><?php echo esc_html($stage); ?></span><?php endforeach; ?>
  </div>
</div></section>
</main>
<?php get_footer(); ?>