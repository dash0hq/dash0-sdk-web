import { reportUnhandledError as reportErrorInternal } from "../instrumentations/errors/unhandled-error";
import { ReportErrorOpts, ErrorLike } from "../types/errors";

export function reportError(error: string | ErrorLike, opts?: ReportErrorOpts) {
  reportErrorInternal(error, opts);
}
