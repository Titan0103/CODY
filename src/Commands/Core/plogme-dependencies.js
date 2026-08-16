'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = process.cwd();
const PACKAGE_FILE = path.join(ROOT, 'package.json');
const SAFE_SPEC = /^(?:@?[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*(?:@[a-z0-9._*+~^<>= -]+)?$/i;

function packageSpec(raw) {
    const spec = String(raw || '').trim().replace(/^npm\s+/i, '');
    if (!spec || spec.startsWith('-') || spec.includes('&&') || spec.includes(';') || spec.includes('|') || spec.includes('..')) return null;
    return SAFE_SPEC.test(spec) ? spec : null;
}

function readManifest() {
    try { return JSON.parse(fs.readFileSync(PACKAGE_FILE, 'utf8')); } catch { return {}; }
}

function localStatus(raw) {
    const spec = packageSpec(raw);
    if (!spec) return { ok: false, error: 'Invalid package name or version spec' };
    const name = spec.startsWith('@') ? spec.slice(0, spec.indexOf('@', 1) > 0 ? spec.indexOf('@', 1) : spec.length) : spec.split('@')[0];
    const manifest = readManifest();
    const declared = manifest.dependencies?.[name] || manifest.devDependencies?.[name] || null;
    let installed = null;
    try { installed = require(path.join(ROOT, 'node_modules', name, 'package.json')).version; } catch {}
    return { ok: true, name, spec, declared, installed, missing: !installed };
}

async function registryInfo(raw) {
    const spec = packageSpec(raw);
    if (!spec) return { ok: false, error: 'Invalid package name or version spec' };
    const name = spec.startsWith('@') ? spec.slice(0, spec.indexOf('@', 1) > 0 ? spec.indexOf('@', 1) : spec.length) : spec.split('@')[0];
    try {
        const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, { headers: { accept: 'application/json' } });
        if (!response.ok) return { ok: false, error: `npm registry returned ${response.status}` };
        const data = await response.json();
        const latest = data['dist-tags']?.latest || null;
        const version = spec.includes('@', 1) ? spec.slice(spec.indexOf('@', 1) + 1) : latest;
        return { ok: true, name, requested: spec, latest, version, description: data.description || '', homepage: data.homepage || '', deprecated: data.versions?.[version]?.deprecated || null };
    } catch (error) {
        return { ok: false, error: error.message };
    }
}

function install(raw, options = {}) {
    const spec = packageSpec(raw);
    if (!spec) return { ok: false, error: 'Invalid package name or version spec' };
    if (options.dryRun) return { ok: true, dryRun: true, command: ['install', '--save', spec] };
    const result = spawnSync('npm', ['install', '--save', spec], {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: Number(options.timeout || 120000),
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true
    });
    const output = `${result.stdout || ''}${result.stderr || ''}`.slice(-6000);
    return {
        ok: result.status === 0,
        spec,
        status: result.status,
        signal: result.signal || null,
        output,
        error: result.error?.message || (result.status === 0 ? null : 'npm install failed')
    };
}

module.exports = { packageSpec, localStatus, registryInfo, install };
