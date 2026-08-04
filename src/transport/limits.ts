/**
 * Ceilings for the transport-wide rate limiter, shared by every signal the SDK
 * emits (see ./index.ts).
 *
 * They live in their own module rather than in the transport barrel so that
 * producers keeping their own sub-budget -- currently
 * instrumentations/interactions/emit.ts -- can clamp against the real limit
 * instead of duplicating the number, without having to reach through a module
 * that unit tests routinely replace with a `sendLog` stub.
 */
export const MAX_TRANSPORT_CALLS_PER_TEN_SECONDS = 128;
export const MAX_TRANSPORT_CALLS_PER_TEN_MINUTES = 4096;
