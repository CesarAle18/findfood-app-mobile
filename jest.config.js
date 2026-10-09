/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  // Mirrors tsconfig `paths`; the more specific alias must come first.
  moduleNameMapper: {
    "^@/assets/(.*)$": "<rootDir>/assets/$1",
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  // Appended to the jest-expo preset's own setup files.
  setupFiles: ["<rootDir>/jest.setup.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/dist/", "/scripts/"],
};
