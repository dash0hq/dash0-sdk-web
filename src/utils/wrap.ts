import { debug, warn } from "./debug";

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
    return;
  }

  try {
    const wrapped = wrapper(original);
    // Mark the replacement as well: a later wrap() call reads the replacement from module[target],
    // so marking only the original would let repeated instrumentation wrap the wrapper.
    markAsInstrumented(original);
    if (wrapped) {
      markAsInstrumented(wrapped);
    }
    module[target] = wrapped;
  } catch (e) {
    // Pages can lock properties via Object.defineProperty/Object.freeze -- failing to install
    // one instrumentation must not throw out of init() and abort the remaining ones.
    warn(`failed to instrument ${String(target)}, the page may have locked the property`, e);
  }
}
