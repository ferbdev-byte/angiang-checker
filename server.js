const http = require('http');
const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const port = Number(process.env.PORT || 3000);

const parseEnvFile = (filePath) => {
    if (!fs.existsSync(filePath)) return {};

    return fs.readFileSync(filePath, 'utf8')
        .split(/\r?\n/)
        .reduce((accumulator, line) => {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.startsWith('#')) return accumulator;

            const equalsIndex = trimmedLine.indexOf('=');
            if (equalsIndex === -1) return accumulator;

            const key = trimmedLine.slice(0, equalsIndex).trim();
            const value = trimmedLine.slice(equalsIndex + 1).trim();
            accumulator[key] = value;
            return accumulator;
        }, {});
};

const env = {
    ...parseEnvFile(path.join(rootDir, '.env.local')),
    ...process.env
};

const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.svg': 'image/svg+xml; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon'
};

const sendFile = (filePath, response) => {
    fs.readFile(filePath, (error, data) => {
        if (error) {
            response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            response.end('Not found');
            return;
        }

        const contentType = mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
        response.writeHead(200, { 'Content-Type': contentType });
        response.end(data);
    });
};

const server = http.createServer((request, response) => {
    const requestPath = decodeURIComponent((request.url || '/').split('?')[0]);

    if (requestPath === '/config.js' || requestPath === '/api/config') {
        const config = {
            url: env.SUPABASE_URL || '',
            anonKey: env.SUPABASE_ANON_KEY || ''
        };

        response.writeHead(200, {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'no-store'
        });
        response.end(`window.__SUPABASE_CONFIG__ = ${JSON.stringify(config)};`);
        return;
    }

    const safePath = requestPath === '/' ? '/index.html' : requestPath;
    const filePath = path.normalize(path.join(rootDir, safePath));

    if (!filePath.startsWith(rootDir)) {
        response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
    }

    sendFile(filePath, response);
});

server.listen(port, () => {
    console.log(`An Giang Tracker running at http://localhost:${port}`);
});