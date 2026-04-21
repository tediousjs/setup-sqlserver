import { EventEmitter } from 'node:events';
import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const createReadStream = mock.fn();
mock.module('node:fs', { namedExports: { createReadStream } });

const { generateFileHash } = await import('../src/crypto.ts');

interface FakeStream extends EventEmitter {
    read: () => unknown;
}

function makeStream(chunks: unknown[]): FakeStream {
    const stream = new EventEmitter() as FakeStream;
    let i = 0;
    stream.read = () => {
        const next = chunks[i++];
        return next === undefined ? null : next;
    };
    return stream;
}

describe('crypto', () => {
    beforeEach(() => {
        createReadStream.mock.resetCalls();
    });
    describe('.generateFileHash()', () => {
        it('hashes a file input', async () => {
            const stream = makeStream(['hello world']);
            createReadStream.mock.mockImplementationOnce(() => stream);
            const hashPromise = generateFileHash('test');
            stream.emit('readable');
            stream.emit('readable');
            const res = await hashPromise;
            assert.deepEqual(res, Buffer.from('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9', 'hex'));
        });
        it('passes on errors', async () => {
            const stream = new EventEmitter() as FakeStream;
            stream.read = () => null;
            createReadStream.mock.mockImplementationOnce(() => stream);
            const err = new Error('synthetic error');
            queueMicrotask(() => stream.emit('error', err));
            await assert.rejects(() => generateFileHash('test'), err);
        });
    });
});
