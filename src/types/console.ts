export type ConsoleMethod = "debug" | "log" | "info" | "warn" | "error" | "trace";

export type ConsoleLogSettings = {
  /**
   * The console methods whose messages are sent. Add `"log"`, `"info"`, `"debug"` and `"trace"` to capture all
   * console output.
   *
   * @default ["warn", "error"]
   */
  levels?: ConsoleMethod[];

  /**
   * Messages matching any of these regular expressions are not sent. Matched against the formatted message.
   */
  ignoreMessages?: RegExp[];

  /**
   * The maximum length of a sent message, in characters. Longer messages are truncated.
   *
   * @default 4096
   */
  maxMessageLength?: number;
};
