/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
  testMatch: ["<rootDir>/src/**/*.test.{ts,tsx}"],
};
