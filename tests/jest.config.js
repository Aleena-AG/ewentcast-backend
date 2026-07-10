module.exports = {
  testEnvironment: "node",
  rootDir: "..",
  testMatch: ["**/tests/**/*.test.js"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.js"],
  clearMocks: true,
  verbose: true,
};
