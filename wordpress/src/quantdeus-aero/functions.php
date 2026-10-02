<?php
if (!defined('ABSPATH')) { exit; }
add_action('after_setup_theme', function(){
    add_theme_support('title-tag'); add_theme_support('post-thumbnails'); add_theme_support('html5',['search-form','gallery','caption','style','script']);
    register_nav_menus(['primary'=>'Primary']);
});
add_action('wp_enqueue_scripts', function(){ wp_enqueue_style('quantdeus-aero', get_stylesheet_uri(), [], wp_get_theme()->get('Version')); });
