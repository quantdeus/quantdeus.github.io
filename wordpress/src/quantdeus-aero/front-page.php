<?php if (!defined('ABSPATH')) { exit; } get_header();
$count=fn(string $t)=>(int)(wp_count_posts($t)->publish??0);
$nodes=get_posts(['post_type'=>'qd_node','post_status'=>'publish','numberposts'=>3]);
$research=get_posts(['post_type'=>'qd_research','post_status'=>'publish','numberposts'=>4]);
$projects=get_posts(['post_type'=>'qd_project','post_status'=>'publish','numberposts'=>4]);
$artifacts=get_posts(['post_type'=>'qd_artifact','post_status'=>'publish','numberposts'=>4]);
$grade_a=get_posts(['post_type'=>'qd_result','post_status'=>'publish','numberposts'=>-1,'fields'=>'ids','meta_key'=>'qd_evidence_grade','meta_value'=>'A']);
$news=get_posts(['post_type'=>'post','post_status'=>'publish','numberposts'=>3]);
?>
<main class="qd-portal">
<section class="qd-hero qd-portal-hero" id="holding"><div class="qd-shell qd-hero-grid">
<div class="qd-hero-copy"><div class="qd-kicker">QUANTDEUS // Неоновый горизонт · NEON HORIZON v4 CURRENT CANON</div>
<h1>Операционная система Неонового Горизонта и Федерация автономных узлов.</h1>
<p>Портал для исследований, доказательств, проектов, AI Fleet, сообщества и репликации полезных результатов — без превращения независимых узлов в подразделения центра.</p>
<div class="qd-actions"><a class="qd-btn" href="<?php echo esc_url(home_url('/federation/')); ?>">Federation</a><a class="qd-btn alt" href="<?php echo esc_url(get_post_type_archive_link('qd_research')?:home_url('/research/')); ?>">Research</a></div>
<p class="qd-motto">«Единство в цели. Свобода в путях. Доказательства в результатах.»</p></div>
<figure class="qd-hero-visual"><img src="https://eol.jsc.nasa.gov/DatabaseImages/ESC/large/ISS075/ISS075-E-22382.JPG" alt="Земля с Международной космической станции" fetchpriority="high"><figcaption>Earth from ISS · NASA/JSC · ISS075-E-22382</figcaption></figure>
</div></section>

<section class="qd-section" id="state"><div class="qd-shell">
<div class="qd-section-head"><div><span class="qd-kicker">Current QuantDeus State</span><h2>Наблюдаемое состояние, не красивые выдуманные KPI</h2></div><p>Где outcome-данных нет, портал показывает UNKNOWN / NOT MEASURED.</p></div>
<div class="qd-kpi-grid">
<article><strong><?php echo $count('qd_node'); ?></strong><span>Active Nodes</span></article>
<article><strong><?php echo $count('qd_artifact'); ?></strong><span>Open Artifacts</span></article>
<article><strong><?php echo count($grade_a); ?></strong><span>Grade A Results</span></article>
<article><strong><?php echo $count('qd_project'); ?></strong><span>Active Projects</span></article>
<article><strong><?php echo $count('qd_research'); ?></strong><span>Research Items</span></article>
<?php foreach(['Action Conversion','Partner Density','Future Fund Flow','Automation Ratio','Impact Ledger','Transparency Score','Federation Score','Replication Success'] as $k): ?><article class="is-unknown"><strong>UNKNOWN</strong><span><?php echo esc_html($k); ?></span></article><?php endforeach; ?>
</div></div></section>

<section class="qd-section"><div class="qd-shell">
<div class="qd-section-head"><div><span class="qd-kicker">Three Horizons</span><h2>2 года — двигатель. 15 лет — Прото-Федерация. 100 лет — цивилизационный компас.</h2></div><a class="qd-text-link" href="<?php echo esc_url(home_url('/horizons/')); ?>">Вся карта →</a></div>
<div class="qd-horizon-grid">
<article><span>2026–2028</span><h3>IGNITION</h3><p>AI Fleet, evidence loops, продукты, открытые артефакты и первые узлы.</p><b>EXECUTION</b></article>
<article><span>2026–2041</span><h3>PROTO-FEDERATION</h3><p>Сеть цифровых, научных, образовательных, культурных, экологических и физических пилотов.</p><b>NETWORK</b></article>
<article class="is-night"><span>2026–2126</span><h3>CENTURY COMPASS</h3><p>Синхронизация → Ренессанс → Варп-порог → космическая цивилизация. North Star, а не подмена сегодняшних доказательств.</p><b>NORTH STAR</b></article>
</div></div></section>

