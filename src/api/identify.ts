import { vars } from "../vars";
import { addAttribute, removeAttribute } from "../utils/otel";
import { USER_EMAIL, USER_FULL_NAME, USER_HASH, USER_ID, USER_NAME, USER_ROLES } from "../semantic-conventions";

type IdentifyOpts = {
  name?: string;
  fullName?: string;
  email?: string;
  hash?: string;
  roles?: string[];
};

export function identify(id?: string, opts?: IdentifyOpts) {
  removeAttribute(vars.signalAttributes, USER_ID);
  if (id != null) {
    addAttribute(vars.signalAttributes, USER_ID, id);
  }

  removeAttribute(vars.signalAttributes, USER_NAME);
  if (opts?.name != null) {
    addAttribute(vars.signalAttributes, USER_NAME, opts.name);
  }

  removeAttribute(vars.signalAttributes, USER_FULL_NAME);
  if (opts?.fullName != null) {
    addAttribute(vars.signalAttributes, USER_FULL_NAME, opts.fullName);
  }

  removeAttribute(vars.signalAttributes, USER_EMAIL);
  if (opts?.email != null) {
    addAttribute(vars.signalAttributes, USER_EMAIL, opts.email);
  }

  removeAttribute(vars.signalAttributes, USER_HASH);
  if (opts?.hash != null) {
    addAttribute(vars.signalAttributes, USER_HASH, opts.hash);
  }

  removeAttribute(vars.signalAttributes, USER_ROLES);
  if (opts?.roles != null) {
    addAttribute(vars.signalAttributes, USER_ROLES, opts.roles);
  }
}
