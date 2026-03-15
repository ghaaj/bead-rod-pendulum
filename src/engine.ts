import { type Dots, type State, Yoshida4 } from "./integral.ts";

export type Point2D = [x: number, y: number];

export interface RenderableState {
  rodEnd: Point2D;
  bead: Point2D;
  hamiltonian: number;
}

export type ProjectileVar = "X" | "Y" | "θ";
export type ProjectileState = State<ProjectileVar>;
export type PendulumVar = "x" | "θ";
export type PendulumState = State<PendulumVar>;

enum SimulatorMode {
  Constrained = "constrained",
  Free = "free",
}

interface IEngine<M extends SimulatorMode, TVar extends string> {
  // protected dt: number;
  readonly mode: M;
  readonly state: State<TVar>;
  readonly vars: readonly TVar[];
  step(state?: State<TVar>): void;
  calcRenderableState(): RenderableState;
  importSimulatorState(state: SimulatorStateExceptFor<M>): void;
}

type Engine<M extends SimulatorMode = SimulatorMode> = Extract<
  PendulumEngine | ProjectileEngine,
  { mode: M }
>;

type SimulatorState<M extends SimulatorMode = SimulatorMode> = M extends M
  ? Readonly<Pick<Engine<M>, "mode" | "state" | "params" | "calcPDots" | "calcQDots">>
  : never;

type SimulatorStateExceptFor<M extends SimulatorMode> = SimulatorState<
  Exclude<SimulatorMode, M>
>;

export interface Params {
  g: number;
  dt: number;
  l: number;
  m: number;
  M: number;
  showLocus: boolean;
  init: PendulumState;
  rodI: number;
}

export interface Blueprint extends Params {
  $theta0: number;
}

abstract class BaseEngine<TVar extends string> extends Yoshida4<TVar> {
  /** `state` should be assigned immediately after the engine is instantiated */
  state!: State<TVar>;

  refreshParams(params: Params) {
    this.params = params;
    requestAnimationFrame(() => this.dt = this.params.dt);
  }

  refreshState(init: State<TVar>) {
    this.state = init;
  }

  constructor(public params: Params) {
    super({ dt: params.dt });
    this.refreshParams(params);
  }
}

class PendulumEngine extends BaseEngine<PendulumVar>
  implements IEngine<SimulatorMode.Constrained, PendulumVar> {
  readonly mode = SimulatorMode.Constrained;
  readonly vars: readonly PendulumVar[] = ["x", "θ"];

  override calcPDots(state: PendulumState = this.state): Dots<PendulumState> {
    const { m, g, rodI } = this.params;
    const { x: [, x], θ: [pθ, θ] } = state;
    return {
      x: m * x * (pθ ** 2) / (rodI + m * (x ** 2)) ** 2 - m * g * Math.sin(θ),
      θ: -m * g * x * Math.cos(θ),
    };
  }

  override calcQDots(state: PendulumState = this.state): Dots<PendulumState> {
    const { m, rodI } = this.params;
    const { x: [px, x], θ: [pθ] } = state;
    return {
      x: px / m,
      θ: pθ / (rodI + m * (x ** 2)),
    };
  }

  calcRenderableState(): RenderableState {
    const { x: [px, x], θ: [pθ, θ] } = this.state;
    const { m, g, l, rodI } = this.params;
    const [cos, sin] = [Math.cos(θ), Math.sin(θ)];
    return {
      rodEnd: [l * cos, l * sin],
      bead: [x * cos, x * sin],
      get hamiltonian() {
        return (px ** 2) / (2 * m) + pθ ** 2 / (2 * (rodI + m * x ** 2)) + m * g * x * sin;
      },
    };
  }

  importSimulatorState(state: SimulatorStateExceptFor<SimulatorMode.Constrained>): void {
    throw new Error(
      `UnsupportedError: Importing states from mode '${state.mode}' to mode '${this.mode}' is not supported.`,
    );
  }
}

