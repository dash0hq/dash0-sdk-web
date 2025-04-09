// TODO use OTel types here?

export const vars: {
  /**
   * This is the global object name which the user of the SDK
   * has no influence over. This should be chosen wisely such that
   * conflicts with other tools are highly unlikely.
   * This global will be registered on the window object by the script tag.
   */
  nameOfLongGlobal: string;

  /**
   * The version of the script tag loading/initializing this SDK.
   * This value is automatically retrieved from the global
   * object's `v` field.
   *
   * This is not defined when the SDK is initialized through the NPM package.
   */
  scriptTagVersion?: string | null | undefined;

  /**
   * The version of SDK. Is filled in at build time.
   */
  sdkVersion: string;

  // The SDK will not attempt automatic user tracking via cookies,
  // fingerprinting or any other means. Instead, we give users the
  // ability manually define user identifying properties. This means
  // that Weasel can adapt to various data security & privacy
  // settings.
  //
  // Set via:
  // eum('user', 'userId', 'user name', 'email')
  userId?: string | null | undefined;
  userName?: string | null | undefined;
  userEmail?: string | null | undefined;
} = {
  nameOfLongGlobal: 'Dash0WebSdk',
  sdkVersion: '{{SDK_VERSION}}',
};
