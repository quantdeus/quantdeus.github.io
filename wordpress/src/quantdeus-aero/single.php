<?php
if (!defined('ABSPATH')) { exit; }
get_header();
$type=get_post_type();
$node_fields=[
  'identity'=>'Identity','mission'=>'Mission','evidence'=>'Evidence','artifacts'=>'Artifacts','metrics'=>'Metrics',
  'replication'=>'Replication','safety'=>'Safety','exit'=>'EXIT','governance'=>'Governance','human_override'=>'Human Override'
];
$research_fields=[
  'fact'=>'FACT','evidence'=>'EVIDENCE','hypothesis'=>'HYPOTHESIS','unknown'=>'UNKNOWN','next_test'=>'NEXT TEST','falsifier'=>'FALSIFIER'
];
?>
<main class="qd-shell qd-section qd-single">
<?php while(have_posts()): the_post(); ?>
  <article <?php post_class('qd-card qd-single-card'); ?>>
    <header class="qd-single-head">
      <span class="qd-kicker"><?php echo esc_html(strtoupper((string)get_post_type_object($type)?->labels?->singular_name)); ?></span>
      <h1><?php the_title(); ?></h1>
      <?php if(has_post_thumbnail()): ?><div class="qd-single-hero"><?php the_post_thumbnail('large'); ?></div><?php endif; ?>
    </header>
    <div class="qd-prose"><?php the_content(); ?></div>

    <?php if($type==='qd_node'): ?>
      <section class="qd-data-panel">
        <h2>Federation Interface v1</h2>
        <div class="qd-data-grid">
        <?php foreach($node_fields as $key=>$label): $value=(string)get_post_meta(get_the_ID(),'qd_'.$key,true); ?>
          <div><b><?php echo esc_html($label); ?></b><p><?php echo $value!=='' ? esc_html($value) : 'UNKNOWN / NOT PROVIDED'; ?></p></div>
        <?php endforeach; ?>
        </div>
      </section>
    <?php elseif($type==='qd_research'): ?>
      <?php $grade=(string)get_post_meta(get_the_ID(),'qd_evidence_grade',true); if(!$grade){$terms=wp_get_post_terms(get_the_ID(),'qd_evidence_grade',['fields'=>'slugs']);$grade=$terms[0]??'UNKNOWN';} ?>
      <section class="qd-data-panel">
        <h2>Evidence Grade: <?php echo esc_html(strtoupper($grade)); ?></h2>
        <div class="qd-data-grid qd-research-grid">
        <?php foreach($research_fields as $key=>$label): $value=(string)get_post_meta(get_the_ID(),'qd_'.$key,true); ?>
          <div><b><?php echo esc_html($label); ?></b><p><?php echo $value!=='' ? esc_html($value) : 'UNKNOWN / NOT PROVIDED'; ?></p></div>
        <?php endforeach; ?>
        </div>
      </section>
    <?php elseif($type==='qd_project'): ?>
      <section class="qd-data-panel"><h2>Operational Loop</h2><p><b>Current stage:</b> <?php echo esc_html((string)(get_post_meta(get_the_ID(),'qd_loop_stage',true) ?: 'UNKNOWN')); ?></p></section>
    <?php endif; ?>

    <footer class="qd-single-foot">
      <a class="qd-btn alt" href="<?php echo esc_url(get_post_type_archive_link($type) ?: home_url('/')); ?>">← Назад в раздел</a>
    </footer>
  </article>
<?php endwhile; ?>
</main>
<?php get_footer(); ?>