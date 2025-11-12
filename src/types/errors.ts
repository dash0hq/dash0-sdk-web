import { KeyValue } from "./otlp";

export type ErrorLike = {
  message: string;
  name?: string;
  stack?: string;
};

export type ReportErrorOpts = {
  componentStack: string | null | undefined;
  /**
   * Additional attributes to add to the error span
   */
  attributes?: KeyValue[];
};
