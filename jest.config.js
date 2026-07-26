/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  globalSetup: "<rootDir>/tests/globalSetup.js",
  collectCoverageFrom: [
    "src/services/**/*.ts",
    "src/db/repositories/**/*.ts",
    "src/api/**/*.ts",
    "!src/api/types/**",
  ],
  coverageDirectory: "coverage",
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  moduleFileExtensions: ["ts", "js", "json"],
  clearMocks: true,
  maxWorkers: 1,
};
