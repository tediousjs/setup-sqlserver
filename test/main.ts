import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const setFailed = mock.fn();
const install = mock.fn(async () => {});

mock.module('@actions/core', { namedExports: { setFailed } });
mock.module('../src/install.ts', { defaultExport: install });

// main.ts runs install() when it is imported, and it does not wait for the result. Each case imports the module with a
// different query string to get a new instance of it, then waits for the result of install() to be handled.
function nextTick() {
    return new Promise((resolve) => setImmediate(resolve));
}

describe('main', () => {
    beforeEach(() => {
        setFailed.mock.resetCalls();
        install.mock.resetCalls();
    });
    it('runs the install', async () => {
        install.mock.mockImplementation(async () => {});
        await import('../src/main.ts?resolves');
        await nextTick();
        assert.equal(install.mock.callCount(), 1);
        assert.equal(setFailed.mock.callCount(), 0);
    });
    it('fails the action if the install rejects', async () => {
        const error = new Error('synthetic error');
        install.mock.mockImplementation(async () => {
            throw error;
        });
        await import('../src/main.ts?rejects');
        await nextTick();
        assert.equal(install.mock.callCount(), 1);
        assert.equal(setFailed.mock.callCount(), 1);
        assert.equal(setFailed.mock.calls[0].arguments[0], error);
    });
});