<section class="qd-section" id="federation"><div class="qd-shell">
<div class="qd-section-head"><div><span class="qd-kicker">Federation of Nodes</span><h2>Node ↔ Federation Interface ↔ Node</h2></div><p>Identity, Mission, Evidence, Artifacts, Metrics, Replication, Safety, EXIT, Governance и Human Override — общий интерфейс, а не централизованная иерархия.</p></div>
<div class="qd-content-grid"><?php foreach($nodes as $n): $g=(string)get_post_meta($n->ID,'qd_evidence_grade',true); ?><article class="qd-card qd-portal-card"><span class="qd-evidence grade-<?php echo esc_attr(strtolower($g?:'unknown')); ?>">Evidence <?php echo esc_html($g?:'UNKNOWN'); ?></span><h3><a href="<?php echo esc_url(get_permalink($n)); ?>"><?php echo esc_html(get_the_title($n)); ?></a></h3><p><?php echo esc_html(wp_trim_words(wp_strip_all_tags($n->post_content),28)); ?></p><small>Owner: <?php echo esc_html(get_post_meta($n->ID,'qd_owner',true)?:'UNKNOWN'); ?></small></article><?php endforeach; ?></div>
<div class="qd-actions"><a class="qd-btn" href="<?php echo esc_url(home_url('/federation/')); ?>">Каталог Federation</a><a class="qd-btn alt" href="<?php echo esc_url(get_post_type_archive_link('qd_node')?:home_url('/federation/nodes/')); ?>">Все Nodes</a></div>
</div></section>

<section class="qd-section qd-evidence-zone"><div class="qd-shell">
<div class="qd-section-head"><div><span class="qd-kicker">Evidence Before Narrative</span><h2>FACT ≠ EVIDENCE ≠ HYPOTHESIS</h2></div><p>Frontier research обязан показывать UNKNOWN, NEXT TEST и FALSIFIER.</p></div>
<div class="qd-evidence-legend"><span class="qd-evidence grade-a">A · independently verifiable</span><span class="qd-evidence grade-b">B · promising / uncertain</span><span class="qd-evidence grade-c">C · hypothesis / early signal</span></div>
<div class="qd-content-grid"><?php foreach($research as $r): $g=(string)get_post_meta($r->ID,'qd_evidence_grade',true); ?><article class="qd-card qd-portal-card"><span class="qd-evidence grade-<?php echo esc_attr(strtolower($g?:'unknown')); ?>">Grade <?php echo esc_html($g?:'UNKNOWN'); ?></span><h3><a href="<?php echo esc_url(get_permalink($r)); ?>"><?php echo esc_html(get_the_title($r)); ?></a></h3><p><?php echo esc_html(wp_trim_words(wp_strip_all_tags($r->post_content),28)); ?></p><small>NEXT TEST: <?php echo esc_html(wp_trim_words((string)get_post_meta($r->ID,'qd_next_test',true),16)?:'UNKNOWN'); ?></small></article><?php endforeach; ?></div>
</div></section>

<section class="qd-section"><div class="qd-shell">
<div class="qd-section-head"><div><span class="qd-kicker">Operational Loop</span><h2>От потребности к автономному узлу</h2></div></div>
<div class="qd-cycle"><?php foreach(['NEED','RESOURCE MAP','EVIDENCE','REVERSIBLE PROTOTYPE','QA','MEASURED OUTCOME','OPEN LEARNING','REPLICATION PACKAGE','AUTONOMOUS NODE'] as $i=>$x): ?><span><b><?php echo str_pad((string)($i+1),2,'0',STR_PAD_LEFT); ?></b><?php echo esc_html($x); ?></span><?php endforeach; ?></div>
</div></section>

