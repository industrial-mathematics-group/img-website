---
title: How the traffic demo on our front page works
date: 2026-11-05
summary: A kinetic model for two classes of vehicles, and why its traffic can turn into stop-and-go waves.
---

The demo on our front page runs the multi-class kinetic traffic model of Carmen Mezquita-Nieto, Paola Goatin and Axel Klar, from their preprint [A multi-class kinetic traffic flow model](https://arxiv.org/abs/2608.27159). It is a JavaScript port of the path-conservative scheme in their [MATLAB code](https://github.com/industrial-mathematics-group/multi-class-kinetic-traffic-flow-model).

## Vehicles as distributions

A kinetic model doesn't track single vehicles. For each class $c$ of vehicles and each speed $v_i$, it describes how many vehicles drive at that speed by a density $f_i^c(x,t)$. Their sum over the speeds is the density $\rho^c$ of the class, and $r = \rho^1 + \rho^2$ is the total density, scaled so that $r = 1$ means bumper to bumper. The demo uses two speeds, $v_0 = 0$ and $v_1 = 1$, so every vehicle either stands or drives at full speed. For these, the model reads

$$
\begin{aligned}
\partial_t f_0^c - \frac{f_1^c}{1-r}\,\partial_x s &= \frac{1}{\epsilon}\big(\rho^c - F^c - f_0^c\big), \\
\partial_t f_1^c + \partial_x f_1^c + \frac{f_1^c}{1-r}\,\partial_x s &= \frac{1}{\epsilon}\big(F^c - f_1^c\big),
\end{aligned}
$$

where $s = f_0^1 + f_0^2$ is the density of standing vehicles of both classes.

The terms with $\partial_x s$ model braking. They come from drivers who adjust their speed to a slower vehicle ahead, with an interaction that grows as the road fills up, which gives the factor $1/(1-r)$. Where more vehicles stand further ahead, moving vehicles of both classes stop. Braking moves vehicles between speeds, so it doesn't change the density of a class.

The right-hand side relaxes the vehicles of each class towards an equilibrium within a time $\epsilon$. In equilibrium, the flux of class $c$ is

$$
F^c = \rho^c\, V_c \Big(1 - \frac{r}{R_c}\Big)_{+},
$$

with a top speed $V_c$ and a density $R_c$ at which the class stops. The demo uses the values of the periodic test case in the paper: class 1 has $V_1 = 0.6$ and $R_1 = 1$, and class 2 has $V_2 = 1$ and $R_2 = 0.6$. On an empty road, class 2 is faster. Once the total density goes above $0.6$, class 2 stands while class 1 still moves.

## Stop-and-go waves

For small $\epsilon$, the paper derives a macroscopic limit from the kinetic model. The class densities $\rho = (\rho^1, \rho^2)$ then follow a multi-class Lighthill-Whitham-Richards model with a diffusive correction,

$$
\partial_t \rho + \partial_x F(\rho) = \epsilon\, \partial_x \big( D(\rho)\, \partial_x \rho \big),
$$

with a diffusion matrix $D(\rho)$ that depends on both classes. Whether small disturbances of constant traffic die out depends on this matrix and on the mix of the two classes. The paper gives a stability criterion for two classes and checks it with simulations. If the criterion fails, small waves grow into stop-and-go traffic.

The demo starts with the initial densities of one of these simulations, $\rho^1 = 0.3\,(1 + 0.2 \sin 6\pi x)$ and $\rho^2 = 0.2\,(1 + 0.2 \sin 6\pi x)$ with $\epsilon = 0.01$, on a ring road of length 1. The paper finds this state unstable, and within about ten seconds the waves in the demo steepen into queues. Inside the queues, the total density rises above $0.6$: the blue vehicles of class 2 stand, and the red vehicles of class 1 creep through.

## What to try

- Click the road. The drivers in a short stretch brake to a stop for a moment, and a queue builds up behind them.
- At 50 and 60 percent density, the queue leaves stop-and-go waves behind.
- At 20 to 40 percent, the waves and queues dissolve and the traffic becomes uniform again. In our runs, the same happens at 70 percent, where class 2 can't move at all.

## What the demo is not

The periodic simulations in the paper use 21 speeds and 1000 cells, and the demo uses 2 speeds and 800 cells so that it runs smoothly in a browser. With only two speeds, the equilibrium is the same as in the paper, but the vehicles can't brake to an intermediate speed. The scheme adds numerical diffusion that grows with the cell size, and it damps the waves: on a coarser grid of 400 cells, no stop-and-go waves form at all in this setting. So the waves in the demo are somewhat weaker than in the paper.

The dots are not part of the model. We added them to show where the vehicles of each class are. They move with the flow of their class, so their spacing follows the density. Each class gets its own row, but the model describes a single lane. The braking button stops the vehicles in a stretch for a short time. This changes the state of the model, not its equations.
