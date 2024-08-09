import * as core from '@actions/core';
import install from './install';

(() => install().catch((e) => {
    core.setFailed(e as Error);
}))();
