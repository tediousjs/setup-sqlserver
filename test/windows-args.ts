import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { quoteWindowsArgument } = await import('../src/windows-args.ts');

/**
 * Split a command line the way the Windows C runtime does: whitespace separates arguments outside double quotes,
 * 2n backslashes before a double quote give n backslashes and toggle quoting, 2n+1 backslashes before a double
 * quote give n backslashes and a literal double quote, and other backslashes are literal.
 */
function splitWindowsCommandLine(commandLine: string): string[] {
    const args: string[] = [];
    let current = '';
    let inArgument = false;
    let quoted = false;
    for (let i = 0; i < commandLine.length; i++) {
        const char = commandLine[i];
        if (char === '\\') {
            let backslashes = 0;
            while (commandLine[i] === '\\') {
                backslashes++;
                i++;
            }
            if (commandLine[i] === '"') {
                current += '\\'.repeat(Math.floor(backslashes / 2));
                if (backslashes % 2 === 1) {
                    current += '"';
                } else {
                    quoted = !quoted;
                }
            } else {
                current += '\\'.repeat(backslashes);
                i--;
            }
            inArgument = true;
        } else if (char === '"') {
            if (quoted && commandLine[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                quoted = !quoted;
            }
            inArgument = true;
        } else if ((char === ' ' || char === '\t') && !quoted) {
            if (inArgument) {
                args.push(current);
                current = '';
                inArgument = false;
            }
        } else {
            current += char;
            inArgument = true;
        }
    }
    if (inArgument) {
        args.push(current);
    }
    return args;
}

describe('windows-args', () => {
    describe('.quoteWindowsArgument()', () => {
        const examples: [string, string][] = [
            ['yourStrong(!)Password', '"yourStrong(!)Password"'],
            ['pass word', '"pass word"'],
            ['', '""'],
            ['Ab1"cdef', '"Ab1\\"cdef"'],
            ['Passw0rd\\', '"Passw0rd\\\\"'],
            ['Pass\\\\', '"Pass\\\\\\\\"'],
            ['a\\b', '"a\\b"'],
            ['a\\"b', '"a\\\\\\"b"'],
            ['C:\\tool-cache\\sqlupdate\\2022.0.0\\x64', '"C:\\tool-cache\\sqlupdate\\2022.0.0\\x64"'],
        ];
        for (const [value, expected] of examples) {
            it(`quotes ${JSON.stringify(value)}`, () => {
                assert.equal(quoteWindowsArgument(value), expected);
            });
        }
        it('gives every value back unchanged, without changing the arguments after it', () => {
            // every string of up to 4 of these characters, including the ones that break naive quoting
            const chars = ['a', '"', '\\', ' ', '\t', '%', '^', '!'];
            let values = [''];
            let all = [''];
            for (let length = 1; length <= 4; length++) {
                values = values.flatMap((value) => chars.map((char) => value + char));
                all = all.concat(values);
            }
            for (const value of all) {
                const commandLine = `"C:\\setup.exe" /q /SAPWD=${quoteWindowsArgument(value)} /IACCEPTSQLSERVERLICENSETERMS`;
                assert.deepEqual(splitWindowsCommandLine(commandLine), [
                    'C:\\setup.exe',
                    '/q',
                    `/SAPWD=${value}`,
                    '/IACCEPTSQLSERVERLICENSETERMS',
                ], `value ${JSON.stringify(value)}`);
            }
        });
        it('shows why the values need quoting', () => {
            // the unescaped form that the action used to build loses the later switches
            assert.deepEqual(splitWindowsCommandLine('/SAPWD="Ab1"cdef" /IACCEPTSQLSERVERLICENSETERMS'), [
                '/SAPWD=Ab1cdef /IACCEPTSQLSERVERLICENSETERMS',
            ]);
        });
    });
});
