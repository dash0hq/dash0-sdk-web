import { ErrorLike, ReportErrorOpts } from "../../types/errors";
import { reportError as reportErrorInternal } from "../instrumentations/errors/unhandled-error";

export function reportError(error: string | ErrorLike, opts?: ReportErrorOpts) {
  reportErrorInternal(error, opts);
}
