const MAX_DEPTH = 3;
const MAX_ENTRIES = 50;

export type FormattedConsoleArgs = {
  /** The formatted message, at most `maxLength` characters long. */
  text: string;
  /** Whether the message was longer than `maxLength` and cut. */
  truncated: boolean;
};

/**
 * Formats console arguments into one string, the way browsers print them: a leading string may contain `%s`, `%d`,
 * `%i`, `%f`, `%o`, `%O`, `%j` and `%c` substitutions, and the remaining arguments are appended, separated by spaces.
 *
 * The work is bounded by `maxLength`: strings are cut and objects serialized only until the output reaches it, and
 * arrays and typed arrays are read only up to their first entries. Plain objects with very many keys are the
 * exception, because enumerating their keys is proportional to their size.
 *
 * The result is cut, but carries no truncation marker: the caller scrubs it before cutting it to its final length.
 */
export function formatConsoleArgs(args: ArrayLike<unknown>, maxLength: number): FormattedConsoleArgs {
  const out: Output = { parts: [], length: 0, maxLength };
  let next = 0;

  const first = args[0];
  if (typeof first === "string" && first.indexOf("%") !== -1) {
    next = 1;
    for (let i = 0; i < first.length && !isFull(out); i++) {
      const char = first[i];
      if (char !== "%" || i === first.length - 1) {
        write(out, char!);
        continue;
      }

      const directive = first[i + 1];
      if (directive === "%") {
        write(out, "%");
        i++;
        continue;
      }

      if (!isDirective(directive) || next >= args.length) {
        write(out, char);
        continue;
      }

      const arg = args[next++];
      i++;
      switch (directive) {
        case "s":
          writeValue(out, arg);
          break;
        case "d":
        case "i":
          write(out, typeof arg === "symbol" ? "NaN" : String(parseInt(String(arg), 10)));
          break;
        case "f":
          write(out, typeof arg === "symbol" ? "NaN" : String(parseFloat(String(arg))));
          break;
        case "c":
          // CSS styling has no meaning outside the devtools console.
          break;
        default:
          writeValue(out, arg);
      }
    }
  }

  for (; next < args.length && !isFull(out); next++) {
    if (out.length > 0) write(out, " ");
    writeValue(out, args[next]);
  }

  return finish(out);
}

function isDirective(c: string | undefined): boolean {
  return c === "s" || c === "d" || c === "i" || c === "f" || c === "o" || c === "O" || c === "j" || c === "c";
}

/**
 * Writes a top-level argument. Strings are written as they are, everything else as by `writeNested`.
 */
function writeValue(out: Output, value: unknown): void {
  if (typeof value === "string") {
    write(out, value);
    return;
  }
  writeNested(out, value, 0, []);
}

function writeNested(out: Output, value: unknown, depth: number, ancestors: object[]): void {
  if (isFull(out)) return;

  switch (typeof value) {
    case "string":
      // Cut before quoting, so that a large nested string is not copied in full. The quotes still push the output
      // past `maxLength`, so the message is marked as truncated.
      write(out, JSON.stringify(value.length > remaining(out) ? value.substring(0, remaining(out)) : value));
      return;
    case "number":
    case "boolean":
    case "undefined":
      write(out, String(value));
      return;
    case "bigint":
      write(out, String(value) + "n");
      return;
    case "symbol":
      write(out, value.toString());
      return;
    case "function":
      write(out, `[Function${value.name ? ": " + value.name : ""}]`);
      return;
  }

  if (value === null) {
    write(out, "null");
    return;
  }

  const obj = value as object;

  if (isError(obj)) {
    write(out, errorToString(obj));
    return;
  }

  if (isElement(obj)) {
    write(out, describeElement(obj));
    return;
  }

  if (obj instanceof Date) {
    write(out, isNaN(obj.getTime()) ? "Invalid Date" : obj.toISOString());
    return;
  }

  if (obj instanceof RegExp) {
    write(out, String(obj));
    return;
  }

  if (ancestors.indexOf(obj) !== -1) {
    write(out, "[Circular]");
    return;
  }

  // Typed arrays are indexed like arrays. Enumerating their keys instead would allocate one per element.
  const isIndexed = Array.isArray(obj) || isTypedArray(obj);
  if (depth >= MAX_DEPTH) {
    write(out, isIndexed ? "[Array]" : "[Object]");
    return;
  }

  ancestors.push(obj);
  try {
    if (isIndexed) {
      const length = (obj as ArrayLike<unknown>).length;
      writeEntries(out, "[", "]", length, (i) => writeOwnProperty(out, obj, String(i), depth + 1, ancestors));
    } else {
      const keys = Object.keys(obj);
      writeEntries(out, "{", "}", keys.length, (i) => {
        write(out, JSON.stringify(keys[i]) + ":");
        writeOwnProperty(out, obj, keys[i]!, depth + 1, ancestors);
      });
    }
  } finally {
    ancestors.pop();
  }
}

