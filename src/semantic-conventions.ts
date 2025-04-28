// Resource Attribute Keys
export const SERVICE_NAME = "service.name";
export const SERVICE_VERSION = "service.version";
export const DEPLOYMENT_ENVIRONMENT_NAME = "deployment.environment.name";

// Signal Attribute Keys
export const EVENT_NAME = "event.name";
export const USER_ID = "user.id";
export const USER_NAME = "user.name";
export const USER_FULL_NAME = "user.full_name";
export const USER_EMAIL = "user.email";
export const PAGE_LOAD_ID = "page.load.id";
export const SESSION_ID = "session.id";
export const USER_AGENT = "user_agent.original";
export const URL_FULL = "url.full";
export const WINDOW_WIDTH = "browser.window.width";
export const WINDOW_HEIGHT = "browser.window.height";
export const NETWORK_CONNECTION_TYPE = "network.connection.subtype";
export const EXCEPTION_MESSAGE = "exception.message";
export const EXCEPTION_TYPE = "exception.type";
export const EXCEPTION_STACKTRACE = "exception.stacktrace";
export const EXCEPTION_COMPONENT_STACK = "exception.component_stack";
export const COMPONENT = "component";

// Http Attribute Keys
export const HTTP_REQUEST_METHOD = "http.request.method";
export const HTTP_REQUEST_METHOD_ORIGINAL = "http.request.method_original";
export const HTTP_REQUEST_HEADER = "http.request.header";
export const HTTP_RESPONSE_STATUS_CODE = "http.response.status_code";
export const HTTP_RESPONSE_HEADER = "http.response.header";

// Event Names
export const PAGE_VIEW = "browser.page_view";
export const NAVIGATION_TIMING = "browser.navigation_timing";
export const WEB_VITAL = "browser.web_vital";
export const EVENT_NAME_EXCEPTION = "exception";

// Log Severities
export const LOG_SEVERITY_INFO = 9;
export const LOG_SERVERITY_INFO_TEXT = "INFO";
export const LOG_SEVERITY_ERROR = 17;
export const LOG_SEVERITY_ERROR_TEXT = "ERROR";

// Span Status
export const SPAN_STATUS_UNSET = 0;
export const SPAN_STATUS_OK = 1; // This is here for completion, status ok is reserved for use by application developers
export const SPAN_STATUS_ERROR = 2;
