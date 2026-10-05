---
name: low-spec-3d-reconstruction
description: Plan low-poly 3D reconstruction from limited visual references for constrained hardware, prioritizing silhouette, topology, texture, and honest uncertainty about unseen geometry.
---
# Low-Spec 3D Reconstruction

Use for turning one or a few visual references into a practical low-poly 3D asset.

## Procedure

1. Identify target format, polygon budget, texture budget, target engine/device, and required views.
2. Separate visible geometry from hidden geometry that must be inferred.
3. Prioritize silhouette and proportions before surface detail.
4. Use textures/normal maps to carry detail that does not justify geometry.
5. Keep topology simple, manifold where required, and easy to edit.
6. Validate scale, normals, UVs, material count, and export format.
7. If only one image exists, explicitly mark unseen surfaces as estimates.

## Constraint

A single photograph cannot uniquely determine a complete 3D object. Never describe inferred back/side geometry as measured fact.
