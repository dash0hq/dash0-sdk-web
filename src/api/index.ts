import { identify } from "./identify";
import { debug } from "../debug";

export const apis = {
  debug: debug,
  identify: identify,
} as const;
