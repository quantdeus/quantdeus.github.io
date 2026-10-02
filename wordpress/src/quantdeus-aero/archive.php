<?php
if (!defined('ABSPATH')) { exit; }
get_header();
$type=get_query_var('post_type');
if (is_array($type)) $type=$type[0] ?? '';
$obj=$type ? get_post_type_object($type) : null;
$title=$obj?->labels?->name ?: 'QuantDeus';
$intro=[
  'qd_node'=>'Federation of Nodes — автономные узлы, совместимые через общий интерфейс без потери локального управления и права EXIT.',
  'qd_research'=>'Research — доказательства, гипотезы, неизвестное, следующий тест и falsifier разделяются явно.',
  'qd_project'=>'Projects — активная работа привязана к наблюдаемому этапу operational loop.',
  'qd_artifact'=>'Open Artifacts — переносимые код, данные, инструкции, публикации и replication packages.',
  'qd_result'=>'Verified Results — результаты, которым можно назначить проверяемый evidence status.',
  'qd_service'=>'Services — прикладные услуги QuantDeus; quote-only заявки доступны гостям.',
][$type] ?? '';
?>
<main class="qd-shell qd-section qd-archive">
  <header class="qd-archive-head">
    <span class="qd-kicker">QUANTDEUS // PORTAL</span>
    <h1><?php echo esc_html($title); ?></h1>
    <?php if($intro): ?><p><?php echo esc_html($intro); ?></p><?php endif; ?>
    <a class="qd-btn alt" href="<?php echo esc_url(home_url('/')); ?>">← Civilization Dashboard</a>
  </header>
  <?php if(have_posts()): ?>
    <div class="qd-grid qd-live-grid qd-archive-grid">
      <?php while(have_posts()): the_post(); ?>
        <article <?php post_class('qd-card qd-archive-card'); ?>>
          <?php if(has_post_thumbnail()): ?><a class="qd-archive-thumb" href="<?php the_permalink(); ?>"><?php the_post_thumbnail('large',['loading'=>'lazy']); ?></a><?php endif; ?>
          <?php
          if($type==='qd_research'||$type==='qd_result'){
              $grade=(string)get_post_meta(get_the_ID(),'qd_evidence_grade',true);
              if(!$grade){ $terms=wp_get_post_terms(get_the_ID(),'qd_evidence_grade',['fields'=>'slugs']); $grade=$terms[0]??'UNKNOWN'; }
              echo '<span class="qd-tag">Evidence '.esc_html(strtoupper($grade)).'</span>';
          } elseif($type==='qd_project') {
              $stage=(string)get_post_meta(get_the_ID(),'qd_loop_stage',true);
              echo '<span class="qd-tag">'.esc_html($stage ?: 'Stage UNKNOWN').'</span>';
          } elseif($type==='qd_node') {
              echo '<span class="qd-tag">Federation Node</span>';
          }
          ?>
          <h2><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h2>
          <p><?php echo esc_html(wp_trim_words(wp_strip_all_tags(get_the_excerpt() ?: get_the_content()),36)); ?></p>
          <a class="qd-text-link" href="<?php the_permalink(); ?>">Открыть →</a>
        </article>
      <?php endwhile; ?>
    </div>
    <nav class="qd-pagination" aria-label="Pagination"><?php the_posts_pagination(); ?></nav>
  <?php else: ?>
    <div class="qd-empty-state">Пока нет опубликованных записей. Портал показывает пустое состояние вместо выдуманных данных.</div>
  <?php endif; ?>
</main>
<?php get_footer(); ?>