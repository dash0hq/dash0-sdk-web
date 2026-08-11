// Clobber-safe element reads.
//
// `HTMLFormElement` is declared `[LegacyOverrideBuiltIns]`, so a named form control
// shadows built-in properties *on the form element itself*: given
// `<form id="real"><input name="id"></form>`, `form.id` returns the input element
// rather than "real". `<input name="id">` is ordinary markup, so any code reading
// `.id` off a DOM element it did not create can receive an Element instead of a
// string. `tagName`, `classList` and even `getAttribute` are shadowable the same
// way -- which is why switching to `element.getAttribute("id")` is not a fix on its
// own: with `<input name="getAttribute">` the method itself is an element and
// calling it throws.
//
// Reading through the `Element.prototype` accessors sidesteps all of it, because the
// form's named getter only ever creates own properties on the form instance. Only
// `<form>` is affected -- a `<div>` containing `<input name="id">` reads normally --
// but the safe accessors cost nothing on other elements, so they are used
// unconditionally.
//
// Note that jsdom does not implement this shadowing, so unit tests have to simulate
// it with `Object.defineProperty`; the real behaviour is only observable in a browser.

// Resolved once. It is important to check via typeof here because Element might not
// even be declared when imported in ssr.
const elementProto = typeof Element !== "undefined" ? Element.prototype : undefined;
const protoGetAttribute = elementProto?.getAttribute;
const protoTagName = elementProto
  ? (Object.getOwnPropertyDescriptor(elementProto, "tagName")?.get as ((this: Element) => string) | undefined)
  : undefined;

/**
 * `element.getAttribute(name)`, immune to a shadowed `getAttribute`.
 */
export function elementAttribute(element: Element, name: string): string | null {
  return protoGetAttribute ? protoGetAttribute.call(element, name) : element.getAttribute(name);
}

/**
 * `element.tagName`, immune to a shadowed `tagName`. Uppercase for HTML elements in
 * HTML documents, matching the property it replaces.
 */
export function elementTag(element: Element): string {
  return protoTagName ? protoTagName.call(element) : element.tagName;
}

/**
 * `element.id`, immune to a shadowed `id`. Returns "" when the element has no id,
 * matching the property it replaces.
 */
export function elementId(element: Element): string {
  return elementAttribute(element, "id") ?? "";
}

/**
 * The first of the element's class names, immune to a shadowed `classList`.
 * Equivalent to `element.classList.item(0)`, undefined when there is none.
 */
export function elementFirstClass(element: Element): string | undefined {
  const classes = elementAttribute(element, "class");
  if (!classes) return undefined;
  return classes.trim().split(/\s+/)[0] || undefined;
}
