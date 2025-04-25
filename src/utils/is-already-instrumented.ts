const INSTRUMENTED_BY_DASH0_SYMBOL = Symbol.for("INSTRUMENTED_BY_DASH0");

export function isAlreadyInstrumented(objOrFunction: object) {
  // @ts-expect-error -- typescript does not know about this hidden marker and we're not going to tell it 🤫
  return objOrFunction[INSTRUMENTED_BY_DASH0_SYMBOL] === true;
}

export function markAsInstrumented(objOrFunction: object) {
  // @ts-expect-error -- typescript does not know about this hidden marker and we're not going to tell it 🤫
  objOrFunction[INSTRUMENTED_BY_DASH0_SYMBOL] = true;
}
