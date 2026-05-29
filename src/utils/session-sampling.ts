import { crc32 } from "./crc32";

/**
 * Determines whether a session should be sampled based on the session ID
 * and a configured sampling rate.
 *
 * @param sessionId The hex session ID string
 * @param samplingRate A number between 0 and 100 (inclusive)
 * @returns true if the session should be sampled (data collected), false otherwise
 */
export function isSessionSampledIn(sessionId: string, samplingRate: number): boolean {
  if (samplingRate <= 0) return false;
  if (samplingRate >= 100) return true;
  return crc32(sessionId) % 100 < samplingRate;
}
