/** @type {import('jest').Config} */
// Web 冒烟：用 react-native-web 真实实现替代 RN 原生 mock，验证 Web 打包链路能加载并渲染首屏。
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__/web'],
  globals: { __DEV__: true },
  setupFiles: ['<rootDir>/__tests__/web/setup.js'],
  moduleNameMapper: { '^react-native$': 'react-native-web' },
  moduleFileExtensions: ['web.tsx', 'web.ts', 'web.js', 'tsx', 'ts', 'js', 'json'],
  testMatch: ['**/*.test.tsx'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { isolatedModules: true, tsconfig: { module: 'CommonJS', jsx: 'react-jsx', esModuleInterop: true } }]
  }
};