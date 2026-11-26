import path from "path"
import { defineConfig } from "vitest/config"

export default defineConfig({
	test: {
		environment: "node",
		globals: true,
		passWithNoTests: true,
		exclude: ["**/node_modules/**", "**/dist/**"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "json-summary", "html"],
			thresholds: {
				lines: 90,
				functions: 90,
				branches: 85,
				statements: 90,
			},
			exclude: [
				"**/*.config.*",
				"**/*.setup.*",
				"**/*.spec.*",
				"**/*.test.*",
				"**/*.d.ts",
				"**/node_modules/**",
				"**/dist/**",
				"**/modules/v1/examples/**",
			],
		},
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
		},
	},
})
