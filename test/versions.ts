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
        for (const version of ['2025', '2022', '2019', '2017', '2016']) {
            it(`configures cumulative updates for ${version}`, () => {
                assert.match(versions.VERSIONS.get(version)?.updateUrl ?? '', /^https:\/\/(www|download)\.microsoft\.com\//);
            });
        }
        for (const version of ['2014', '2012', '2008']) {
            it(`passes /ENABLERANU=1 to setup for ${version}`, () => {
                assert.deepEqual(versions.VERSIONS.get(version)?.installArgs, ['/ENABLERANU=1']);
            });
        }
        for (const version of ['2025', '2022', '2019', '2017', '2016']) {
            it(`passes no extra arguments to setup for ${version}`, () => {
                assert.ok(versions.VERSIONS.has(version));
                assert.equal(versions.VERSIONS.get(version)?.installArgs, undefined);
            });
        }
    });
});
