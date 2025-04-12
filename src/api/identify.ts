import { vars } from "../vars";
import { addAttribute, removeAttribute } from "../utils";
import { USER_EMAIL, USER_FULL_NAME, USER_ID } from "../semantic-conventions";

type IdentifyOpts = {
  fullName?: string;
  email?: string;
};

export function identify(id?: string, opts?: IdentifyOpts) {
  removeAttribute(vars.signalAttributes, USER_ID);
  if (id != null) {
    addAttribute(vars.signalAttributes, USER_ID, id);
  }

  removeAttribute(vars.signalAttributes, USER_FULL_NAME);
  if (opts?.fullName != null) {
    addAttribute(vars.signalAttributes, USER_FULL_NAME, opts.fullName);
  }

  removeAttribute(vars.signalAttributes, USER_EMAIL);
  if (opts?.email != null) {
    addAttribute(vars.signalAttributes, USER_EMAIL, opts.email);
  }
}
