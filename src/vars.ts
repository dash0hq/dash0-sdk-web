// TODO use OTel types here?

import { InstrumentationScope, KeyValue, Resource } from "../types/otlp";

export type Endpoint = {
  /**
   * OTLP HTTP URL excluding the /v1/* prefix
   */
  url: string;

  /**
   * Will be placed into `Authorization: Bearer {auth_token}` header. Has the form
   * `auth_abc123`.
   */
  authToken: string;

  /**
   * Optionally specify what dataset should be placed into. Can also be configured within Dash0
   * through the auth token.
   */
  dataset?: string;
};

type Vars = {
  /**
   * Telemetry endpoints to which the generated telemetry should be sent
   */
  endpoints: Endpoint[];

  /**
   * OpenTelemetry resource used for all the telemetry we emit.
   */
  resource: Resource;

  /**
   * OpenTelemetry scope used for all the telemetry we emit.
   */
  scope: InstrumentationScope;

  /**
   * Attributes that are supposed to be added to all outgoing signals
   * at the time they are **added** to the transport layer.
   */
  signalAttributes: KeyValue[];
};

export const vars: Vars = {
  endpoints: [],
  resource: {
    attributes: [],
  },
  scope: {
    name: "dash0-web-sdk",
    version: "{{SDK_VERSION}}",
    attributes: [],
  },
  signalAttributes: [],
};
