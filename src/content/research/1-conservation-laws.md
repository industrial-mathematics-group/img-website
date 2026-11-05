---
title: Hyperbolic conservation laws
summary: Meshfree and particle methods, high-order schemes and kinetic models.
order: 1
software: [hypercloudcore, hypercloud, meshfree-solver-paper]
---

We develop meshfree and particle methods, high-order schemes and kinetic models for hyperbolic systems.

Our solvers work on scattered point clouds, so no mesh has to be generated. Moving least-squares reconstructions provide high-order derivatives, stabilised by a posteriori order detection (MOOD). Stiff source terms, such as kinetic relaxation, are handled with implicit-explicit time integration.
