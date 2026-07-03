import { describe, expect, it } from "vitest";
import {
  EVENT_NAMES,
  INTERACTION_TYPE,
  INTERACTION_NAME,
  INTERACTION_NAME_SOURCE,
  INTERACTION_TARGET_SELECTOR,
  INTERACTION_TARGET_TAG,
  INTERACTION_TARGET_ID,
} from "../../semantic-conventions";

describe("interaction semantic conventions", () => {
  it("defines the browser.interaction event name", () => {
    expect(EVENT_NAMES.INTERACTION).toBe("browser.interaction");
  });

  it("defines interaction attribute keys", () => {
    expect(INTERACTION_TYPE).toBe("type");
    expect(INTERACTION_NAME).toBe("name");
    expect(INTERACTION_NAME_SOURCE).toBe("name_source");
    expect(INTERACTION_TARGET_SELECTOR).toBe("target.selector");
    expect(INTERACTION_TARGET_TAG).toBe("target.tag");
    expect(INTERACTION_TARGET_ID).toBe("target.id");
  });
});
