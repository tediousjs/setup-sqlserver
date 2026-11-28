// Fetch a cumulative update page through a real proxy. Unlike test/utils.ts, this file does not mock
// @actions/http-client, so it checks that the page request really follows the proxy settings.
import { createServer, type Server } from 'node:http';
import { connect } from 'node:net';
import { describe, it, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const core = {
    info: mock.fn(),
    debug: mock.fn(),
    warning: mock.fn(),
    notice: mock.fn(),
    isDebug: mock.fn(() => false),
};
const tc = {
    downloadTool: mock.fn(async () => 'C:\\tmp\\update'),
    cacheFile: mock.fn(async () => 'C:\\tools\\sqlupdate'),
};
const io = { mv: mock.fn(async () => {}) };

mock.module('@actions/core', { namedExports: core });
mock.module('@actions/tool-cache', { namedExports: tc });
mock.module('@actions/io', { namedExports: io });
mock.module('node:timers/promises', { namedExports: { setTimeout: async () => {} } });

const utils = await import('../src/utils.ts');

const updateUrl = 'https://download.microsoft.com/download/0/SQLServer2022-KB1-x64.exe';

function listen(server: Server): Promise<number> {
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            resolve(typeof address === 'object' && address ? address.port : 0);
        });
    });
}

describe('cumulative update page through a proxy', () => {
    // the page is on a host that doesn't exist, so the request can only reach it through the proxy
    const config = { version: '2022', updateUrl: 'http://cu-page.test/en-us/download/details.aspx?id=1' };
    let cut = false;
    let redirect: 'none' | 'relative' | 'cut' = 'none';
    const page = createServer((req, res) => {
        if (redirect !== 'none' && !req.url?.startsWith('/moved')) {
            if (redirect === 'cut') {
                // send part of the redirect body, then close the connection
                res.writeHead(302, { location: '/moved', 'content-length': '1000' });
                res.write('moved', () => req.socket.destroy());
                return;
            }
            res.writeHead(302, { location: '/moved/page' });
            res.end('moved');
            return;
        }
        if (cut) {
            // send part of the body, then close the connection
            res.writeHead(200, { 'content-type': 'text/html', 'content-length': '1000' });
            res.write('<a href=', () => req.socket.destroy());
            return;
        }
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<a href="${updateUrl}">download</a>`);
    });
    const tunnels: string[] = [];
    let refuse = false;
    // a CONNECT proxy that sends every tunnel to the page server
    const proxy = createServer((_req, res) => {
        res.writeHead(502).end();
    });
    let pagePort = 0;
    let proxyPort = 0;
    const env = ['https_proxy', 'HTTPS_PROXY', 'http_proxy', 'HTTP_PROXY', 'no_proxy', 'NO_PROXY'];
    const original: Record<string, string | undefined> = {};

    before(async () => {
        pagePort = await listen(page);
        proxy.on('connect', (req, socket) => {
            tunnels.push(req.url ?? '');
            if (refuse) {
                socket.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n');
                return;
            }
            const upstream = connect(pagePort, '127.0.0.1', () => {
                socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
                upstream.pipe(socket);
                socket.pipe(upstream);
            });
            upstream.on('error', () => socket.destroy());
            socket.on('error', () => upstream.destroy());
        });
        proxyPort = await listen(proxy);
    });
    after(() => {
        page.close();
        proxy.close();
    });
    beforeEach(() => {
        for (const name of env) {
            original[name] = process.env[name];
            delete process.env[name];
        }
        process.env.HTTP_PROXY = `http://127.0.0.1:${proxyPort}`;
        tunnels.length = 0;
        refuse = false;
        cut = false;
        redirect = 'none';
        for (const fn of [core.info, core.debug, core.warning, core.notice, tc.downloadTool, tc.cacheFile, io.mv]) {
            fn.mock.resetCalls();
        }
    });
    // restore in the reverse order: Windows treats https_proxy and HTTPS_PROXY as one variable, so the first save has
    // the value and must be restored last
    afterEach(() => {
        for (const name of [...env].reverse()) {
            if (original[name] === undefined) {
                delete process.env[name];
            } else {
                process.env[name] = original[name];
            }
        }
    });

    it('fetches the page through the proxy', { timeout: 10_000 }, async () => {
        await utils.downloadUpdateInstaller(config);
        assert.deepEqual(tunnels, ['cu-page.test:80']);
        assert.equal(tc.downloadTool.mock.calls[0].arguments[0], updateUrl);
        assert.ok(core.info.mock.calls.some((c) => c.arguments[0] === `Fetching the cumulative update page through the proxy 127.0.0.1:${proxyPort}`));
    });
    it('reports a proxy that refuses the request, and how to fetch the page directly', { timeout: 10_000 }, async () => {
        refuse = true;
        await assert.rejects(() => utils.downloadUpdateInstaller(config), (error: Error) => {
            assert.match(error.message, /after 3 attempt\(s\): .*statusCode=407/);
            assert.match(error.message, /To fetch the page directly, set NO_PROXY=cu-page\.test on the setup-sqlserver step$/);
            return true;
        });
        assert.equal(tunnels.length, 3);
        assert.equal(tc.downloadTool.mock.callCount(), 0);
    });
    it('uses HTTPS_PROXY for an https page', { timeout: 10_000 }, async () => {
        // the update pages are https, so this is the path that the action uses; the proxy refuses the tunnel, so the
        // test needs no TLS server
        delete process.env.HTTP_PROXY;
        process.env.HTTPS_PROXY = `http://127.0.0.1:${proxyPort}`;
        refuse = true;
        const httpsConfig = { ...config, updateUrl: 'https://cu-page.test/en-us/download/details.aspx?id=1' };
        await assert.rejects(() => utils.downloadUpdateInstaller(httpsConfig), /statusCode=407.*set NO_PROXY=cu-page\.test on the setup-sqlserver step$/);
        assert.deepEqual(tunnels, ['cu-page.test:443', 'cu-page.test:443', 'cu-page.test:443']);
    });
    it('follows a relative redirect through the proxy', { timeout: 10_000 }, async () => {
        redirect = 'relative';
        await utils.downloadUpdateInstaller(config);
        assert.deepEqual(tunnels, ['cu-page.test:80', 'cu-page.test:80']);
        assert.equal(tc.downloadTool.mock.calls[0].arguments[0], updateUrl);
    });
    it('fails and retries when the connection closes before the end of a redirect', { timeout: 10_000 }, async () => {
        redirect = 'cut';
        await assert.rejects(() => utils.downloadUpdateInstaller(config), /after 3 attempt\(s\): aborted\./);
        assert.equal(tunnels.length, 3);
    });
    it('fails and retries when the connection closes before the end of the page', { timeout: 10_000 }, async () => {
        cut = true;
        await assert.rejects(() => utils.downloadUpdateInstaller(config), /after 3 attempt\(s\): aborted\./);
        assert.equal(tunnels.length, 3);
        assert.equal(tc.downloadTool.mock.callCount(), 0);
    });
});
