import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // recipe-store は localStorage / window を使うためブラウザ環境が必要
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
});
