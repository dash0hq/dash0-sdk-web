export type RageClickSettings = {
  /**
   * How many clicks in the same place within `windowMillis` of each other constitute a rage click.
   *
   * @default 3
   */
  minClicks?: number;

  /**
   * The maximum time allowed between two consecutive clicks for them to belong to the same burst.
   * A burst is reported once this long has passed without another click, so the reported count
   * covers the whole burst.
   *
   * @default 1000
   */
  windowMillis?: number;

  /**
   * How far apart, in CSS pixels, two clicks may be and still count as the same spot. Only applies
   * to clicks that did not land on the same element; clicks on one element always belong together.
   *
   * @default 30
   */
  radiusPixels?: number;
};

export type FrustrationSignalSettings = {
  rageClick?: RageClickSettings;
};
