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
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-floating-promises": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }]
    }
  }
];
