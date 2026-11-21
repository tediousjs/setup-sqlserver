import { readdir, readFile } from 'node:fs/promises';
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
        it('uses www.microsoft.com only for the cumulative update pages', async () => {
            // the README tells users behind a proxy to bypass it for www.microsoft.com, which must change nothing else
            const pages = new Set([...versions.VERSIONS.values()]
                .map((config) => config.updateUrl)
                .filter((url): url is string => !!url && !url.endsWith('.exe')));
            assert.ok(pages.size > 0);
            for (const page of pages) {
                assert.equal(new URL(page).hostname, 'www.microsoft.com');
            }
            const srcDir = new URL('../src/', import.meta.url);
            const files = (await readdir(srcDir, { recursive: true })).filter((path) => path.endsWith('.ts'));
            for (const path of files) {
                const source = await readFile(new URL(path, srcDir), 'utf8');
                for (const [url] of source.matchAll(/https?:\/\/www\.microsoft\.com[^\s'"`)]*/gi)) {
                    assert.ok(pages.has(url), `src/${path} uses ${url}`);
                }
            }
        });
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
