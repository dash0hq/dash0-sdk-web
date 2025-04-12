declare const _default: {
  files: string[];
  languageOptions: {
    parser: any;
    parserOptions: {
      project: string;
      ecmaVersion: number;
      sourceType: string;
    };
  };
  plugins: {
    "@typescript-eslint": {
      configs: Record<string, tsParser>;
      meta: tsParser;
      rules: typeof import("@typescript-eslint/eslint-plugin/rules");
    };
  };
  rules: any;
  ignores: string[];
}[];
export default _default;
