import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, before, describe, it } from 'node:test';
import * as yaml from 'js-yaml';
import {
    type ActionMetadata,
    renderUsage,
    replaceSection,
    updateReadme,
} from '../../misc/generate-docs.ts';

const actionReference = 'tediousjs/setup-sqlserver@v4';

// Turn the rendered usage block back into the `with` map that a workflow would pass to the action.
function loadUsage(lines: string[]): { uses: string; with: Record<string, unknown> } {
    assert.equal(lines[0], '```yaml');
    assert.equal(lines.at(-1), '```');
    const steps = yaml.load(lines.slice(1, -1).join('\n')) as { uses: string; with: Record<string, unknown> }[];
    assert.equal(steps.length, 1);
    return steps[0];
}

function expectedValue(defaultValue: string | undefined): unknown {
    switch (defaultValue) {
        case 'true':
            return true;
        case 'false':
            return false;
        default:
            return defaultValue ?? '';
    }
}

describe('generate-docs', () => {
    describe('renderUsage()', () => {
        it('renders the real action.yml as YAML that loads back with the defaults', async () => {
            const actionPath = path.join(import.meta.dirname, '..', '..', 'action.yml');
            const action = yaml.load(await fs.readFile(actionPath, 'utf8')) as ActionMetadata;
            const step = loadUsage(renderUsage(actionReference, action));
            assert.equal(step.uses, actionReference);
            assert.deepEqual(
                step.with,
                Object.fromEntries(Object.entries(action.inputs).map(([key, input]) => [key, expectedValue(input.default)])),
            );
        });
        it('escapes single quotes in defaults', () => {
            const step = loadUsage(renderUsage(actionReference, {
                inputs: { greeting: { description: 'A greeting.', default: 'it\'s a \'test\'' } },
                outputs: {},
            }));
            assert.deepEqual(step.with, { greeting: 'it\'s a \'test\'' });
        });
        it('throws when the action reference is empty', () => {
            assert.throws(() => renderUsage('', { inputs: {}, outputs: {} }), /actionReference must not be empty/);
        });
    });
    describe('replaceSection()', () => {
        const start = '<!-- start test -->';
        const end = '<!-- end test -->';
        it('replaces only the text between the markers', () => {
            const content = ['intro', start, 'old 1', 'old 2', end, 'outro'].join(os.EOL);
            assert.equal(
                replaceSection(content, start, end, ['new 1', 'new 2']),
                ['intro', start, 'new 1', 'new 2', end, 'outro'].join(os.EOL),
            );
        });
        it('throws when the start marker is missing', () => {
            assert.throws(() => replaceSection(`text${os.EOL}${end}`, start, end, []), /Start token '<!-- start test -->' not found/);
        });
        it('throws when the end marker is missing', () => {
            assert.throws(() => replaceSection(`${start}${os.EOL}text`, start, end, []), /End token '<!-- end test -->' not found/);
        });
        it('throws when the end marker comes before the start marker', () => {
            assert.throws(() => replaceSection(`${end}${os.EOL}${start}`, start, end, []), /Start token must appear before end token/);
        });
    });
    describe('updateReadme()', () => {
        let dir: string;
        before(async () => {
            dir = await fs.mkdtemp(path.join(os.tmpdir(), 'generate-docs-'));
        });
        after(async () => {
            await fs.rm(dir, { recursive: true, force: true });
        });
        it('regenerates the usage section and gives the same file when run again', async () => {
            const actionPath = path.join(dir, 'action.yml');
            const readmePath = path.join(dir, 'README.md');
            await fs.writeFile(actionPath, [
                'inputs:',
                '  version:',
                '    description: \'The version.\'',
                '    default: \'latest\'',
                '  verbose:',
                '    description: \'Log more.\'',
                '    default: \'false\'',
            ].join('\n'));
            await fs.writeFile(readmePath, [
                '# Title',
                '<!-- start usage -->',
                'stale',
                '<!-- end usage -->',
                'Footer',
            ].join(os.EOL));

            await updateReadme(actionReference, actionPath, readmePath);
            const first = await fs.readFile(readmePath, 'utf8');
            assert.equal(first, [
                '# Title',
                '<!-- start usage -->',
                '```yaml',
                `- uses: ${actionReference}`,
                '  with:',
                '    # The version.',
                '    # Default: latest',
                '    version: \'latest\'',
                '',
                '    # Log more.',
                '    # Default: false',
                '    verbose: false',
                '```',
                '<!-- end usage -->',
                'Footer',
            ].join(os.EOL));

            await updateReadme(actionReference, actionPath, readmePath);
            assert.equal(await fs.readFile(readmePath, 'utf8'), first);
        });
    });
});
