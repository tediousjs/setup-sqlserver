import { setFailed } from '@actions/core';
import install from './install.ts';

(() => install().catch((e) => {
    setFailed(e as Error);
}))();
