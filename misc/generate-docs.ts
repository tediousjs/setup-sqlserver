import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { version } from '../package.json';

/**
 * From @actions/checkout
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2018 GitHub, Inc. and contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */


//
// SUMMARY
//
// This script rebuilds the usage section in the README.md to be consistent with the action.yml

async function updateUsage(
    actionReference: string,
    actionYamlPath = 'action.yml',
    readmePath = 'README.md',
    startToken = '<!-- start usage -->',
    endToken = '<!-- end usage -->'
): Promise<void> {
    if (!actionReference) {
        throw new Error('Parameter actionReference must not be empty');
    }

    // load files
    const [action, readme] = await Promise.all([
        fs.readFile(actionYamlPath).then((f) => f.toString()),
        fs.readFile(readmePath).then((f) => f.toString()),
    ]);

    // parse the action.yml
    const actionYaml = yaml.load(action) as {
        inputs: Record<string, {
            description: string;
            default?: string;
        }>;
        outputs: Record<string, {
            description: string;
        }>;
    };

    // Find the start token
    const startTokenIndex = readme.indexOf(startToken);
    if (startTokenIndex < 0) {
        throw new Error(`Start token '${startToken}' not found`);
    }

    // Find the end token
    const endTokenIndex = readme.indexOf(endToken);
    if (endTokenIndex < 0) {
        throw new Error(`End token '${endToken}' not found`);
    } else if (endTokenIndex < startTokenIndex) {
        throw new Error('Start token must appear before end token');
    }

    // Build the new README
    const newReadme: string[] = [];

    // Append the beginning
    newReadme.push(readme.substring(0, startTokenIndex + startToken.length));

    // Build the new usage section
    newReadme.push('```yaml', `- uses: ${actionReference}`, '  with:');
    const inputs = actionYaml.inputs;
    let firstInput = true;
    for (const key of Object.keys(inputs)) {
        const input = inputs[key];

        // Line break between inputs
        if (!firstInput) {
            newReadme.push('');
        }

        // Constrain the width of the description
        const width = 80;
        let description = (input.description as string)
            .trimEnd()
            .replace(/\r\n/g, '\n') // Convert CR to LF
            .replace(/ +/g, ' ') //    Squash consecutive spaces
            .replace(/ \n/g, '\n'); //  Squash space followed by newline
        while (description) {
            // Longer than width? Find a space to break apart
            let segment: string = description;
            if (description.length > width) {
                segment = description.substr(0, width + 1);
                while (!segment.endsWith(' ') && !segment.endsWith('\n') && segment) {
                    segment = segment.substr(0, segment.length - 1);
                }

                // Trimmed too much?
                if (segment.length < width * 0.67) {
                    segment = description;
                }
            } else {
                segment = description;
            }

            // Check for newline
            const newlineIndex = segment.indexOf('\n');
            if (newlineIndex >= 0) {
                segment = segment.substr(0, newlineIndex + 1);
            }

            // Append segment
            newReadme.push(`    # ${segment}`.trimEnd());

            // Remaining
            description = description.substr(segment.length);
        }

        if (input.default !== undefined) {
            // Append blank line if description had paragraphs
            if ((input.description as string).trimEnd().match(/\n[ ]*\r?\n/)) {
                newReadme.push(`    #`);
            }

            // Default
            newReadme.push(`    # Default: ${input.default}`);
        }

        // Input name
        let inputValue: string;
        switch (input.default) {
            case 'true':
            case 'false':
                inputValue = input.default;
                break;
            default:
                inputValue = `'${input.default ?? ''}'`;
        }
        newReadme.push(`    ${key}: ${inputValue}`);

        firstInput = false;
    }

    newReadme.push('```');

    // Append the end
    newReadme.push(readme.substr(endTokenIndex));

    // Write the new README
    await fs.writeFile(readmePath, newReadme.join(os.EOL));
}

updateUsage(
    `tediousjs/setup-sqlserver@v${version.split('.')[0]}`,
    path.join(__dirname, '..', 'action.yml'),
    path.join(__dirname, '..', 'README.md')
);
