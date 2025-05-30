export default {
    preset: 'ts-jest',
    modulePathIgnorePatterns: ['<rootDir>/build'],
    testEnvironment: 'jsdom',
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '\\.(css|less|scss|sass)$': '<rootDir>/src/__mocks__/styleMock.js'
    },
    setupFilesAfterEnv: ['<rootDir>/src/configs/setupTests.ts'],
    testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
    transform: {
        '^.+\\.(ts|tsx)$': ['ts-jest', {
            tsconfig: 'tsconfig.json'
        }]
    },
    collectCoverage: true,
    collectCoverageFrom: [
        'src/**/*.{ts,tsx}',
        '!src/**/*.d.ts',
        '!src/main.tsx',
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov']
};