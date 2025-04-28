import { addSpanEvent, InProgressSpan } from "./span";
import { KeyValue, SpanStatus } from "../../../types/otlp";
import { addAttribute } from "./attributes";
import {
  EVENT_NAME_EXCEPTION,
  EXCEPTION_MESSAGE,
  EXCEPTION_STACKTRACE,
  EXCEPTION_TYPE,
  SPAN_STATUS_ERROR,
} from "../../semantic-conventions";

interface ExceptionWithCode {
  code: string | number;
  name?: string;
  message?: string;
  stack?: string;
}

interface ExceptionWithMessage {
  code?: string | number;
  message: string;
  name?: string;
  stack?: string;
}

interface ExceptionWithName {
  code?: string | number;
  message?: string;
  name: string;
  stack?: string;
}

export type Exception = ExceptionWithCode | ExceptionWithMessage | ExceptionWithName | string;

export function recordException(span: InProgressSpan, exception: Exception) {
  const attributes: KeyValue[] = [];

  if (typeof exception === "string") {
    addAttribute(attributes, EXCEPTION_MESSAGE, exception);
  } else if (exception) {
    if (exception.code) {
      addAttribute(attributes, EXCEPTION_TYPE, exception.code.toString());
    } else if (exception.name) {
      addAttribute(attributes, EXCEPTION_TYPE, exception.name);
    }

    if (exception.message) {
      addAttribute(attributes, EXCEPTION_MESSAGE, exception.message);
    }
    if (exception.stack) {
      addAttribute(attributes, EXCEPTION_STACKTRACE, exception.stack);
    }

    addSpanEvent(span, EVENT_NAME_EXCEPTION, attributes);
  }
}

export function errorToSpanStatus(e: Exception): SpanStatus {
  return {
    code: SPAN_STATUS_ERROR,
    message: e && typeof e === "object" && "message" in e ? (e.message as string) : String(e),
  };
}
