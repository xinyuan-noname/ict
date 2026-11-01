/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/__tests__'],
  moduleNameMapper: { '^react-native$': '<rootDir>/__tests__/mocks/react-native.ts' },
  testMatch: ['**/*.test.ts', '**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { isolatedModules: true, tsconfig: { module: 'CommonJS', jsx: 'react-jsx' } }]
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  coverageThreshold: {
    global: { branches: 50, functions: 60, lines: 65, statements: 65 }
  }
};