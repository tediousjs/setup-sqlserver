import fs, { ReadStream } from 'node:fs';
import { restore, SinonStubbedInstance, SinonStubbedMember, stub } from 'sinon';
import { expect } from 'chai';
import { generateFileHash } from '../src/crypto';

describe('crypto', () => {
    afterEach('restore stubs', () => {
        restore();
    });
    describe('.generateFileHash()', () => {
        let createReadStreamStub: SinonStubbedMember<typeof fs.createReadStream>;
        beforeEach('stub deps', () => {
            createReadStreamStub = stub(fs, 'createReadStream');
        });
        it('hashes a file input', async () => {
            const cbs = {} as { readable: (() => void)[]};
            const stream = {
                on: stub(),
                read: stub(),
            } as unknown as SinonStubbedInstance<ReadStream>;
            // stream.on.withArgs('error').yieldsAsync(new Error());
            stream.on.callsFake((event, cb) => {
                if (!cbs[event]) {
                    cbs[event] = [];
                }
                cbs[event].push(cb);
                return stream;
            });
            stream.read.onFirstCall().returns('hello world');
            stream.read.onSecondCall().returns(null);
            createReadStreamStub.returns(stream);
            const hashPromise = generateFileHash('test');
            cbs.readable.forEach((cb) => cb());
            cbs.readable.forEach((cb) => cb());
            const res = await hashPromise;
            expect(res).to.deep.equal(Buffer.from('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9', 'hex'));
        });
        it('passes on errors', async () => {
            const stream = {
                on: stub(),
                read: stub(),
            } as unknown as SinonStubbedInstance<ReadStream>;
            createReadStreamStub.returns(stream);
            const err = new Error('synthetic error');
            stream.on.withArgs('error').yieldsAsync(err);
            try {
                await generateFileHash('test');
            } catch (e) {
                expect(e).to.equal(err);
                return;
            }
            expect.fail('expected to throw');
        });
    });
});
