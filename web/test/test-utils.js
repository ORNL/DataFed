import sinon from "sinon";

export function createMockModule(implementations = {}) {
    const stubs = {};
    Object.entries(implementations).forEach(([key, value]) => {
        if (typeof value === "function") {
            stubs[key] = sinon.stub().callsFake(value);
        } else {
            stubs[key] = value;
        }
    });

    return {
        __esModule: true,
        default: stubs,
        ...stubs,
    };
}

export function mockNamedExports(originalModule, mocks) {
    // Create a new module proxy
    const mockedModule = {};

    // Copy over original properties
    Object.keys(originalModule).forEach((key) => {
        if (!(key in mocks)) {
            mockedModule[key] = originalModule[key];
        }
    });
    // Add mock implementations
    Object.entries(mocks).forEach(([key, value]) => {
        mockedModule[key] = value;
    });

    return mockedModule;
}