function isTypedArray(obj: object): obj is ArrayLike<number | bigint> {
  // DataView is a view too, but has no indexed entries.
  return typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(obj) && !(obj instanceof DataView);
}

function writeEntries(out: Output, open: string, close: string, count: number, writeEntry: (i: number) => void) {
  write(out, open);
  const shown = Math.min(count, MAX_ENTRIES);
  for (let i = 0; i < shown && !isFull(out); i++) {
    if (i > 0) write(out, ",");
    writeEntry(i);
  }
  if (count > shown) {
    write(out, `,…${count - shown} more`);
  }
  write(out, close);
}

/**
 * Writes an own property without running its getter. Devtools do not run getters either, and they may have side
 * effects: lazy loading, reactivity tracking, or logging. Reading the descriptor also bypasses the `get` trap that
 * reactive frameworks use on proxies to track reads.
 */
function writeOwnProperty(out: Output, obj: object, key: string, depth: number, ancestors: object[]): void {
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(obj, key);
  } catch (_ignored) {
    // Proxy traps may throw.
    write(out, "[Unreadable]");
    return;
  }

  if (descriptor && (descriptor.get || descriptor.set)) {
    write(out, descriptor.get ? (descriptor.set ? "[Getter/Setter]" : "[Getter]") : "[Setter]");
    return;
  }

  // Array holes have no descriptor and print as `undefined`.
  writeNested(out, descriptor?.value, depth, ancestors);
}

export function isError(value: unknown): value is Error {
  if (value instanceof Error) return true;
  // Errors from other realms (iframes) fail the instanceof check.
  return Object.prototype.toString.call(value) === "[object Error]";
}

function errorToString(error: Error): string {
  const name = error.name || "Error";
  return error.message ? `${name}: ${error.message}` : name;
}

function isElement(value: object): value is Element {
  return (value as Node).nodeType === 1 && typeof (value as Element).tagName === "string";
}

function describeElement(element: Element): string {
  let description = "<" + element.tagName.toLowerCase();
  if (element.id) description += ` id="${element.id}"`;
  const className = element.getAttribute?.("class");
  if (className) description += ` class="${className}"`;
  return description + ">";
}

type Output = {
  parts: string[];
  length: number;
  maxLength: number;
};

/**
 * Appends to the output. Everything beyond one character past `maxLength` is dropped right away, so a large string
 * is never copied in full. That one character tells `finish` that the output was cut.
 */
function write(out: Output, s: string): void {
  if (isFull(out)) return;
  const kept = s.length > remaining(out) ? s.substring(0, remaining(out)) : s;
  out.parts.push(kept);
  out.length += kept.length;
}

/** The number of characters `write` still keeps. */
function remaining(out: Output): number {
  return out.maxLength + 1 - out.length;
}

function isFull(out: Output): boolean {
  return out.length > out.maxLength;
}

function finish(out: Output): FormattedConsoleArgs {
  const s = out.parts.join("");
  return s.length > out.maxLength
    ? { text: s.substring(0, out.maxLength), truncated: true }
    : { text: s, truncated: false };
}
