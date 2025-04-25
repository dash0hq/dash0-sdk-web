import { HTTP_REQUEST_HEADER, HTTP_RESPONSE_HEADER } from "../../semantic-conventions";

export function httpRequestHeaderKey(key: string) {
  return `${HTTP_REQUEST_HEADER}.${key.toLowerCase()}`;
}

export function httpResponseHeaderKey(key: string) {
  return `${HTTP_RESPONSE_HEADER}.${key.toLowerCase()}`;
}
