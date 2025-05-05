import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        ecmaVersion: 2020,
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          varsIgnorePattern: "^_",
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-restricted-globals": [
        "error",
        {
          name: "window",
          message: "Do not directly use window. Import the ssr save win from utils/globals instead",
        },
        {
          name: "document",
          message: "Do not directly use document. Import the ssr save doc from utils/globals instead",
        },
        {
          name: "navigator",
          message: "Do not directly use navigator. Import the ssr save nav from utils/globals instead",
        },
        {
          name: "encodeURIComponent",
          message: "Do not directly use encodeURIComponent. Import the ssr save version from utils/globals instead",
        },
        {
          name: "fetch",
          message: "Do not directly use fetch. Import the ssr save version from utils/globals instead",
        },
        {
          name: "localStorage",
          message: "Do not directly use localStorage. Import the ssr save version from utils/globals instead",
        },
        {
          name: "sendBeacon",
          message: "Do not directly use sendBeacon. Import the ssr save version from utils/globals instead",
        },
      ],
    },
    ignores: ["dist", "node_modules"],
  },
];