class ProjectileEngine extends BaseEngine<ProjectileVar>
  implements IEngine<SimulatorMode.Free, ProjectileVar> {
  readonly mode = SimulatorMode.Free;
  readonly vars: readonly ProjectileVar[] = ["X", "Y", "θ"];

  override calcPDots(_state: State<ProjectileVar> = this.state): Dots<ProjectileState> {
    const { m, g } = this.params;
    return {
      X: 0,
      Y: -m * g,
      θ: 0,
    };
  }

  override calcQDots(state: State<ProjectileVar> = this.state): Dots<ProjectileState> {
    const { X: [pX], Y: [pY], θ: [pθ] } = state;
    const { m, rodI } = this.params;
    return {
      X: pX / m,
      Y: pY / m,
      θ: pθ / rodI,
    };
  }

  calcRenderableState(): RenderableState {
    const { X: [pX, X], Y: [pY, Y], θ: [pθ, θ] } = this.state;
    const { m, l, g, rodI } = this.params;
    const [cos, sin] = [Math.cos(θ), Math.sin(θ)];
    return {
      rodEnd: [l * cos, l * sin],
      bead: [X, Y],
      get hamiltonian() {
        return (pX ** 2 + pY ** 2) / (2 * m) + m * g * Y + pθ ** 2 / (2 * rodI);
      },
    };
  }

  importSimulatorState(state: SimulatorStateExceptFor<SimulatorMode.Free>): void {
    const { x: [, x], θ: [, θ] } = state.state;
    const { x: v, θ: ω } = state.calcQDots();
    const { rodI } = state.params;
    const [cos, sin] = [Math.cos(θ), Math.sin(θ)];
    this.refreshState({
      X: [v * cos - x * ω * sin, x * cos],
      Y: [v * sin + x * ω * cos, x * sin],
      θ: [rodI * ω, θ],
    });
  }
}

function isMode<M extends SimulatorMode>(engine: Engine, mode: M): engine is Engine<M> {
  return engine.mode === mode;
}

export class Simulator {
  #params!: Params;
  get params() {
    return this.#params;
  }

  private engineMap: { [M in SimulatorMode]: Engine<M> };
  private engine: Engine;

  refreshParams() {
    this.#params = structuredClone(this.blueprint);
    this.engine.refreshParams(this.#params);
  }

  handleReset() {
    this.refreshParams();
    this.switchEngine(SimulatorMode.Constrained).refreshState(this.blueprint.init);
  }

  private switchEngine<M extends SimulatorMode>(mode: M): Engine<M> {
    if (isMode(this.engine, mode)) return this.engine;
    const newEngine = this.engineMap[mode];
    switch (true) {
      case isMode(newEngine, SimulatorMode.Constrained):
        // ProjectileEngine ---> PendulumEngine
        newEngine.refreshState(this.blueprint.init);
        break;
      case isMode(newEngine, SimulatorMode.Free):
        // PendulumEngine -----> ProjectileEngine
        newEngine.importSimulatorState(this.engine as SimulatorStateExceptFor<SimulatorMode.Free>);
        break;
      default:
        newEngine satisfies never;
    }
    this.engine = newEngine;
    return newEngine;
  }

  constructor(private blueprint: Blueprint) {
    /**
     * lifecycle:
     * PendulumEngine -----> ProjectileEngine
     *      ▲  │                   │
     *      └──┘───────reset───────┘
     */
    const pendulumEngine = new PendulumEngine(blueprint);
    const projectileEngine = new ProjectileEngine(blueprint);
    pendulumEngine.refreshState(blueprint.init); // copy of init
    this.engineMap = {
      [SimulatorMode.Constrained]: pendulumEngine,
      [SimulatorMode.Free]: projectileEngine,
    };
    this.engine = pendulumEngine;
    this.refreshParams();
  }

  step() {
    this.engine.step();
    if (isMode(this.engine, SimulatorMode.Constrained)) {
      const { x: [, x] } = this.engine.state;
      const { l } = this.engine.params;
      if (Math.abs(x) > l) this.switchEngine(SimulatorMode.Free);
    }
  }

  get renderableState() {
    return this.engine.calcRenderableState();
  }
}
