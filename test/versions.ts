import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as versions from '../src/versions.ts';

describe('versions', () => {
    describe('VERSIONS', () => {
        it('exports the supported versions', () => {
            assert.deepEqual(Array.from(versions.VERSIONS.keys()), [
                '2025',
                '2022',
                '2019',
                '2017',
                '2016',
                '2014',
                '2012',
                '2008',
            ]);
        });
    });
});
