import { defineConfig } from "vite";
import deno from "@deno/vite-plugin";

export default defineConfig({
  base: "./",
  plugins: [deno()],
});
