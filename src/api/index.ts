import { identify } from "./identify";
import { debug } from "./debug";
import { init } from "./init";

export const apis = {
  "init": init,
  "debug": debug,
  "identify": identify,
} as const;
