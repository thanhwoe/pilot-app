/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
  testMatch: ["<rootDir>/src/**/*.test.{ts,tsx}"],
  // The first test in a file to render pays for loading React Native (about 1.6 s on a laptop,
  // 7 s on a GitHub runner), which overran the 5 s default in CI.
  testTimeout: 20_000,
};
