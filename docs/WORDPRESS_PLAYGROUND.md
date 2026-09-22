# QuantDeus WordPress on GitHub Pages

Production route: `/wordpress/`.

This is **WordPress Playground**, not a conventional server-side PHP/MySQL WordPress install.

- WordPress and PHP run in the visitor's browser via WebAssembly.
- The launcher is hosted by GitHub Pages.
- The configuration lives in `wordpress/blueprint.json`.
- Browser persistence is provided by WordPress Playground saved/autosaved sites.
- GitHub Actions boots the same Blueprint with `@wp-playground/cli` and fails the build if WordPress does not start.
- The regular QuantDeus Store, Mini App, and Coordination Center remain independent.

A conventional multi-user production WordPress with a shared server database would still require PHP hosting. This Playground deployment is suitable for a browser-local CMS, demos, prototyping, theme/plugin work, and GitHub-driven experiments.
