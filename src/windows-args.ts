/**
 * Quote a value for a Windows command line, so that a program that splits its
 * command line with the standard Windows rules (CommandLineToArgvW and the C
 * runtime) gets the value back unchanged.
 *
 * The value is wrapped in double quotes. A double quote in the value becomes
 * `\"`, and backslashes are doubled only where they come before a double quote
 * or the closing quote, because backslashes anywhere else are literal.
 *
 * Use this for values that the action puts in a command line itself when it
 * runs a program with `windowsVerbatimArguments`, where `@actions/exec` adds no
 * quoting of its own.
 *
 * @param {string} value
 * @returns {string} The quoted value, including the surrounding double quotes
 */
export function quoteWindowsArgument(value: string): string {
    let quoted = '"';
    let backslashes = 0;
    for (const char of value) {
        if (char === '\\') {
            backslashes++;
            continue;
        }
        if (char === '"') {
            // each backslash before a quote must be escaped, and so must the quote itself
            quoted += '\\'.repeat(backslashes * 2 + 1) + '"';
        } else {
            quoted += '\\'.repeat(backslashes) + char;
        }
        backslashes = 0;
    }
    // backslashes before the closing quote must be escaped, or they would escape it
    return `${quoted}${'\\'.repeat(backslashes * 2)}"`;
}
