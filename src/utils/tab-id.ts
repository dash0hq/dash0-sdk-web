import { getItem, isSupported, setItem } from "./local-storage";
import { debug, warn } from "./debug";
import { generateUniqueId, TAB_ID_BYTES } from "./id";

const TAB_ID_STORAGE_KEY = "d0_tab";

export let tabId: string | null = null;

/**
 * We want to be able to identify what browser tab the user is looking at. We do this by identifying tabs through
 * random-generated IDs that are kept in session storage. To quote MDN:
 *
 * > sessionStorage is partitioned by both origin and browser tabs (top-level browsing contexts)
 */
export function initializeTabId() {
  if (!isSupported) {
    debug("Storage API is not available and tab tracking is therefore not supported.");
    return;
  }

  try {
    const storedValue = getItem(TAB_ID_STORAGE_KEY);
    if (storedValue) {
      tabId = storedValue;
      return;
    }

    tabId = generateUniqueId(TAB_ID_BYTES);
    setItem(TAB_ID_STORAGE_KEY, tabId);
  } catch (e) {
    warn("Failed to record tab ID information", e);
  }
}
