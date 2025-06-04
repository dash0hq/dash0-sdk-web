import { debug } from "./debug";

const INSTRUMENTED_BY_DASH0_SYMBOL = Symbol.for("INSTRUMENTED_BY_DASH0");

function isAlreadyInstrumented(objOrFunction: object) {
  // @ts-expect-error -- typescript does not know about this hidden marker and we're not going to tell it 🤫
  return objOrFunction[INSTRUMENTED_BY_DASH0_SYMBOL] === true;
}

function markAsInstrumented(objOrFunction: object) {
  // @ts-expect-error -- typescript does not know about this hidden marker and we're not going to tell it 🤫
  objOrFunction[INSTRUMENTED_BY_DASH0_SYMBOL] = true;
}

export function wrap<ModuleType extends object, TargetNameType extends keyof ModuleType>(
  module: ModuleType,
  target: TargetNameType,
  wrapper: (original: ModuleType[TargetNameType]) => ModuleType[TargetNameType]
) {
  const original = module[target];

  if (!original) {
    debug(`${String(target)} is not defined, unable to instrument`);
    return;
  }

  if (isAlreadyInstrumented(original)) {
    debug(`${String(target)} has already been instrumented, skipping`);
  }

  markAsInstrumented(original);
  module[target] = wrapper(original);
}
