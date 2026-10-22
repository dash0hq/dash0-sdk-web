import * as process from "node:process";

export type CapabilityConfig = WebdriverIO.Config["capabilities"][number] & {
  enabled?: boolean;
};

export function getEnabledCapabilityNames(all: Record<string, CapabilityConfig>): string[] {
  return Object.entries(all)
    .filter(([_, value]) => value.enabled !== false)
    .map(([key]) => key);
}

export function getSelectedCapabilities(all: Record<string, CapabilityConfig>): CapabilityConfig[] {
  const selected = (process.env["WDIO_SELECTED_CAPABILITIES"] ?? "").split(",");

  if (!selected.length || selected[0] === "") {
    selected.push(...Object.keys(all));
  }

  return Object.entries(all)
    .filter(([_, value]) => value.enabled !== false)
    .filter(([key]) => selected.includes(key))
    .map(([_, value]) => value);
}
