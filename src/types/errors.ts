export type ErrorLike = {
  message: string;
  name?: string;
  stack?: string;
};

export type ReportErrorOpts = {
  componentStack: string | null | undefined;
};
