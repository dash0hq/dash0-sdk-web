import { identify } from "@/api/identify";
import { debug } from "@/api/debug";

export const apis = {
  'debug': debug,
  'identify': identify,
} as const;
