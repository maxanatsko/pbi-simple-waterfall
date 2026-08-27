import tseslint from "typescript-eslint";
import powerbiVisuals from "eslint-plugin-powerbi-visuals";

export default tseslint.config(
    {
        ignores: [
            "node_modules/**",
            "dist/**",
            ".tmp/**",
            "coverage/**",
            ".vscode/**",
            "eslint.config.mjs",
        ],
    },
    powerbiVisuals.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ["src/**/*.ts", "test/**/*.ts"],
        rules: {
            // The renderer is one large legacy file; these are downgraded to keep
            // `npm run lint` green while the strict-mode migration is deferred.
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-inferrable-types": "off",
            "@typescript-eslint/no-unused-vars": "warn",
            "@typescript-eslint/no-this-alias": "warn",
            "@typescript-eslint/no-empty-function": "warn",
            "@typescript-eslint/no-empty-object-type": "warn",
            "@typescript-eslint/ban-ts-comment": "warn",
            "no-empty": "warn",
            "no-cond-assign": "warn",
            "no-prototype-builtins": "warn",
            "prefer-const": "off",
            "no-var": "off",
        },
    },
);
