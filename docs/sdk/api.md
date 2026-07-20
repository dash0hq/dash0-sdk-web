# API

The Dash0 Web SDK provides several API functions to help you customize telemetry collection and add contextual
information to your signals.

### Signal attributes

Functions for managing custom attributes that are included with all signals.

#### `addSignalAttribute(name, value)`

Adds a signal attribute to be transmitted with every signal.

**Parameters:**

- `name` (string): The attribute name
- `value` (AttributeValueType | AnyValue): The attribute value

**Example:**

```js
// Module
import { addSignalAttribute } from "@dash0/sdk-web";

addSignalAttribute("environment", "production");
addSignalAttribute("version", "1.2.3");

// Script
dash0("addSignalAttribute", "environment", "production");
```

**Note:** If you need to ensure attributes are included with signals transmitted on initial page load, use the
`additionalSignalAttributes` property in the `init()` call instead.

#### `removeSignalAttribute(name)`

Removes a previously added signal attribute.

**Parameters:**

- `name` (string): The attribute name to remove

**Example:**

```js
// Module
import { removeSignalAttribute } from "@dash0/sdk-web";

removeSignalAttribute("environment");

// Script
dash0("removeSignalAttribute", "environment");
```

### User identification

#### `identify(id, opts)`

Associates user information with telemetry signals.
See [OTEL User Attributes](https://opentelemetry.io/docs/specs/semconv/registry/attributes/user/) for the matching
attributes

**Parameters:**

- `id` (string, optional): User identifier
- `opts` (object, optional): Additional user information
  - `name` (string, optional): Short name or login/username of the user
  - `fullName` (string, optional): User's full name
  - `email` (string, optional): User email address
  - `hash` (string, optional): Unique user hash to correlate information for a user in anonymized form.
  - `roles` (string[], optional): User roles

**Example:**

```js
// Module
import { identify } from "@dash0/sdk-web";

identify("user123", {
  name: "johndoe",
  fullName: "John Doe",
  email: "john@example.com",
  roles: ["admin", "user"],
});

// Script
dash0("identify", "user123", { name: "johndoe" });
```

### Custom Events

#### `sendEvent(name, opts)`

Sends a custom event with optional data and attributes.
Event name cannot be one of the event names internally used by the Dash0 Web SDK.
See [Event Names](https://github.com/dash0hq/dash0-sdk-web/blob/main/src/semantic-conventions.ts#L50)

**Parameters:**

- `name` (string): Event name
- `opts` (object, optional): Event options
  - `title` (string, optional): Human readable title for the event. Should summarize the event in a single short
    sentence.
  - `timestamp` (number | Date, optional): Event timestamp
  - `data` (AttributeValueType | AnyValue, optional): Event data
  - `attributes` (Record<string, AttributeValueType | AnyValue>, optional): Event attributes
  - `severity` (LOG_SEVERITY_TEXT, optional): Log severity level

**Example:**

```js
// Module
import { sendEvent } from "@dash0/sdk-web";

sendEvent("user_action", {
  data: "button_clicked",
  attributes: {
    buttonId: "submit-form",
    page: "/checkout",
  },
  severity: "INFO",
});

// Script
dash0("sendEvent", "user_action", { data: "button_clicked", severity: "INFO" });
```

### Error Reporting

#### `reportError(error, opts)`

Manually reports an error to be tracked in telemetry.

**Parameters:**

- `error` (string | ErrorLike): Error message or error object
- `opts` (object, optional): Error reporting options
  - `componentStack` (string | null | undefined, optional): Component stack trace for React errors
  - `attributes` (Record<string, AttributeValueType | AnyValue>, optional): Additional attributes to include with the
    error report

**Example:**

```js
// Module
import { reportError } from "@dash0/sdk-web";

// Report a string error
reportError("Something went wrong in user flow");

// Report an Error object
try {
  // Some operation
} catch (error) {
  reportError(error);
}

reportError(error, {
  // Report with component stack (useful for React)
  componentStack: getComponentStack(),
  // Additional attributes
  attributes: {
    "user.id": "user123",
  },
});

// Script
dash0("reportError", "Something went wrong in user flow");
```

### Session Management

#### `terminateSession()`

Manually terminates the current user session.

**Example:**

```js
// Module
import { terminateSession } from "@dash0/sdk-web";

// Terminate session on user logout
function handleLogout() {
  terminateSession();
  // Additional logout logic
}

// Script
dash0("terminateSession");
```

**Note:** Sessions are automatically managed by the Dash0 Web SDK based on inactivity and termination timeouts
configured during initialization. Manual termination is typically only needed for explicit user logout scenarios.

### Internal Telemetry

#### `setActiveLogLevel(logLevel)`

Changes the active log level of this SDK. Defaults to `warn`.

**Example:**

```js
// Module
import { setActiveLogLevel } from "@dash0/sdk-web";

setActiveLogLevel("debug");

// Script
dash0("setActiveLogLevel", "debug");
```
