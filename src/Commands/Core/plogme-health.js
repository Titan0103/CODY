'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = process.cwd();
const CRITICAL_FILES = ['index.js', 'src/Plugin/crysLoadCmd.js', 'src/Plugin/crysMsg.js', 'src/Commands/Core/plogme.js'];

function check(name, ok, details = '') { return { name, ok: !!ok, details: String(details || '') }; }

function runHealthChecks(options = {}) {
    const checks = [];
    checks.push(check('runtime', Number(process.versions.node.split('.')[0]) >= 20, `Node ${process.version}`));
    checks.push(check('project-root', fs.existsSync(path.join(ROOT, 'package.json')), ROOT));
    let packageData = {};
    try { packageData = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')); checks.push(check('package-json', true, `${packageData.name || 'unknown'}@${packageData.version || 'unknown'}`)); } catch (error) { checks.push(check('package-json', false, error.message)); }
    for (const rel of CRITICAL_FILES) {
        const abs = path.join(ROOT, rel);
        let valid = fs.existsSync(abs);
        let details = valid ? 'present' : 'missing';
        if (valid && rel.endsWith('.js') && options.syntax !== false) {
            try { execFileSync(process.execPath, ['--check', abs], { cwd: ROOT, timeout: 20000, stdio: 'pipe' }); details = 'present and syntax-valid'; }
            catch (error) { valid = false; details = String(error.stderr || error.message).slice(0, 1000); }
        }
        checks.push(check(rel, valid, details));
    }
    const db = path.join(ROOT, 'database');
    try { fs.mkdirSync(db, { recursive: true }); const probe = path.join(db, `.plogme-health-${process.pid}`); fs.writeFileSync(probe, 'ok'); fs.unlinkSync(probe); checks.push(check('database-writable', true, db)); }
    catch (error) { checks.push(check('database-writable', false, error.message)); }
    const failed = checks.filter(item => !item.ok);
    return { ok: failed.length === 0, checkedAt: new Date().toISOString(), checks, failed };
}

module.exports = { runHealthChecks, CRITICAL_FILES };
