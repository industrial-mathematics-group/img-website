---
title: How the traffic demo on our front page works
date: 2026-11-04
summary: Why cars that only look at the gap ahead end up following a conservation law.
---

The demo on our front page shows one idea behind much of our work: many simple particles can behave like a continuum.

## From cars

Take $N$ cars of length $\ell$ at positions $x_1 < x_2 < \dots < x_N$. Each car only reacts to the gap ahead, which defines a local density:

$$
\rho_i = \frac{\ell}{x_{i+1} - x_i}, \qquad \dot{x}_i = v(\rho_i), \qquad v(\rho) = 1 - \rho .
$$

This is a follow-the-leader model. At $\rho = 1$ cars are bumper to bumper and stop, and on an empty road they drive at full speed.

## To a conservation law

Now add more cars and make each one shorter, so that the total mass $N\ell$ stays fixed. The stepped density in the demo then approaches a smooth function that solves the Lighthill-Whitham-Richards equation:

$$
\partial_t \rho + \partial_x \big( \rho \, v(\rho) \big) = 0 .
$$

Di Francesco and Rosini [proved this many-particle limit](https://doi.org/10.1007/s00205-015-0843-4) for a general class of velocity laws on the real line. You can see it in the demo by moving the slider from 20 to 1000 cars.

## What to look for

When the light turns red, the back of the queue moves upstream as a shock, where the density jumps. When it turns green, the front of the queue dissolves gradually as a rarefaction wave. Neither is programmed in. Both come from cars following the rule above.

## What the demo is not

The road is a ring and the traffic light is a stationary obstacle that switches on and off. Both go beyond the setting of the theorem, so read the demo as an illustration. It is a short JavaScript program using explicit Euler time steps, and it doesn't use our solvers. For real simulations, see [our software](/software/).
