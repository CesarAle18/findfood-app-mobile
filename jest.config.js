/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  // Mirrors tsconfig `paths`; the more specific alias must come first.
  moduleNameMapper: {
    "^@/assets/(.*)$": "<rootDir>/assets/$1",
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testPathIgnorePatterns: ["/node_modules/", "/dist/", "/scripts/"],
};
