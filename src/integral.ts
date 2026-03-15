export type State<TVar extends string> = Record<TVar, [p: number, q: number]>;

export type Dots<TState> = Record<keyof TState, number>;

export abstract class Leapfrog<TVar extends string> {
  protected dt: number;
  abstract readonly state: State<TVar>;
  abstract readonly vars: readonly TVar[];

  abstract calcPDots(state?: State<TVar>): Dots<State<TVar>>;
  abstract calcQDots(state?: State<TVar>): Dots<State<TVar>>;

  constructor(opts: { dt: number }) {
    this.dt = opts.dt;
  }

  step(state: State<TVar> = this.state, dt: number = this.dt): void {
    const pDots = this.calcPDots(state);
    for (const v of this.vars) state[v][0] += pDots[v] * (dt / 2);

    const qDots = this.calcQDots(state);
    for (const v of this.vars) state[v][1] += qDots[v] * dt;

    const pDots2 = this.calcPDots(state);
    for (const v of this.vars) state[v][0] += pDots2[v] * (dt / 2);
  }
}

export abstract class Yoshida4<TVar extends string> extends Leapfrog<TVar> {
  private static readonly W1 = 1 / (2 - Math.cbrt(2));
  private static readonly W0 = 1 - 2 * this.W1;

  override step(state: State<TVar> = this.state): void {
    super.step(state, this.dt * Yoshida4.W1);
    super.step(state, this.dt * Yoshida4.W0);
    super.step(state, this.dt * Yoshida4.W1);
  }
}