<section class="qd-section" id="projects"><div class="qd-shell">
<div class="qd-section-head"><div><span class="qd-kicker">Active Projects</span><h2>Проекты с состоянием цикла и outcome-метрикой</h2></div><a class="qd-text-link" href="<?php echo esc_url(get_post_type_archive_link('qd_project')?:home_url('/projects/')); ?>">Все проекты →</a></div>
<div class="qd-content-grid"><?php foreach($projects as $p): ?><article class="qd-card qd-portal-card"><span class="qd-tag"><?php echo esc_html(get_post_meta($p->ID,'qd_cycle_stage',true)?:'STAGE UNKNOWN'); ?></span><h3><a href="<?php echo esc_url(get_permalink($p)); ?>"><?php echo esc_html(get_the_title($p)); ?></a></h3><p><?php echo esc_html(wp_trim_words(wp_strip_all_tags($p->post_content),28)); ?></p><small>Outcome: <?php echo esc_html(get_post_meta($p->ID,'qd_outcome_metric',true)?:'NOT MEASURED'); ?></small></article><?php endforeach; ?></div>
</div></section>

<section class="qd-section qd-fleet" id="ai-fleet"><div class="qd-shell">
<div class="qd-section-head"><div><span class="qd-kicker">Digital Fleet Operations</span><h2>Human Meaning → AI Acceleration → Independent QA → Evidence → Human Override</h2></div><a class="qd-text-link" href="<?php echo esc_url(home_url('/ai-fleet/')); ?>">AI Fleet →</a></div>
<div class="qd-fleet-grid"><article><strong>7/9</strong><h3>Seven of Nine</h3><p>Coordinator / AI Chief of Staff.</p></article><article><strong>SH</strong><h3>Sherlock Holmes</h3><p>Scientific Investigation / forensics.</p></article><article><strong>TV</strong><h3>Tuvok</h3><p>Logic & Epistemic Integrity.</p></article><article><strong>EMH</strong><h3>EMH</h3><p>Mediation / Diplomacy / operational health.</p></article></div>
</div></section>

<section class="qd-section" id="knowledge"><div class="qd-shell">
<div class="qd-section-head"><div><span class="qd-kicker">Open Artifacts</span><h2>Знание должно быть переносимым и воспроизводимым</h2></div><a class="qd-text-link" href="<?php echo esc_url(home_url('/knowledge/')); ?>">Knowledge →</a></div>
<div class="qd-content-grid"><?php foreach($artifacts as $a): ?><article class="qd-card qd-portal-card"><span class="qd-evidence grade-<?php echo esc_attr(strtolower((string)get_post_meta($a->ID,'qd_evidence_grade',true)?:'unknown')); ?>">Artifact</span><h3><a href="<?php echo esc_url(get_permalink($a)); ?>"><?php echo esc_html(get_the_title($a)); ?></a></h3><p><?php echo esc_html(wp_trim_words(wp_strip_all_tags($a->post_content),28)); ?></p></article><?php endforeach; ?></div>
</div></section>

<section class="qd-section" id="services"><div class="qd-shell">
<div class="qd-section-head"><div><span class="qd-kicker">Commercial Layer · quote-only</span><h2>Services</h2></div><p>Гостевая заявка доступна без регистрации; quote-only услуги не блокируются оплатой.</p></div>
<div class="qd-content-grid"><?php $services=get_posts(['post_type'=>'qd_service','post_status'=>'publish','numberposts'=>20]); foreach($services as $s): if(get_post_meta($s->ID,'qd_available',true)==='0') continue; $sid=get_post_meta($s->ID,'qd_service_id',true)?:$s->post_name; ?><article class="qd-card"><span class="qd-tag">QUOTE / REQUEST</span><h3><?php echo esc_html(get_the_title($s)); ?></h3><p><?php echo esc_html(wp_strip_all_tags($s->post_content)); ?></p><button class="qd-btn" data-service="<?php echo esc_attr($sid); ?>">Оставить заявку</button></article><?php endforeach; ?></div>
<div class="qd-card qd-inquiry" id="inquiryBox" hidden><h3>Заявка без регистрации</h3><form class="qd-form" id="qdInquiry"><input type="hidden" name="service_id"><textarea name="note" minlength="10" maxlength="1600" required placeholder="Опиши задачу или мероприятие"></textarea><input name="contact" maxlength="320" required placeholder="@telegram, телефон или email"><input name="website" tabindex="-1" autocomplete="off" class="qd-honeypot"><button class="qd-btn" type="submit">Отправить</button><div class="qd-notice" id="qdInquiryStatus">Заявка сохраняется напрямую в WordPress.</div></form></div>
</div></section>

