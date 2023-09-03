import { createHash } from 'crypto';
import { createReadStream } from 'fs';

/**
 * Generate a sha256 hash of a file from its path.
 * This is used for some debugging info so that sha sums can be confirmed for downloaded assets.
 *
 * @param {string} path
 * @returns {Promise<Buffer>}
 */
export function generateFileHash(path: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const hash = createHash('sha256');
        const fh = createReadStream(path);
        fh.on('error', reject);
        fh.on('readable', () => {
            const data = fh.read();
            if (data) {
                hash.update(data);
            } else {
                resolve(hash.digest());
            }
        });
    });
}
