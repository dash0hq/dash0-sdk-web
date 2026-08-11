import { afterEach, describe, expect, it } from "vitest";
import { addInteractionAttributes } from "./utils";
import type { InProgressSpan } from "../../utils/otel";
import { USER_INTERACTION_ID, USER_INTERACTION_NAME } from "../../semantic-conventions";
import { clearActiveInteractionForTests, registerActiveInteraction } from "../interactions/active-interaction";

function newSpan(): InProgressSpan {
  return { attributes: [] } as unknown as InProgressSpan;
}

describe("HTTP span interaction attribution", () => {
  afterEach(() => {
    clearActiveInteractionForTests();
  });

  it("stamps user_interaction.id and .name when a named interaction is active", () => {
    const interaction = registerActiveInteraction("Fire 10 concurrent requests");

    const span = newSpan();
    addInteractionAttributes(span);

    expect(span.attributes).toEqual(
      expect.arrayContaining([
        { key: USER_INTERACTION_ID, value: { stringValue: interaction.id } },
        { key: USER_INTERACTION_NAME, value: { stringValue: "Fire 10 concurrent requests" } },
      ])
    );
  });

  it("stamps only the id when the interaction has no derived name", () => {
    const interaction = registerActiveInteraction("");

    const span = newSpan();
    addInteractionAttributes(span);

    expect(span.attributes).toEqual([{ key: USER_INTERACTION_ID, value: { stringValue: interaction.id } }]);
  });

  it("adds nothing when no interaction is active", () => {
    const span = newSpan();
    addInteractionAttributes(span);

    expect(span.attributes).toEqual([]);
  });
});
