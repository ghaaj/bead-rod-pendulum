import "./style.css";
import p5 from "p5";
import { Pane } from "tweakpane";
import { unsafeGetBinding } from "./tweakpane-utils.ts";
import { type Blueprint, type PendulumState, type Point2D, Simulator } from "./engine.ts";
import type { GraphLogMonitorBindingApi } from "@tweakpane/core";

const rad = (deg: number) => deg * Math.PI / 180;

const baseParams: Blueprint = {
  dt: 0.075,
  l: 200,
  m: 1,
  M: 2,
  showLocus: true,
  $gravity: true,
  $theta0: 50,
  $omega0: 0,
  $x0perl: 1,
  $v0: 0,
  get g() {
    return this.$gravity ? 9.81 : 0;
  },
  get init(): PendulumState {
    const x0 = this.l * this.$x0perl;
    return {
      x: [this.m * this.$v0, x0],
      θ: [rad(this.$omega0) * (this.rodI + this.m * x0 ** 2), rad(this.$theta0)],
    };
  },
  get rodI() {
    return 1 / 3 * this.M * this.l ** 2;
  },
};

const simulator = new Simulator(baseParams);

type Binding<
  K extends keyof Blueprint =
    | "l"
    | "m"
    | "M"
    | "dt"
    | "showLocus"
    | "$gravity"
    | "$theta0"
    | "$omega0"
    | "$x0perl"
    | "$v0",
> = K extends K ? {
    key: K;
    value: Blueprint[K];
  }
  : never;

type MonitorBinding = { key: "hamiltonian"; value: number };

new p5((p: p5) => {
  let isPlaying = false;
  let isReset = true;

  const locus: Point2D[] = [];
  function setIsReset(value: boolean) {
    isReset = value && !isPlaying;
    bcFolder.disabled = !isReset;
    if (value) locus.length = 0;
  }

  const pane = new Pane();
  const materialFolder = pane.addFolder({ title: "Material", expanded: false });
  materialFolder.addBinding(baseParams, "l", { min: 0 });
  materialFolder.addBinding(baseParams, "m", { min: 0 });
  materialFolder.addBinding(baseParams, "M", { min: 0 });

  const simFolder = pane.addFolder({ title: "Simulation", expanded: false });
  simFolder.addBinding(baseParams, "dt", { min: 0, max: 1 });
  simFolder.addBinding(baseParams, "$gravity", { label: "Gravity" });
  simFolder.addBinding(baseParams, "showLocus", { label: "Show Locus" });

  function initializeHamiltonianMonitor() {
    const hamiltonianInit = simulator.renderableState.hamiltonian;
    const { valueController: { props }, value: { rawValue } } = hamiltonianMonitor.controller;
    props.set("min", hamiltonianInit * 0.9);
    props.set("max", hamiltonianInit * 1.1);
    rawValue.fill(undefined);
  }
  const hamiltonianOpts = {
    enabled: true,
    get hamiltonian() {
      return simulator.renderableState.hamiltonian;
    },
  };
  simFolder.addBinding(hamiltonianOpts, "enabled", { label: "Monitor Hamiltonian" }).on(
    "change",
    () => {
      hamiltonianMonitor.hidden = !hamiltonianOpts.enabled;
    },
  );
  const hamiltonianMonitor = simFolder.addBinding(hamiltonianOpts, "hamiltonian", {
    label: "Hamiltonian",
    readonly: true,
    view: "graph",
  }) as GraphLogMonitorBindingApi;
  initializeHamiltonianMonitor();

  const bcFolder = pane.addFolder({ title: "Boundary Conditions", expanded: true });
  bcFolder.addBinding(baseParams, "$theta0", {
    min: -90,
    max: 90,
    label: "θ₀",
    step: 0.0001,
  });
  bcFolder.addBinding(baseParams, "$omega0", {
    label: "ω₀",
    step: 0.01,
  });
  bcFolder.addBinding(baseParams, "$x0perl", {
    label: "x₀ / l",
    min: -1,
    max: 1,
    step: 0.01,
  });
  bcFolder.addBinding(baseParams, "$v0", {
    label: "v₀",
    step: 0.01,
  });

  pane.addButton({
    title: "Play / Pause",
  }).on("click", () => {
    isPlaying = !isPlaying;
    setIsReset(false);
  });
  pane.addButton({
    title: "Reset",
  }).on("click", () => {
    simulator.handleReset();
    initializeHamiltonianMonitor();
    setIsReset(true);
  });

  pane.on("change", (e) => {
    const binding = unsafeGetBinding<Binding | MonitorBinding>(e);
    if (!binding) return;
    switch (binding.key) {
      case "hamiltonian":
        break;
      case "showLocus":
        simulator.refreshParams();
        break;
      default:
        if (isReset) {
          simulator.handleReset();
        } else {
          simulator.refreshParams();
        }
        initializeHamiltonianMonitor();
    }
  });

  let diagonalLength: number;
  let drawingContext: CanvasRenderingContext2D;
  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight, p5.P2D);
    diagonalLength = Math.hypot(p.width, p.height);
    drawingContext = p.drawingContext as CanvasRenderingContext2D;
  };

  p.draw = () => {
    const { showLocus } = simulator.params;
    const { θ: [, theta0] } = simulator.params.init;
    const { rodEnd: [rodEndX, rodEndY], bead: [beadX, beadY] } = simulator.renderableState;
    p.background(250);

    p.translate(p.width / 2, p.height / 2);
    p.scale(1, -1);

    drawingContext.setLineDash([10, 7]);
    p.stroke("gray");
    p.noFill();
    p.strokeWeight(1.5);
    const rayEndX = diagonalLength * p.cos(theta0);
    const rayEndY = diagonalLength * p.sin(theta0);
    p.beginShape();
    p.vertex(-rayEndX, rayEndY);
    p.vertex(0, 0);
    p.vertex(rayEndX, rayEndY);
    p.endShape();

    if (showLocus) {
      p.stroke(235, 76, 76);
      p.beginShape();
      locus.forEach(([lx, ly]) => p.vertex(lx, ly));
      p.endShape();
    }

    drawingContext.setLineDash([]);

    p.stroke("black");
    p.strokeWeight(2);
    p.line(rodEndX, rodEndY, -rodEndX, -rodEndY);

    p.fill("black");
    p.rect(-2, -2, 4, 4);

    p.fill(255, 255, 255);
    p.ellipse(beadX, beadY, 20, 20);

    if (isPlaying) {
      locus.push([beadX, beadY]);
      simulator.step();
    }
  };
});
