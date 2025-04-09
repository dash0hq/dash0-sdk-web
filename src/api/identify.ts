import { vars } from "@/vars";

type IdentifyOpts = {
  fullName?: string;
  email?: string;
}

export function identify(id: string, opts?: IdentifyOpts) {
  console.log('Identify', id, opts);
  vars.userId = id;
  vars.userEmail = opts?.email;
  vars.userName = opts?.fullName;
}
