const MAX_DEPTH = 3;
const MAX_ENTRIES = 50;
const TRUNCATION_MARKER = "…";

/**
 * Formats console arguments into one string, the way browsers print them: a leading string may contain `%s`, `%d`,
 * `%i`, `%f`, `%o`, `%O`, `%j` and `%c` substitutions, and the remaining arguments are appended, separated by spaces.
 *
 * The work is bounded by `maxLength`: objects are serialized only until the output reaches it, so logging a large
 * object costs no more than logging a short one.
 */
export function formatConsoleArgs(args: ArrayLike<unknown>, maxLength: number): string {
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
      write(out, JSON.stringify(value));
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

  const isArray = Array.isArray(obj);
  if (depth >= MAX_DEPTH) {
    write(out, isArray ? "[Array]" : "[Object]");
    return;
  }

  ancestors.push(obj);
  try {
    if (isArray) {
      writeEntries(out, "[", "]", obj.length, (i) => writeNested(out, obj[i], depth + 1, ancestors));
    } else {
      const keys = Object.keys(obj);
      writeEntries(out, "{", "}", keys.length, (i) => {
        write(out, JSON.stringify(keys[i]) + ":");
        writeNested(out, readProperty(obj, keys[i]!), depth + 1, ancestors);
      });
    }
  } finally {
    ancestors.pop();
  }
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

function readProperty(obj: object, key: string): unknown {
  try {
    return (obj as Record<string, unknown>)[key];
  } catch (_ignored) {
    // Getters may throw.
    return "[Unreadable]";
  }
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

function write(out: Output, s: string): void {
  if (isFull(out)) return;
  out.parts.push(s);
  out.length += s.length;
}

function isFull(out: Output): boolean {
  return out.length > out.maxLength;
}

function finish(out: Output): string {
  const s = out.parts.join("");
  return s.length > out.maxLength ? s.substring(0, out.maxLength) + TRUNCATION_MARKER : s;
}