<section class="qd-section" id="community"><div class="qd-shell qd-split">
<article class="qd-card"><span class="qd-kicker">Community + EXIT</span><h2>Federation ≠ Borg</h2><p>Telegram — обычный пользовательский вход. GitHub staff-auth отдельно. Авторство, локальная воля и переносимость артефактов сохраняются.</p><div class="qd-actions"><a class="qd-btn alt" href="<?php echo esc_url(home_url('/community/')); ?>">Community</a><a class="qd-btn alt" href="<?php echo esc_url(home_url('/forum/')); ?>">Forum</a></div></article>
<article class="qd-card"><span class="qd-kicker">Artist / Booking</span><h2>Ксения Чередникова</h2><p>Media hub и booking-контур. Фото, регалии, официальные ссылки и медиа публикуются только из подтверждённых источников.</p><div class="qd-actions"><a class="qd-btn alt" href="<?php echo esc_url(home_url('/ksenia-cherednikova/')); ?>">Media hub</a><button class="qd-btn" data-service="ksenia-cherednikova-concert">Booking</button></div></article>
</div></section>

<section class="qd-section qd-visuals" id="visuals"><div class="qd-shell">
<div class="qd-section-head"><div><span class="qd-kicker">Cosmic Frutiger Aero · Day / Earth × Night / Horizon</span><h2>Реальные изображения вместо заглушек</h2></div><p>Attribution остаётся рядом с медиа.</p></div>
<div class="qd-visual-grid">
<figure class="qd-visual qd-visual-wide"><img src="https://upload.wikimedia.org/wikipedia/commons/d/db/Mirror_lake_with_green_hill.jpg" alt="Озеро, зелёные холмы и голубое небо" loading="lazy" decoding="async"><figcaption><strong>Earth / Frutiger Aero</strong><span>Public domain · Wikimedia Commons</span></figcaption></figure>
<figure class="qd-visual"><img src="https://eol.jsc.nasa.gov/DatabaseImages/ESC/large/ISS023/ISS023-E-58455.JPG" alt="Полярное сияние над Землёй" loading="lazy"><figcaption><strong>Aurora from ISS</strong><span>NASA/JSC · ISS023-E-58455</span></figcaption></figure>
<figure class="qd-visual"><img src="https://eol.jsc.nasa.gov/DatabaseImages/ESC/large/ISS016/ISS016-E-27586.JPG" alt="Ночной город Земли с орбиты" loading="lazy"><figcaption><strong>Earth at night</strong><span>NASA/JSC · ISS016-E-27586</span></figcaption></figure>
<figure class="qd-visual qd-visual-wide"><img src="https://upload.wikimedia.org/wikipedia/commons/1/11/Trees_on_hills_with_blue_sky_landscape_image.jpg" alt="Зелёные холмы и голубое небо" loading="lazy" decoding="async"><figcaption><strong>Green Horizon</strong><span>Public domain · Wikimedia Commons</span></figcaption></figure>
</div></div></section>

<section class="qd-section" id="news"><div class="qd-shell">
<div class="qd-section-head"><div><span class="qd-kicker">News / Living Manifest</span><h2>Адаптивный слой не переписывает конституцию молча</h2></div><a class="qd-text-link" href="<?php echo esc_url(home_url('/news/')); ?>">News →</a></div>
<?php if($news): ?><div class="qd-content-grid"><?php foreach($news as $p): ?><article class="qd-card"><span class="qd-tag"><?php echo esc_html(get_the_date('', $p)); ?></span><h3><a href="<?php echo esc_url(get_permalink($p)); ?>"><?php echo esc_html(get_the_title($p)); ?></a></h3><p><?php echo esc_html(wp_trim_words(wp_strip_all_tags($p->post_content),26)); ?></p></article><?php endforeach; ?></div><?php else: ?><div class="qd-empty"><strong>NO MATERIAL ADAPTIVE SIGNAL PROMOTED</strong><p>Новости не генерируются ради активности.</p></div><?php endif; ?>
</div></section>

<section class="qd-section"><div class="qd-shell"><div class="qd-section-head"><div><span class="qd-kicker">DISCOVER → UNDERSTAND → VERIFY → PARTICIPATE → CREATE → REPLICATE</span><h2>Каждый полезный результат должен иметь шанс стать следующим автономным узлом.</h2></div></div><div class="qd-actions"><a class="qd-btn" href="<?php echo esc_url(home_url('/community/')); ?>">Community</a><a class="qd-btn alt" href="<?php echo esc_url(home_url('/manifesto/')); ?>">Manifesto v4</a><a class="qd-btn alt" href="<?php echo esc_url(home_url('/login/')); ?>">Login</a></div></div></section>
</main><?php get_footer(); ?>