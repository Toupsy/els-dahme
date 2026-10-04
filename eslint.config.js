import js from "@eslint/js";
import ts from "typescript-eslint";
import globals from "globals";

export default ts.config(
  {
    ignores: [
      "**/dist/**",
      "**/dist-preview/**",
      "**/.wrangler/**",
      "**/coverage/**",
      "playwright-report/**",
      "test-results/**",
      "data/**",
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ["scripts/**/*.mjs", "packages/domain/reference/*.mjs"],
    languageOptions: { globals: globals.node },
  },
  {
    // Vergleichsrechner gegen den Originalcode der Feature-App (CommonJS, Node).
    files: ["packages/domain/reference/*.cjs"],
    languageOptions: { globals: globals.node, sourceType: "commonjs" },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    files: ["packages/domain/src/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      // Fachregeln bekommen `now` übergeben – keine eigene Uhr im Domain-Paket.
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='Date'][property.name='now']",
          message: "Domain-Funktionen erhalten `now` als Parameter.",
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: "Domain-Funktionen erhalten `now` als Parameter.",
        },
      ],
    },
  },
);
