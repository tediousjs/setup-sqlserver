import install from './install';
import * as core from '@actions/core';

(() => install().catch((e) => {
    core.setFailed(e as Error);
}))();
