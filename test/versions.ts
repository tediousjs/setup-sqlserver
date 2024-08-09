import * as assert from 'node:assert';
import * as versions from '../src/versions';

describe('versions', () => {
    describe('VERSIONS', () => {
        it('exports the supported versions', () => {
            assert.deepEqual(Array.from(versions.VERSIONS.keys()), [
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
