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
        }),
        nodeResolve({ preferBuiltins: true, exportConditions: ['node'] }),
        commonjs(),
        json(),
        terser(),
    ],
};
