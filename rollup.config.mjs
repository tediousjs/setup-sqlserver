import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';

export default {
    input: 'src/main.ts',
    output: {
        file: 'lib/main/index.js',
        format: 'es',
        sourcemap: true,
        inlineDynamicImports: true,
    },
    plugins: [
        typescript({
            tsconfig: './tsconfig.json',
            sourceMap: true,
            inlineSources: false,
            declaration: false,
            // fail the build on type errors; by default the plugin only warns and still writes the bundle
            noEmitOnError: true,
        }),
        nodeResolve({ preferBuiltins: true, exportConditions: ['node'] }),
        commonjs(),
        json(),
        terser(),
    ],
};
