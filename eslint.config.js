import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: ["dist", "node_modules", "coverage", "*.js"],
  },

  {
    files: ["**/*.ts", "**/*.tsx"],

    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",

      parserOptions: {
        project: "./tsconfig.json"
      },

      globals: {
        process: "readonly",
        __dirname: "readonly",
        module: "readonly",
        require: "readonly",
        Promise: "readonly"
      }
    },

    plugins: {
      "@typescript-eslint": tseslint
    },

    rules: {
      "@next/next/no-img-element": "off",
      "jsx-a11y/alt-text": "off",
      "react-hooks/exhaustive-deps": "off",
      "react/display-name": "off",
      "tailwindcss/enforces-negative-arbitrary-values": "off",
      "tailwindcss/no-contradicting-classname": "off",
      "tailwindcss/no-custom-classname": "off",
      "tailwindcss/no-unnecessary-arbitrary-value": "off",
      "no-console": "error",

      /** CamelCase only for variables, NOT for object properties */
      "camelcase": [
        "warn",
        {
          "properties": "never",
          "ignoreImports": true
        }
      ],

      "@typescript-eslint/no-explicit-any": "error",
      "prefer-const": "error",
      "no-var": "error",
      "no-duplicate-imports": "error",
      "eqeqeq": ["warn", "always"],
      "curly": ["warn", "all"],
      "prefer-template": "warn",
      "object-shorthand": "warn",
      "prefer-arrow-callback": "warn",
      
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/prefer-nullish-coalescing": "warn",
      "@typescript-eslint/prefer-optional-chain": "warn",
      "@typescript-eslint/no-unnecessary-type-assertion": "warn",
      "@typescript-eslint/prefer-as-const": "warn",

      // TypeScript specific rules
      "@typescript-eslint/no-unused-vars": [
        "error",
        { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }
      ]
    }
  },

  // Test file overrides
  {
    files: [
      "**/__tests__/**/*.{ts,tsx,js,jsx}",
      "**/*.test.{ts,tsx,js,jsx}"
    ],
    rules: {
      "no-console": "off",
      "camelcase": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "prefer-const": "off",
      "no-var": "off",
      "no-duplicate-imports": "off",
      "eqeqeq": "off",
      "curly": "off",
      "prefer-template": "off",
      "object-shorthand": "off",
      "prefer-arrow-callback": "off",
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "@typescript-eslint/prefer-optional-chain": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/prefer-as-const": "off"
    }
  }
];
