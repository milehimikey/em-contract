// SPDX-License-Identifier: MIT
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // The compiler-API spike test compiles real TypeSpec; give it headroom.
    testTimeout: 30000,
  },
});
