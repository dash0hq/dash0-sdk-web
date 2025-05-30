// Resource Attribute Keys
export const SERVICE_NAME = "service.name";
export const SERVICE_VERSION = "service.version";
export const DEPLOYMENT_ENVIRONMENT_NAME = "deployment.environment.name";
export const DEPLOYMENT_NAME = "deployment.name";
export const DEPLOYMENT_ID = "deployment.id";

// Misc Signal Attribute Keys
export const EVENT_NAME = "event.name";
export const PAGE_LOAD_ID = "page.load.id";
export const SESSION_ID = "session.id";
export const USER_AGENT = "user_agent.original";
export const WINDOW_WIDTH = "browser.window.width";
export const WINDOW_HEIGHT = "browser.window.height";
export const NETWORK_CONNECTION_TYPE = "network.connection.subtype";
export const EXCEPTION_COMPONENT_STACK = "exception.component_stack";

// User Attribute Keys
export const USER_ID = "user.id";
export const USER_NAME = "user.name";
export const USER_FULL_NAME = "user.full_name";
export const USER_EMAIL = "user.email";
export const USER_HASH = "user.hash";
export const USER_ROLES = "user.roles";

// Exception Attribute Keys
export const EXCEPTION_MESSAGE = "exception.message";
export const EXCEPTION_TYPE = "exception.type";
export const EXCEPTION_STACKTRACE = "exception.stacktrace";

// URL Attribute Keys
export const URL_DOMAIN = "url.domain";
export const URL_FRAGMENT = "url.fragment";
export const URL_FULL = "url.full";
export const URL_PATH = "url.path";
export const URL_QUERY = "url.query";
export const URL_SCHEME = "url.scheme";

// Http Attribute Keys
export const HTTP_REQUEST_METHOD = "http.request.method";
export const HTTP_REQUEST_METHOD_ORIGINAL = "http.request.method_original";
export const HTTP_REQUEST_HEADER = "http.request.header";
export const HTTP_RESPONSE_STATUS_CODE = "http.response.status_code";
export const HTTP_RESPONSE_HEADER = "http.response.header";
export const HTTP_RESPONSE_BODY_SIZE = "http.response.body.size";

// Event Names
export const PAGE_VIEW = "browser.page_view";
export const NAVIGATION_TIMING = "browser.navigation_timing";
export const WEB_VITAL = "browser.web_vital";
export const EVENT_NAME_EXCEPTION = "exception";

// Log Severities
export const LOG_SEVERITIES = {
  UNSPECIFIED: 0,
  TRACE: 1,
  DEBUG: 5,
  INFO: 9,
  WARN: 13,
  ERROR: 17,
  FATAL: 21,
};
export type LOG_SEVERITY_TEXT = keyof typeof LOG_SEVERITIES;
export type LOG_SEVERITY_NUMBER = (typeof LOG_SEVERITIES)[LOG_SEVERITY_TEXT];

// Span Status
export const SPAN_STATUS_UNSET = 0;
export const SPAN_STATUS_OK = 1; // This is here for completion, status ok is reserved for use by application developers
export const SPAN_STATUS_ERROR = 2;

// Span Kind
// See: https://github.com/open-telemetry/opentelemetry-proto/blob/ac3242b03157295e4ee9e616af53b81517b06559/opentelemetry/proto/trace/v1/trace.proto#L143-L169
export const SPAN_KIND_CLIENT = 3;
