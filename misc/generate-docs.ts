import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import pkg from '../package.json' with { type: 'json' };

const { version } = pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
// This script rebuilds the usage and outputs sections in the README.md to be consistent with the action.yml

export interface ActionInput {
    description: string;
    default?: string;
}

export interface ActionOutput {
    description: string;
}

export interface ActionMetadata {
    inputs: Record<string, ActionInput>;
    outputs?: Record<string, ActionOutput>;
}

const USAGE_START = '<!-- start usage -->';
const USAGE_END = '<!-- end usage -->';
const OUTPUTS_START = '<!-- start outputs -->';
const OUTPUTS_END = '<!-- end outputs -->';

/**
 * Render the usage section: a YAML code block that lists every input with its description and default.
 */
export function renderUsage(actionReference: string, actionYaml: ActionMetadata): string[] {
    if (!actionReference) {
        throw new Error('Parameter actionReference must not be empty');
    }

    const lines: string[] = ['```yaml', `- uses: ${actionReference}`, '  with:'];
    const inputs = actionYaml.inputs;
    let firstInput = true;
    for (const key of Object.keys(inputs)) {
        const input = inputs[key];

        // Line break between inputs
        if (!firstInput) {
            lines.push('');
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
            let segment: string;
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
            lines.push(`    # ${segment}`.trimEnd());

            // Remaining
            description = description.substr(segment.length);
        }

        if (input.default !== undefined) {
            // Append blank line if description had paragraphs
            if ((input.description as string).trimEnd().match(/\n[ ]*\r?\n/)) {
                lines.push(`    #`);
            }

            // Default
            lines.push(`    # Default: ${input.default}`);
        }

        // Input name
        let inputValue: string;
        switch (input.default) {
            case 'true':
            case 'false':
                inputValue = input.default;
                break;
            default:
                // A YAML single-quoted scalar escapes a quote by doubling it
                inputValue = `'${(input.default ?? '').replaceAll('\'', '\'\'')}'`;
        }
        lines.push(`    ${key}: ${inputValue}`);

        firstInput = false;
    }

    lines.push('```');
    return lines;
}

// Make text safe for one Markdown table cell
function tableCell(text: string): string {
    return text
        .trim()
        .replace(/\s+/g, ' ') // A line break would end the table row
        .replaceAll('|', '\\|');
}

/**
 * Render the outputs section: a Markdown table with one row for each output.
 */
export function renderOutputs(actionYaml: ActionMetadata): string[] {
    const lines = ['| Output | Description |', '| --- | --- |'];
    for (const [key, output] of Object.entries(actionYaml.outputs ?? {})) {
        lines.push(`| \`${tableCell(key)}\` | ${tableCell(output.description)} |`);
    }
    return lines;
}

/**
 * Replace the lines between startToken and endToken in content. The tokens themselves are kept.
 */
export function replaceSection(content: string, startToken: string, endToken: string, lines: string[]): string {
    // Find the start token
    const startTokenIndex = content.indexOf(startToken);
    if (startTokenIndex < 0) {
        throw new Error(`Start token '${startToken}' not found`);
    }

    // Find the end token
    const endTokenIndex = content.indexOf(endToken);
    if (endTokenIndex < 0) {
        throw new Error(`End token '${endToken}' not found`);
    } else if (endTokenIndex < startTokenIndex) {
        throw new Error('Start token must appear before end token');
    }

    return [
        content.substring(0, startTokenIndex + startToken.length),
        ...lines,
        content.substring(endTokenIndex),
    ].join(os.EOL);
}

/**
 * Regenerate the usage and outputs sections of the README from the action metadata.
 */
export async function updateReadme(
    actionReference: string,
    actionYamlPath = 'action.yml',
    readmePath = 'README.md',
): Promise<void> {
    // load files
    const [action, readme] = await Promise.all([
        fs.readFile(actionYamlPath, 'utf8'),
        fs.readFile(readmePath, 'utf8'),
    ]);

    // parse the action.yml
    const actionYaml = yaml.load(action) as ActionMetadata;

    // Build and write the new README
    let newReadme = replaceSection(readme, USAGE_START, USAGE_END, renderUsage(actionReference, actionYaml));
    newReadme = replaceSection(newReadme, OUTPUTS_START, OUTPUTS_END, renderOutputs(actionYaml));
    await fs.writeFile(readmePath, newReadme);
}

if (import.meta.main) {
    await updateReadme(
        `tediousjs/setup-sqlserver@v${version.split('.')[0]}`,
        path.join(__dirname, '..', 'action.yml'),
        path.join(__dirname, '..', 'README.md'),
    );
}
