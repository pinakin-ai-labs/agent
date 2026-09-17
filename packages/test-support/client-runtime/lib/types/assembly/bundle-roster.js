/**
 * The browser roster of a `dsh --profile`, read from its bundle patch files
 * the way the launcher composes them: each bundle's `dsh.bundle.patch` list is
 * parsed with the include plugin's YAML dialect (`entryListSchema`) and
 * composed by its `applyEntryPatches`; every enabled row whose package
 * declares `dsh.client.platform === 'web'` becomes a roster row carrying that
 * declaration's `inject` and `immediately`; rows nested in Loader groups count
 * like the Loader counts them, a disabled group disabling every row beneath
 * it. A patch that matches nothing
 * throws here where the launcher warns. Nothing is copied from the bundles: a
 * bundle change is visible at the next import. Node only — the
 * whole-client tier runs under vitest, and this is the one place it reads the
 * repository.
 * @module @deepseek-ai/dsh-client-test-runtime/src/assembly/bundle-roster
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyEntryPatches, entryListSchema } from '@deepseek-ai/cordis-plugin-include';
import { exactPackageSpecifier, parseDshClient } from '@deepseek-ai/dsh-client-modules/client';
import * as yaml from 'js-yaml';
import { ClientRoster } from "./roster.js";
/** The `web` profile's bundle layers, in the order `dsh --profile web` applies them (app-boot `PROFILE_TEMPLATES.web`). */
export const WEB_PROFILE_BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'];
/**
 * Compose the browser roster of `bundles`, applied in order.
 * @param bundles - bundle package names in application order.
 * @param anchor - file whose package resolution locates the bundles; default this package.
 * @returns the roster in composition order, one row per package.
 * @throws {Error} when a bundle, its patch file, or an enabled row's package does not resolve, when the patch list
 * is not a list or does not apply as written, or when a browser row's `disabled` is a `!!js` expression.
 */
export function bundleRoster(bundles, anchor = fileURLToPath(import.meta.url)) {
    const layers = bundles.map(name => readLayer(name, anchor));
    const entries = applyEntryPatches([], layers.flatMap(layer => layer.patches), (message, ...args) => {
        throw new Error(`client-test-runtime: bundle patch ${describe(message, args)}`);
    });
    const anchors = layers.map(layer => layer.manifestPath);
    const rows = [];
    const seen = new Set();
    for (const { entry, disabled } of flattenGroups(entries)) {
        const name = exactPackageSpecifier(entry.name);
        if (name === undefined || disabled === true || seen.has(name))
            continue;
        seen.add(name);
        const manifestPath = locateManifest(anchors, name);
        if (manifestPath === undefined) {
            throw new Error(`client-test-runtime: cannot resolve plugin package ${name} from ${bundles.join(', ')}`);
        }
        const manifest = readManifest(manifestPath);
        if (manifest.name !== name) {
            throw new Error(`client-test-runtime: ${manifestPath} names ${JSON.stringify(manifest.name)}, expected ${name}`);
        }
        const declaration = parseDshClient(name, manifest.dsh?.client);
        if (declaration === undefined || declaration.platform !== 'web')
            continue;
        if (disabled !== undefined && disabled !== null && typeof disabled !== 'boolean') {
            throw new Error(`client-test-runtime: browser row ${name} has a \`disabled\` value this reader cannot evaluate (a !!js expression)`);
        }
        rows.push({ name, inject: declaration.inject ?? [], immediately: declaration.immediately === true });
    }
    return ClientRoster.of(rows);
}
function readLayer(bundle, anchor) {
    const manifestPath = locateManifest([anchor], bundle);
    if (manifestPath === undefined)
        throw new Error(`client-test-runtime: cannot resolve bundle ${bundle} from ${anchor}`);
    const patch = readManifest(manifestPath).dsh?.bundle?.patch;
    if (typeof patch !== 'string')
        throw new Error(`client-test-runtime: bundle ${bundle} declares no dsh.bundle.patch in ${manifestPath}`);
    const file = join(dirname(manifestPath), patch);
    const parsed = yaml.load(readFileSync(file, 'utf8'), { schema: entryListSchema });
    if (!Array.isArray(parsed))
        throw new Error(`client-test-runtime: ${file} must be a top-level list of patches`);
    return { manifestPath, patches: parsed };
}
/**
 * Rows in Loader order with groups descended, as the Loader loads them: a group is never a plugin itself, and a group's
 * `disabled` disables every row beneath it.
 * @param entries - composed entries, possibly nested.
 * @param inherited - the enclosing group's `disabled` when set.
 * @returns the plugin rows.
 */
function flattenGroups(entries, inherited) {
    const rows = [];
    for (const entry of entries) {
        const own = entry.disabled;
        const disabled = inherited !== undefined && inherited !== null && inherited !== false ? inherited : own;
        if (entry.group === true && Array.isArray(entry.config)) {
            rows.push(...flattenGroups(entry.config, disabled));
            continue;
        }
        rows.push({ entry, disabled });
    }
    return rows;
}
function readManifest(path) {
    return JSON.parse(readFileSync(path, 'utf8'));
}
/** Locate `<name>/package.json` on the resolution paths of any anchor, without requiring a `./package.json` export. */
function locateManifest(anchors, name) {
    for (const anchor of anchors) {
        for (const searchPath of createRequire(anchor).resolve.paths(name) ?? []) {
            const candidate = join(searchPath, name, 'package.json');
            if (existsSync(candidate))
                return candidate;
        }
    }
    return undefined;
}
/** The include plugin's `%C` placeholders, filled the way the launcher prints them. */
function describe(message, args) {
    let index = 0;
    return message.replace(/%C/g, () => JSON.stringify(args[index++]));
}
/** The `web` profile's browser roster, composed from its bundles at import. */
export const webApp = bundleRoster(WEB_PROFILE_BUNDLES);
//# sourceMappingURL=bundle-roster.js.map