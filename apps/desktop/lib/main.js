import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { delimiter, dirname, extname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, Menu, app, dialog, ipcMain, protocol } from "electron";
import { homedir } from "node:os";
import { satisfies, valid } from "semver";
import { spawn } from "node:child_process";
import { closeSync, existsSync, fsyncSync, ftruncateSync, lstatSync, mkdirSync, openSync, readFile as readFile$1, readFileSync, readdirSync, readlinkSync, realpathSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { once } from "node:events";
import { Readable, Writable } from "node:stream";
import electronUpdater from "electron-updater";
//#region ../../packages/util/home-paths/src/index.ts
/** Directory name for the default DeepSeek Harness home under the OS home. */
const DSH_HOME_DIR_NAME = ".dsh";
/** Environment variable that overrides the default DeepSeek Harness home. */
const DSH_HOME_ENV = "DSH_HOME";
/**
* Resolve the default DeepSeek Harness home using Node's platform path rules.
* @returns the absolute default harness home path.
*/
function defaultDshHome() {
	return join(homedir(), DSH_HOME_DIR_NAME);
}
/**
* Expand supported tilde prefixes against the operating-system home.
* @param path - configured path that may begin with `~`, `~/`, or `~\`.
* @returns the expanded path, or the original value when no supported prefix is present.
*/
function expandHomePath(path) {
	if (path === "~") return homedir();
	if (path.startsWith("~/") || path.startsWith("~\\")) return join(homedir(), path.slice(2));
	return path;
}
/**
* Resolve the single-root DeepSeek Harness home.
*
* Precedence, highest first: an explicit configured path, `$DSH_HOME`, then
* `~/.dsh`. The harness keeps all user data under one root. An empty or
* whitespace-only `$DSH_HOME` is treated as unset, so a blank override never
* resolves the home to the current working directory.
* @param configured - explicit harness-home override, which has highest precedence.
* @param env - environment mapping used to read `DSH_HOME`.
* @returns the normalized absolute harness home path.
*/
function resolveDshHome(configured, env = process.env) {
	const fromEnv = env[DSH_HOME_ENV];
	return resolve(expandHomePath(configured ?? (fromEnv !== void 0 && fromEnv.trim().length > 0 ? fromEnv : defaultDshHome())));
}
//#endregion
//#region lib/types/paths.js
/** Filesystem ownership for the Electron-managed desktop installation. */
/**
* Resolve every Electron-owned path without changing the shared data roots.
* @param dshHome - Harness home shared with npm-installed dsh.
* @returns immutable desktop path set.
*/
function resolveDesktopPaths(dshHome = resolveDshHome()) {
	const root = join(dshHome, "desktop");
	const pnpm = join(root, "pnpm");
	return {
		root,
		profile: join(dshHome, "profiles", "desktop"),
		lock: join(dshHome, "profiles", "desktop", "lock"),
		pnpm: {
			root: pnpm,
			store: join(pnpm, "store"),
			cache: join(pnpm, "cache"),
			state: join(pnpm, "state"),
			config: join(pnpm, "config"),
			home: join(pnpm, "home")
		}
	};
}
//#endregion
//#region lib/types/core-package-set.js
/** Private package installed beside dsh to boot the Desktop Host process. */
const DESKTOP_HOST_PACKAGE = "@deepseek-ai/dsh-desktop-host";
//#endregion
//#region lib/types/owned-directory.js
/** Desktop transaction cleanup that unlinks directory links without visiting their targets. */
/**
* Remove an owned directory and its contents, unlinking root and nested links.
* Missing roots are ignored; existing roots must be directories or links.
* @param path - Owned directory or link to remove; link targets are preserved.
*/
function removeOwnedDirectory(path) {
	const stat = lstatSync(path, { throwIfNoEntry: false });
	if (stat === void 0) return;
	if (stat.isSymbolicLink()) {
		unlinkSync(path);
		return;
	}
	if (!stat.isDirectory()) throw new Error(`desktop project: owned directory path is not a directory: ${path}`);
	for (const entry of readdirSync(path, { withFileTypes: true })) {
		const child = join(path, entry.name);
		if (entry.isDirectory()) removeOwnedDirectory(child);
		else unlinkSync(child);
	}
	rmdirSync(path);
}
//#endregion
//#region lib/types/host-protocol.js
/** Maximum raw body bytes carried by one data frame. */
const DESKTOP_PIPE_CHUNK_BYTES = 64 * 1024;
const FRAME_MAGIC = 1146308659;
const FRAME_HEADER_BYTES = 13;
const MAX_CONTROL_PAYLOAD_BYTES = 1024 * 1024;
const REQUEST_FRAME_START = 1;
const REQUEST_FRAME_DATA = 2;
const REQUEST_FRAME_END = 3;
const REQUEST_FRAME_CANCEL = 4;
const RESPONSE_FRAME_START = 1;
const RESPONSE_FRAME_DATA = 2;
const RESPONSE_FRAME_END = 3;
const RESPONSE_FRAME_ERROR = 4;
function isRecord$1(value) {
	return typeof value === "object" && value !== null;
}
function isHeaders(value) {
	return Array.isArray(value) && value.every((header) => Array.isArray(header) && header.length === 2 && typeof header[0] === "string" && typeof header[1] === "string");
}
function assertStreamId(streamId) {
	if (!Number.isInteger(streamId) || streamId < 1 || streamId > 4294967295) throw new Error(`dsh desktop: invalid pipe stream id ${String(streamId)}`);
}
function encodeFrame(type, streamId, payload) {
	assertStreamId(streamId);
	const limit = type === REQUEST_FRAME_DATA ? DESKTOP_PIPE_CHUNK_BYTES : MAX_CONTROL_PAYLOAD_BYTES;
	if (payload.byteLength > limit) throw new Error(`dsh desktop: request pipe frame exceeds the ${String(limit)}-byte limit`);
	const frame = Buffer.allocUnsafe(FRAME_HEADER_BYTES + payload.byteLength);
	frame.writeUInt32BE(FRAME_MAGIC, 0);
	frame.writeUInt8(type, 4);
	frame.writeUInt32BE(streamId, 5);
	frame.writeUInt32BE(payload.byteLength, 9);
	payload.copy(frame, FRAME_HEADER_BYTES);
	return frame;
}
function encodeJsonFrame(type, streamId, value) {
	return encodeFrame(type, streamId, Buffer.from(JSON.stringify(value), "utf8"));
}
/** Encode the metadata opening one request stream. */
function encodeDesktopRequestStart(streamId, request) {
	return encodeJsonFrame(REQUEST_FRAME_START, streamId, request);
}
/** Encode one bounded raw request-body chunk. */
function encodeDesktopRequestData(streamId, data) {
	return encodeFrame(REQUEST_FRAME_DATA, streamId, Buffer.from(data));
}
/** Encode normal request-body completion. */
function encodeDesktopRequestEnd(streamId) {
	return encodeFrame(REQUEST_FRAME_END, streamId, Buffer.alloc(0));
}
/** Encode cancellation of one request and its response. */
function encodeDesktopRequestCancel(streamId) {
	return encodeFrame(REQUEST_FRAME_CANCEL, streamId, Buffer.alloc(0));
}
/** Incrementally decode validated response frames from the Host byte pipe. */
var DesktopHostResponseDecoder = class {
	buffer = Buffer.alloc(0);
	/**
	* Append bytes and return every complete response frame.
	* @param chunk - next bytes read from the Host response pipe.
	* @returns complete frames in pipe order.
	*/
	push(chunk) {
		this.buffer = this.buffer.byteLength === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
		const frames = [];
		for (;;) {
			const frame = this.next();
			if (frame === void 0) return frames;
			frames.push(frame);
		}
	}
	/** Reject EOF that splits a frame. */
	finish() {
		if (this.buffer.byteLength !== 0) throw new Error("dsh desktop: Host response pipe ended inside a frame");
	}
	next() {
		if (this.buffer.byteLength < FRAME_HEADER_BYTES) return void 0;
		if (this.buffer.readUInt32BE(0) !== FRAME_MAGIC) throw new Error("dsh desktop: invalid Host response frame marker");
		const rawType = this.buffer.readUInt8(4);
		const streamId = this.buffer.readUInt32BE(5);
		const payloadLength = this.buffer.readUInt32BE(9);
		assertStreamId(streamId);
		const limit = rawType === RESPONSE_FRAME_DATA ? DESKTOP_PIPE_CHUNK_BYTES : MAX_CONTROL_PAYLOAD_BYTES;
		if (payloadLength > limit) throw new Error(`dsh desktop: Host response frame exceeds the ${String(limit)}-byte limit`);
		const frameLength = FRAME_HEADER_BYTES + payloadLength;
		if (this.buffer.byteLength < frameLength) return void 0;
		const payload = this.buffer.subarray(FRAME_HEADER_BYTES, frameLength);
		this.buffer = this.buffer.subarray(frameLength);
		switch (rawType) {
			case RESPONSE_FRAME_START: return this.parseStart(streamId, payload);
			case RESPONSE_FRAME_DATA: return {
				type: "data",
				streamId,
				data: payload
			};
			case RESPONSE_FRAME_END:
				if (payloadLength !== 0) throw new Error("dsh desktop: Host response end frame carried a payload");
				return {
					type: "end",
					streamId
				};
			case RESPONSE_FRAME_ERROR: return this.parseError(streamId, payload);
			default: throw new Error(`dsh desktop: unknown Host response frame type ${String(rawType)}`);
		}
	}
	parseStart(streamId, payload) {
		const value = this.parseJson(payload, "start");
		if (!isRecord$1(value) || !Number.isInteger(value.status) || value.status < 100 || value.status > 599 || !isHeaders(value.headers) || typeof value.hasBody !== "boolean") throw new Error("dsh desktop: invalid Host response start payload");
		return {
			type: "start",
			streamId,
			status: value.status,
			headers: value.headers,
			hasBody: value.hasBody
		};
	}
	parseError(streamId, payload) {
		const value = this.parseJson(payload, "error");
		if (!isRecord$1(value) || typeof value.message !== "string") throw new Error("dsh desktop: invalid Host response error payload");
		return {
			type: "error",
			streamId,
			message: value.message
		};
	}
	parseJson(payload, subject) {
		try {
			return JSON.parse(payload.toString("utf8"));
		} catch (error) {
			throw new Error(`dsh desktop: Host response ${subject} payload is not JSON: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
};
//#endregion
//#region lib/types/runtime-tree.js
/** Relocatable, integrity-recorded production packages carried by one Desktop release. */
/** Descriptor at the root of the immutable Desktop resource tree. */
const DESKTOP_RUNTIME_FILE = "desktop-runtime.json";
const PACKAGE_NAME$1 = /^(?:@[a-z0-9][a-z0-9._~-]*\/[a-z0-9][a-z0-9._~-]*|[a-z0-9][a-z0-9._~-]*)$/u;
promisify(readFile$1);
function record$1(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/**
* Resolve one portable resource path without permitting traversal or absolute paths.
* @param root - Runtime root.
* @param path - Slash-separated relative path from durable metadata.
* @returns Absolute resource path.
*/
function runtimePath(root, path) {
	if (path === "" || isAbsolute(path) || path.includes("\\") || path.includes(":") || path.split("/").some((part) => part === "" || part === "." || part === "..")) throw new Error(`desktop runtime: invalid relative path ${JSON.stringify(path)}`);
	return join(root, ...path.split("/"));
}
/**
* Read packaged metadata and check shared package records.
* @param root - Current application's runtime resources.
* @returns Runtime metadata whose release compatibility is verified during packaging.
*/
function readDesktopRuntime(root) {
	const value = JSON.parse(readFileSync(join(root, DESKTOP_RUNTIME_FILE), "utf8"));
	if (!record$1(value) || typeof value.platform !== "string" || typeof value.arch !== "string" || !Array.isArray(value.sharedPackages) || !Array.isArray(value.files)) throw new Error("desktop runtime: invalid descriptor");
	if (!record$1(value.release) || typeof value.release.version !== "string" || typeof value.release.nodeVersion !== "string" || typeof value.release.pnpmVersion !== "string") throw new Error("desktop runtime: invalid release fields");
	const release = value.release;
	const sharedPackages = value.sharedPackages.map((entry) => {
		if (!record$1(entry) || typeof entry.name !== "string" || !PACKAGE_NAME$1.test(entry.name) || typeof entry.version !== "string" || valid(entry.version) === null || entry.path !== `node_modules/${entry.name}`) throw new Error("desktop runtime: invalid shared package record");
		return {
			name: entry.name,
			version: entry.version,
			path: entry.path
		};
	});
	if (new Set(sharedPackages.map((entry) => entry.name)).size !== sharedPackages.length) throw new Error("desktop runtime: duplicate shared package");
	const files = value.files;
	for (const name of ["@deepseek-ai/dsh", DESKTOP_HOST_PACKAGE]) if (sharedPackages.find((entry) => entry.name === name)?.version !== release.version) throw new Error(`desktop runtime: missing or mismatched ${name}`);
	return {
		schemaVersion: value.schemaVersion,
		release,
		platform: value.platform,
		arch: value.arch,
		sharedPackages,
		files
	};
}
/**
* Identify exact runtime content independently of its installation path.
* @param descriptor - Validated runtime metadata.
* @returns SHA-256 runtime identity.
*/
function desktopRuntimeId(descriptor) {
	return createHash("sha256").update(JSON.stringify(descriptor)).digest("hex");
}
//#endregion
//#region lib/types/profile-packages.js
/** Desktop-owned host links and validation of the external plugin dependency graph. */
/** Applied runtime identity and the only links Desktop may replace. */
const DESKTOP_PROFILE_STATE = "desktop-runtime-state.json";
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/[a-z0-9][a-z0-9._~-]*|[a-z0-9][a-z0-9._~-]*)$/u;
function record(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stat(path) {
	try {
		return lstatSync(path);
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
		return;
	}
}
function inside(root, path) {
	const child = relative(root, path);
	return child === "" || !isAbsolute(child) && child !== ".." && !child.startsWith(`..${sep}`);
}
/**
* Read profile state without interpreting an unpublished predecessor format.
* @param profile - Desktop profile directory.
* @returns Validated state, or undefined for an uninitialized profile.
*/
function readDesktopProfileState(profile) {
	const path = join(profile, DESKTOP_PROFILE_STATE);
	if (!existsSync(path)) return void 0;
	const value = JSON.parse(readFileSync(path, "utf8"));
	if (!record(value) || value.schemaVersion !== 1 || typeof value.runtimeId !== "string" || !/^[a-f0-9]{64}$/u.test(value.runtimeId) || typeof value.version !== "string" || typeof value.nodeVersion !== "string" || typeof value.platform !== "string" || typeof value.arch !== "string" || typeof value.lockHash !== "string" || !Array.isArray(value.links)) throw new Error("desktop profile: invalid runtime state");
	const links = value.links.map((link) => {
		if (!record(link) || typeof link.name !== "string" || !PACKAGE_NAME.test(link.name) || typeof link.target !== "string" || !isAbsolute(link.target)) throw new Error("desktop profile: invalid managed link");
		return {
			name: link.name,
			target: link.target
		};
	});
	if (new Set(links.map((link) => link.name)).size !== links.length) throw new Error("desktop profile: duplicate managed link");
	return {
		schemaVersion: 1,
		runtimeId: value.runtimeId,
		version: value.version,
		nodeVersion: value.nodeVersion,
		platform: value.platform,
		arch: value.arch,
		lockHash: value.lockHash,
		links
	};
}
/**
* Hash the plugin lockfile, including the empty-profile case.
* @param profile - Desktop profile directory.
* @returns Lockfile content identity.
*/
function desktopPluginLockHash(profile) {
	const lock = join(profile, "pnpm-lock.yaml");
	return createHash("sha256").update(existsSync(lock) ? readFileSync(lock) : "").digest("hex");
}
/**
* Remove only recorded host links, without following even broken targets.
* @param profile - Desktop profile.
*/
function unlinkDesktopHostPackages(profile) {
	for (const link of readDesktopProfileState(profile)?.links ?? []) {
		const path = join(profile, "node_modules", link.name);
		const entry = stat(path);
		if (entry === void 0) continue;
		if (!entry.isSymbolicLink() || resolve(dirname(path), readlinkSync(path)) !== resolve(link.target)) throw new Error(`desktop profile: refusing to replace unowned package ${link.name}`);
		unlinkSync(path);
	}
}
/**
* Bind an external profile to this application's real package directories.
* @param profile - Candidate profile.
* @param root - Current immutable runtime directory.
* @param runtime - Verified release descriptor.
*/
function linkDesktopHostPackages(profile, root, runtime) {
	unlinkDesktopHostPackages(profile);
	const links = runtime.sharedPackages.map((entry) => ({
		name: entry.name,
		target: runtimePath(root, entry.path)
	}));
	for (const link of links) {
		const path = join(profile, "node_modules", link.name);
		if (stat(path) !== void 0) throw new Error(`desktop profile: plugin installed reserved host package ${link.name}`);
		mkdirSync(dirname(path), { recursive: true });
		symlinkSync(link.target, path, process.platform === "win32" ? "junction" : "dir");
	}
	const state = {
		schemaVersion: 1,
		runtimeId: desktopRuntimeId(runtime),
		version: runtime.release.version,
		nodeVersion: runtime.release.nodeVersion,
		platform: runtime.platform,
		arch: runtime.arch,
		lockHash: desktopPluginLockHash(profile),
		links
	};
	writeFileSync(join(profile, DESKTOP_PROFILE_STATE), `${JSON.stringify(state, void 0, 2)}\n`, { mode: 384 });
}
/**
* Record a runtime-resolved profile without changing links left by an earlier release.
* @param profile - Active Desktop profile.
* @param runtime - Verified release descriptor supplying the runtime generation.
*/
function recordDesktopRuntimeProfile(profile, runtime) {
	const links = readDesktopProfileState(profile)?.links ?? [];
	const state = {
		schemaVersion: 1,
		runtimeId: desktopRuntimeId(runtime),
		version: runtime.release.version,
		nodeVersion: runtime.release.nodeVersion,
		platform: runtime.platform,
		arch: runtime.arch,
		lockHash: desktopPluginLockHash(profile),
		links
	};
	writeFileSync(join(profile, DESKTOP_PROFILE_STATE), `${JSON.stringify(state, void 0, 2)}\n`, { mode: 384 });
}
function manifest(path) {
	const value = JSON.parse(readFileSync(join(path, "package.json"), "utf8"));
	if (!record(value) || typeof value.name !== "string" || typeof value.version !== "string") throw new Error(`desktop profile: invalid package manifest ${path}`);
	const dependencies = (key) => {
		const field = value[key];
		if (field === void 0) return {};
		if (!record(field) || Object.entries(field).some(([name, spec]) => !PACKAGE_NAME.test(name) || typeof spec !== "string")) throw new Error(`desktop profile: invalid ${key} in ${path}`);
		return field;
	};
	const optionalPeers = /* @__PURE__ */ new Set();
	if (record(value.peerDependenciesMeta)) {
		for (const [name, meta] of Object.entries(value.peerDependenciesMeta)) if (record(meta) && meta.optional === true) optionalPeers.add(name);
	}
	return {
		name: value.name,
		version: value.version,
		dependencies: dependencies("dependencies"),
		optionalDependencies: dependencies("optionalDependencies"),
		peerDependencies: dependencies("peerDependencies"),
		optionalPeers
	};
}
function packageFrom(anchor, name) {
	if (!PACKAGE_NAME.test(name)) throw new Error(`desktop profile: invalid package name ${name}`);
	for (const modules of createRequire(join(anchor, "package.json")).resolve.paths(name) ?? []) {
		const path = join(modules, name);
		if (existsSync(join(path, "package.json"))) return realpathSync.native(path);
	}
}
/**
* Prove active plugin dependencies stay local and share the host's exact package instances.
* @param profile - Profile with its generated host links present.
* @param root - Immutable runtime directory.
* @param runtime - Verified shared package inventory.
* @param activePlugins - Explicit enabled plugin roots whose peer compatibility is required.
* @param resolutionMode - Whether host packages are linked or supplied by a runtime generation.
*/
function validateDesktopPluginGraph(profile, root, runtime, activePlugins, resolutionMode = "link") {
	const profileRoot = realpathSync.native(profile);
	const shared = new Map(runtime.sharedPackages.map((entry) => {
		const path = runtimePath(root, entry.path);
		let canonical;
		try {
			canonical = realpathSync.native(path);
		} catch (error) {
			if (!existsSync(path)) throw error;
			canonical = resolve(path);
		}
		return [entry.name, {
			path: canonical,
			version: entry.version
		}];
	}));
	if (resolutionMode === "link") {
		for (const [name, entry] of shared) if (packageFrom(profile, name) !== entry.path) throw new Error(`desktop profile: missing or incorrect host link ${name}`);
	}
	if (activePlugins.length === 0) return;
	const scanned = /* @__PURE__ */ new Set();
	const scan = (modules) => {
		if (!existsSync(modules)) return;
		if (lstatSync(modules).isSymbolicLink()) throw new Error(`desktop profile: linked package container ${modules}`);
		const directory = realpathSync.native(modules);
		if (scanned.has(directory)) return;
		scanned.add(directory);
		for (const entry of readdirSync(modules, { withFileTypes: true })) {
			if (entry.name.startsWith(".")) continue;
			const path = join(modules, entry.name);
			if (entry.name.startsWith("@")) {
				scan(path);
				continue;
			}
			if (!existsSync(join(path, "package.json"))) throw new Error(`desktop profile: invalid installed package ${path}`);
			const canonical = realpathSync.native(path);
			const info = manifest(canonical);
			const host = shared.get(info.name);
			if (host !== void 0) {
				if (resolutionMode !== "runtime" && (canonical !== host.path || path !== join(profile, "node_modules", info.name))) throw new Error(`desktop profile: duplicate or aliased host package ${info.name} at ${path}`);
				continue;
			}
			if (entry.isSymbolicLink()) throw new Error(`desktop profile: linked private package ${path}`);
			if (!inside(profileRoot, canonical)) throw new Error(`desktop profile: package resolves outside profile: ${path}`);
			scan(join(path, "node_modules"));
		}
	};
	scan(join(profile, "node_modules"));
	const visited = /* @__PURE__ */ new Set();
	const visit = (path, chain) => {
		if (visited.has(path)) return;
		visited.add(path);
		const info = manifest(path);
		const deps = {
			...info.dependencies,
			...info.optionalDependencies
		};
		for (const [name, range] of Object.entries({
			...deps,
			...info.peerDependencies
		})) {
			const peer = name in info.peerDependencies;
			const optional = peer ? info.optionalPeers.has(name) : name in info.optionalDependencies;
			const host = shared.get(name);
			if (host !== void 0 && name in deps) throw new Error(`desktop profile: ${chain} must declare ${name} as a peer dependency`);
			if (host !== void 0) {
				if (peer && !satisfies(host.version, range)) throw new Error(`desktop profile: ${chain} requires ${name}@${range}, found ${host.version}`);
				continue;
			}
			const target = packageFrom(path, name);
			if (target === void 0 && optional) continue;
			if (target === void 0) throw new Error(`desktop profile: ${chain} requires missing ${name}@${range}`);
			if (!inside(profileRoot, target)) throw new Error(`desktop profile: ${chain} resolves ${name} outside its owned packages`);
			const dependency = manifest(target);
			if (peer && !satisfies(dependency.version, range)) throw new Error(`desktop profile: ${chain} requires ${name}@${range}, found ${dependency.version}`);
			visit(target, `${chain} -> ${name}`);
		}
	};
	for (const name of activePlugins) {
		const path = packageFrom(profile, name);
		if (path === void 0 || !inside(profileRoot, path)) throw new Error(`desktop profile: missing local plugin ${name}`);
		visit(path, name);
	}
}
//#endregion
//#region lib/types/project-manager.js
/** In-place owner of the reserved desktop profile and its private pnpm state. */
const PROJECT_NAME = "@deepseek-ai/dsh-desktop-runtime";
const CORE_BUILD_PACKAGE = "@deepseek-ai/dsh-subprocess-local";
const DESKTOP_PROFILE_BUNDLES = ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"];
const WORKSPACE_SETTINGS = "nodeLinker: hoisted\nautoInstallPeers: false\nstrictDepBuilds: true\n";
const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._~-]*\/[a-z0-9][a-z0-9._~-]*|[a-z0-9][a-z0-9._~-]*)$/u;
const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+_-]*$/u;
const DESKTOP_REGISTRY = "https://registry.npmjs.org/";
function errorOf$1(reason, fallback) {
	return reason instanceof Error ? reason : new Error(fallback);
}
function writeJson(path, value) {
	writeFileSync(path, `${JSON.stringify(value, void 0, 2)}\n`, { mode: 384 });
}
function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}
function workspaceFile(overrides = {}) {
	const entries = Object.entries(overrides).sort(([left], [right]) => left.localeCompare(right));
	const overrideSection = entries.length === 0 ? "" : `overrides:\n${entries.map(([name, spec]) => `  ${JSON.stringify(name)}: ${JSON.stringify(spec)}`).join("\n")}\n`;
	const coreBuildSpec = overrides[CORE_BUILD_PACKAGE];
	const coreBuildKey = coreBuildSpec === void 0 ? CORE_BUILD_PACKAGE : `${CORE_BUILD_PACKAGE}@${coreBuildSpec.replace("file:./", "file:")}`;
	return `packages:\n  - .\n\n${overrideSection}${WORKSPACE_SETTINGS}allowBuilds:\n  node-pty: true\n  koffi: true\n  fs-ext: true\n  ${JSON.stringify(coreBuildKey)}: true\n  '@google/genai': false\n  protobufjs: false\n  node-addon-require-builtin: false\n`;
}
function isRecord(value) {
	return typeof value === "object" && value !== null;
}
function assertPackageName(name) {
	if (!PACKAGE_NAME_PATTERN.test(name)) throw new Error(`desktop project: invalid npm package name ${JSON.stringify(name)}`);
}
function assertVersion(version) {
	if (!VERSION_PATTERN.test(version)) throw new Error(`desktop project: invalid exact version ${JSON.stringify(version)}`);
}
/**
* Validate one registry package spec and return its package name.
* @param spec - npm registry name with an optional version or tag.
* @returns Requested package name.
*/
function packageNameFromSpec(spec) {
	if (spec === "" || spec.startsWith("-") || /[\s\\]/u.test(spec) || spec.includes("://") || spec.startsWith("file:")) throw new Error(`desktop project: unsupported npm package spec ${JSON.stringify(spec)}`);
	if (spec.startsWith("@")) {
		const slash = spec.indexOf("/");
		if (slash === -1) throw new Error(`desktop project: invalid scoped package spec ${JSON.stringify(spec)}`);
		const versionAt = spec.indexOf("@", slash);
		const name = versionAt === -1 ? spec : spec.slice(0, versionAt);
		assertPackageName(name);
		if (versionAt !== -1) assertVersion(spec.slice(versionAt + 1));
		return name;
	}
	const versionAt = spec.indexOf("@");
	const name = versionAt === -1 ? spec : spec.slice(0, versionAt);
	assertPackageName(name);
	if (versionAt !== -1) assertVersion(spec.slice(versionAt + 1));
	return name;
}
function projectManifest(projectDir) {
	const path = join(projectDir, "package.json");
	const value = readJson(path);
	const dsh = isRecord(value) && isRecord(value.dsh) ? value.dsh : void 0;
	const profile = isRecord(dsh?.profile) ? dsh.profile : void 0;
	if (!isRecord(value) || value.name !== PROJECT_NAME || value.private !== true || typeof value.version !== "string" || value.dependencies !== void 0 && !isRecord(value.dependencies) || !Array.isArray(profile?.bundles) || !profile.bundles.every((bundle) => typeof bundle === "string")) throw new Error(`desktop project: invalid desktop profile manifest ${path}`);
	const manifest = {
		...value,
		dependencies: value.dependencies ?? {}
	};
	if (Object.entries(manifest.dependencies).some(([name, version]) => !PACKAGE_NAME_PATTERN.test(name) || typeof version !== "string" || valid(version) !== version)) throw new Error("desktop project: plugin dependencies must use exact registry versions");
	return manifest;
}
function profilePluginNames(projectDir) {
	const bundles = projectManifest(projectDir).dsh.profile.bundles;
	if (!DESKTOP_PROFILE_BUNDLES.every((bundle, index) => bundles[index] === bundle)) throw new Error("desktop project: profile must begin with the built-in desktop bundle list");
	const plugins = bundles.slice(DESKTOP_PROFILE_BUNDLES.length);
	if (new Set(bundles).size !== bundles.length) throw new Error("desktop project: profile bundle list contains a duplicate package");
	for (const plugin of plugins) assertPackageName(plugin);
	return plugins;
}
function pluginRecords(projectDir) {
	return Object.keys(projectManifest(projectDir).dependencies).sort().map((name) => inspectPlugin(projectDir, name));
}
function writeProfilePlugins(projectDir, plugins) {
	const manifest = projectManifest(projectDir);
	writeJson(join(projectDir, "package.json"), {
		...manifest,
		dsh: {
			...manifest.dsh,
			profile: {
				...manifest.dsh.profile,
				bundles: [...DESKTOP_PROFILE_BUNDLES, ...plugins.filter((plugin) => plugin.enabled).map((plugin) => plugin.name)]
			}
		}
	});
}
function inspectPlugin(projectDir, requestedName) {
	const manifestPath = join(projectDir, "node_modules", ...requestedName.split("/"), "package.json");
	if (!existsSync(manifestPath)) throw new Error(`desktop project: installed package ${JSON.stringify(requestedName)} has no manifest`);
	const manifest = readJson(manifestPath);
	if (!isRecord(manifest) || manifest.name !== requestedName || typeof manifest.version !== "string") throw new Error(`desktop project: installed package ${JSON.stringify(requestedName)} has inconsistent name or version`);
	const dsh = manifest.dsh;
	const bundle = isRecord(dsh) ? dsh.bundle : void 0;
	const patch = isRecord(bundle) ? bundle.patch : void 0;
	if (typeof patch !== "string" || patch === "") throw new Error(`desktop project: ${requestedName}@${manifest.version} does not declare dsh.bundle.patch`);
	const packageDir = dirname(manifestPath);
	const patchPath = resolve(packageDir, patch);
	if (patchPath !== packageDir && !patchPath.startsWith(packageDir + sep) || !existsSync(patchPath)) throw new Error(`desktop project: ${requestedName}@${manifest.version} declares an invalid bundle patch`);
	return {
		name: requestedName,
		version: manifest.version,
		enabled: profilePluginNames(projectDir).includes(requestedName)
	};
}
/** Desktop npm project manager with direct writes and no rollback. */
var DesktopProjectManager = class {
	paths;
	runtime;
	lockDescriptor;
	descriptor;
	/**
	* @param paths - Electron-owned package state and reserved desktop profile paths.
	* @param runtime - absolute bundled Node.js and pnpm entry paths.
	*/
	constructor(paths, runtime) {
		this.paths = paths;
		this.runtime = runtime;
	}
	/** Read the active desktop plugin inventory. */
	listPlugins() {
		if (!existsSync(this.paths.profile)) return [];
		return pluginRecords(this.paths.profile);
	}
	/**
	* Reinitialize the profile, deleting configuration and third-party packages without a backup.
	* @param hooks - Stop the Host before resetting files; restart after preparation succeeds.
	* @returns Completion of reset; the held lock and shared product data are preserved.
	*/
	async resetConfiguration(hooks) {
		await this.withLock(async () => {
			await hooks.beforeChange();
			this.descriptor = this.readRuntime();
			for (const entry of readdirSync(this.paths.profile, { withFileTypes: true })) {
				const path = join(this.paths.profile, entry.name);
				if (path === this.paths.lock) continue;
				if (entry.isDirectory()) removeOwnedDirectory(path);
				else unlinkSync(path);
			}
			createPluginProfile(this.paths.profile);
			this.prepareProfile(this.paths.profile);
			await hooks.afterChange();
		});
	}
	/** Read the dsh version supplied by this application's verified resources. */
	dshVersion() {
		return this.currentRuntime().release.version;
	}
	/** Read the release most recently applied to the active profile. */
	releaseVersion() {
		const state = readDesktopProfileState(this.paths.profile);
		if (state === void 0) throw new Error("desktop project: active profile has no runtime state");
		return state.version;
	}
	/** Reject a profile whose dependency links were prepared for another runtime. */
	assertProfileRuntime(projectDir) {
		if (existsSync(this.pendingPackages)) throw new Error("desktop project: package preparation is incomplete; retry startup");
		if (readDesktopProfileState(projectDir)?.runtimeId !== desktopRuntimeId(this.currentRuntime())) throw new Error("desktop project: profile does not match this application runtime");
	}
	/** @returns Whether application resources support profile recovery. */
	canRecoverProfile() {
		return this.descriptor !== void 0 && existsSync(this.runtime.node) && existsSync(this.runtime.dsh);
	}
	get pendingPackages() {
		return join(this.paths.profile, "desktop-packages-pending");
	}
	currentRuntime() {
		if (this.descriptor === void 0) throw new Error("desktop project: runtime metadata has not been loaded");
		return this.descriptor;
	}
	readRuntime() {
		this.descriptor = void 0;
		return readDesktopRuntime(this.runtime.dsh);
	}
	prepareProfile(projectDir) {
		const runtime = this.currentRuntime();
		const resolutionMode = this.runtime.profileResolution ?? "link";
		if (resolutionMode === "runtime") recordDesktopRuntimeProfile(projectDir, runtime);
		else linkDesktopHostPackages(projectDir, this.runtime.dsh, runtime);
		validateDesktopPluginGraph(projectDir, this.runtime.dsh, runtime, profilePluginNames(projectDir), resolutionMode);
	}
	/** Read release metadata and reconcile its external profile without installing core packages. */
	async applyRelease() {
		return this.withLock(async () => {
			const target = this.readRuntime();
			this.descriptor = target;
			const previous = readDesktopProfileState(this.paths.profile);
			if (!existsSync(this.pendingPackages) && previous?.runtimeId === desktopRuntimeId(target) && previous.lockHash === desktopPluginLockHash(this.paths.profile) && (this.runtime.profileResolution === "runtime" || previous.links.length === target.sharedPackages.length && previous.links.every((link) => existsSync(link.target) && existsSync(join(this.paths.profile, "node_modules", link.name)) && realpathSync.native(link.target) === realpathSync.native(join(this.runtime.dsh, "node_modules", link.name))))) return false;
			if (previous === void 0) createPluginProfile(this.paths.profile);
			await this.reconcileProfile(this.paths.profile, previous);
			return true;
		});
	}
	/** Modify the current profile while its backend is stopped; failures retain partial changes. */
	async mutate(mutation, hooks) {
		await this.withLock(async () => {
			this.currentRuntime();
			if (!existsSync(this.paths.profile)) throw new Error("desktop project: active profile is not installed");
			await hooks.beforeChange();
			if (mutation.type === "plugins-disable-all") {
				const manifest = projectManifest(this.paths.profile);
				writeJson(join(this.paths.profile, "package.json"), {
					...manifest,
					dsh: {
						...manifest.dsh,
						profile: {
							...manifest.dsh.profile,
							bundles: [...DESKTOP_PROFILE_BUNDLES]
						}
					}
				});
				this.prepareProfile(this.paths.profile);
				await hooks.afterChange();
				return;
			}
			const previous = readDesktopProfileState(this.paths.profile);
			const packagesChanged = mutation.type !== "plugin-toggle";
			if (packagesChanged && this.runtime.profileResolution !== "runtime") unlinkDesktopHostPackages(this.paths.profile);
			try {
				await this.applyMutation(this.paths.profile, mutation);
			} finally {
				if (packagesChanged) {
					const runtime = this.currentRuntime();
					if (this.runtime.profileResolution === "runtime") recordDesktopRuntimeProfile(this.paths.profile, runtime);
					else linkDesktopHostPackages(this.paths.profile, this.runtime.dsh, runtime);
				}
			}
			await this.reconcileProfile(this.paths.profile, previous, packagesChanged);
			await hooks.afterChange();
		});
	}
	async reconcileProfile(projectDir, previous, packagesChanged = false) {
		const target = this.currentRuntime();
		const rebuild = !packagesChanged && existsSync(this.pendingPackages) || previous !== void 0 && pluginRecords(projectDir).length > 0 && (previous.nodeVersion !== target.release.nodeVersion || previous.platform !== target.platform || previous.arch !== target.arch);
		if (rebuild) {
			writeFileSync(this.pendingPackages, "");
			if (this.runtime.profileResolution !== "runtime") unlinkDesktopHostPackages(projectDir);
			removeOwnedDirectory(join(projectDir, "node_modules"));
			await this.runPnpm(projectDir, [
				"install",
				"--frozen-lockfile",
				"--ignore-scripts"
			]);
		}
		if (rebuild || packagesChanged) await this.finishPackageOperation(projectDir);
		else this.prepareProfile(projectDir);
	}
	async finishPackageOperation(projectDir) {
		this.prepareProfile(projectDir);
		await this.runPnpm(projectDir, ["rebuild", "--pending"]);
		this.prepareProfile(projectDir);
		unlinkSync(this.pendingPackages);
	}
	async applyMutation(projectDir, mutation) {
		switch (mutation.type) {
			case "plugin-add": {
				const requestedName = packageNameFromSpec(mutation.spec);
				if (this.currentRuntime().sharedPackages.some((entry) => entry.name === requestedName)) throw new Error(`desktop project: cannot install host-owned package ${requestedName}`);
				await this.runPnpm(projectDir, [
					"add",
					mutation.spec,
					"--save-exact",
					"--ignore-scripts"
				]);
				const installed = {
					...inspectPlugin(projectDir, requestedName),
					enabled: true
				};
				writeProfilePlugins(projectDir, [...pluginRecords(projectDir).filter((plugin) => plugin.name !== installed.name), installed].sort((left, right) => left.name.localeCompare(right.name)));
				return;
			}
			case "plugin-remove": {
				assertPackageName(mutation.name);
				if (!Object.hasOwn(projectManifest(projectDir).dependencies, mutation.name)) throw new Error(`desktop project: plugin ${JSON.stringify(mutation.name)} is not installed`);
				const remaining = pluginRecords(projectDir).filter((plugin) => plugin.name !== mutation.name);
				await this.runPnpm(projectDir, [
					"remove",
					mutation.name,
					"--config.ignore-scripts=true"
				]);
				writeProfilePlugins(projectDir, remaining);
				return;
			}
			case "plugin-update":
				assertPackageName(mutation.name);
				assertVersion(mutation.version);
				if (!Object.hasOwn(projectManifest(projectDir).dependencies, mutation.name)) throw new Error(`desktop project: plugin ${JSON.stringify(mutation.name)} is not installed`);
				await this.runPnpm(projectDir, [
					"add",
					`${mutation.name}@${mutation.version}`,
					"--save-exact",
					"--ignore-scripts"
				]);
				{
					const installed = inspectPlugin(projectDir, mutation.name);
					writeProfilePlugins(projectDir, pluginRecords(projectDir).map((plugin) => plugin.name === installed.name ? installed : plugin));
				}
				return;
			case "plugin-toggle": {
				assertPackageName(mutation.name);
				const plugins = pluginRecords(projectDir);
				if (!plugins.some((plugin) => plugin.name === mutation.name)) throw new Error(`desktop project: plugin ${mutation.name} is not installed`);
				writeProfilePlugins(projectDir, plugins.map((plugin) => plugin.name === mutation.name ? {
					...plugin,
					enabled: mutation.enabled
				} : plugin));
				return;
			}
			default:
		}
	}
	async runPnpm(projectDir, args) {
		const [command, ...commandArgs] = args;
		if (command === void 0) throw new Error("desktop project: pnpm command is required");
		for (const path of [
			this.paths.root,
			this.paths.pnpm.store,
			this.paths.pnpm.cache,
			this.paths.pnpm.state,
			this.paths.pnpm.config,
			this.paths.pnpm.home
		]) mkdirSync(path, {
			recursive: true,
			mode: 448
		});
		const npmrc = join(this.paths.pnpm.config, "npmrc");
		if (!existsSync(npmrc)) writeFileSync(npmrc, "", { mode: 384 });
		const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== "NODE_OPTIONS" && name !== "NODE_PATH" && !/^DSH_DESKTOP_/u.test(name) && !/^(?:npm|pnpm|corepack)_/iu.test(name)));
		writeFileSync(this.pendingPackages, "");
		await new Promise((settle, reject) => {
			const child = spawn(this.runtime.node, [
				this.runtime.pnpm,
				`--config.registry=${DESKTOP_REGISTRY}`,
				`--config.store-dir=${this.paths.pnpm.store}`,
				"--config.enable-global-virtual-store=false",
				`--config.userconfig=${npmrc}`,
				command,
				...commandArgs
			], {
				cwd: projectDir,
				env: {
					...inherited,
					COREPACK_HOME: this.paths.pnpm.home,
					NPM_CONFIG_REGISTRY: DESKTOP_REGISTRY,
					NPM_CONFIG_STORE_DIR: this.paths.pnpm.store,
					NPM_CONFIG_USERCONFIG: npmrc,
					PATH: `${dirname(this.runtime.node)}${delimiter}${process.env.PATH ?? ""}`,
					PNPM_HOME: this.paths.pnpm.home,
					XDG_CACHE_HOME: this.paths.pnpm.cache,
					XDG_CONFIG_HOME: this.paths.pnpm.config,
					XDG_STATE_HOME: this.paths.pnpm.state
				},
				stdio: [
					"ignore",
					"pipe",
					"pipe"
				]
			});
			let failure;
			let diagnostics = "";
			let completed = false;
			const appendDiagnostics = (chunk) => {
				diagnostics = (diagnostics + chunk).slice(-65536);
			};
			child.stdout.setEncoding("utf8");
			child.stdout.on("data", appendDiagnostics);
			child.stderr.setEncoding("utf8");
			child.stderr.on("data", appendDiagnostics);
			const complete = (settleChild) => {
				if (completed) return;
				completed = true;
				try {
					this.writeLockOwner(process.pid);
				} catch (error) {
					reject(errorOf$1(error, "desktop project: failed to return the package transaction lock to Electron"));
					return;
				}
				settleChild();
			};
			child.once("error", (error) => {
				failure = error;
			});
			child.once("close", (code, signal) => {
				complete(() => {
					if (failure !== void 0) {
						reject(failure);
						return;
					}
					if (code === 0) {
						settle();
						return;
					}
					reject(/* @__PURE__ */ new Error(`desktop project: pnpm exited with ${String(code ?? signal)}${diagnostics.trim() === "" ? "" : `: ${diagnostics.trim()}`}`));
				});
			});
			try {
				if (child.pid === void 0) throw new Error("desktop project: pnpm did not report a process id");
				this.writeLockOwner(child.pid);
			} catch (error) {
				failure = errorOf$1(error, "desktop project: failed to assign the package transaction lock to pnpm");
				child.kill("SIGKILL");
			}
		});
	}
	writeLockOwner(pid) {
		const descriptor = this.lockDescriptor;
		if (descriptor === void 0) throw new Error("desktop project: package transaction lost its lock");
		const content = Buffer.from(`${String(pid)}\n`);
		ftruncateSync(descriptor, 0);
		writeSync(descriptor, content, 0, content.byteLength, 0);
		fsyncSync(descriptor);
	}
	async withLock(operation) {
		mkdirSync(this.paths.profile, {
			recursive: true,
			mode: 448
		});
		if (lstatSync(this.paths.profile).isSymbolicLink()) throw new Error("desktop project: profile directory must not be a link");
		let descriptor;
		try {
			descriptor = openSync(this.paths.lock, "wx", 384);
		} catch (error) {
			if (error.code === "EEXIST") {
				const lock = lstatSync(this.paths.lock);
				if (lock.isSymbolicLink() || !lock.isFile()) throw new Error("desktop project: package transaction lock is not a regular file");
				const owner = Number.parseInt(readFileSync(this.paths.lock, "utf8").trim(), 10);
				let active = !Number.isSafeInteger(owner) || owner <= 0;
				if (!active) try {
					process.kill(owner, 0);
					active = true;
				} catch (signalError) {
					active = signalError.code !== "ESRCH";
				}
				if (active) throw new Error("desktop project: another package transaction is active");
				unlinkSync(this.paths.lock);
				descriptor = openSync(this.paths.lock, "wx", 384);
			} else throw error;
		}
		try {
			this.lockDescriptor = descriptor;
			this.writeLockOwner(process.pid);
			return await operation();
		} finally {
			this.lockDescriptor = void 0;
			closeSync(descriptor);
			unlinkSync(this.paths.lock);
		}
	}
};
/** Create the first external plugin profile without running a package manager. */
function createPluginProfile(projectDir) {
	mkdirSync(projectDir, {
		recursive: true,
		mode: 448
	});
	writeJson(join(projectDir, "package.json"), {
		name: PROJECT_NAME,
		private: true,
		version: "0.0.0",
		dependencies: {},
		dsh: { profile: { bundles: [...DESKTOP_PROFILE_BUNDLES] } }
	});
	writeFileSync(join(projectDir, "pnpm-workspace.yaml"), workspaceFile(), { mode: 384 });
}
//#endregion
//#region lib/types/host-process.js
/** Node-compatible child lifecycle and streaming custom-protocol carrier. */
function isDesktopHostEvent(message) {
	if (typeof message !== "object" || message === null || !("type" in message)) return false;
	const candidate = message;
	switch (candidate.type) {
		case "ready": return candidate.protocolVersion === 3 && typeof candidate.dshVersion === "string";
		case "fatal": return typeof candidate.message === "string";
		default: return false;
	}
}
function errorOf(reason, fallback) {
	return reason instanceof Error ? reason : new Error(fallback);
}
async function exitsWithin(exit, milliseconds) {
	let timer;
	const timeout = new Promise((resolve) => {
		timer = setTimeout(() => {
			resolve(false);
		}, milliseconds);
		timer.unref();
	});
	try {
		return await Promise.race([exit.then(() => true), timeout]);
	} finally {
		if (timer !== void 0) clearTimeout(timer);
	}
}
/** One dsh backend running under an owned Node-compatible executable. */
var DesktopHostProcess = class {
	executable;
	runtimeDir;
	projectDir;
	inspectPort;
	environment;
	onFailure;
	child;
	requestPipe;
	responsePipe;
	responseDecoder = new DesktopHostResponseDecoder();
	requestWriteTail = Promise.resolve();
	nextStreamId = 1;
	pending = /* @__PURE__ */ new Map();
	blockedResponses = /* @__PURE__ */ new Set();
	readyResolve;
	readyReject;
	readyPromise = new Promise((resolve, reject) => {
		this.readyResolve = resolve;
		this.readyReject = reject;
	});
	exitPromise;
	stderr = "";
	failureReported = false;
	/**
	* @param executable - absolute upstream Node.js or Electron executable.
	* @param runtimeDir - immutable packages carried by the current application.
	* @param projectDir - active or staged desktop plugin profile.
	* @param inspectPort - optional loopback inspector port for workspace development.
	* @param environment - Child environment; runtime and package-manager overrides are removed.
	* @param onFailure - Receives the first fatal child or transport failure, including after readiness.
	*/
	constructor(executable, runtimeDir, projectDir, inspectPort, environment = process.env, onFailure) {
		this.executable = executable;
		this.runtimeDir = runtimeDir;
		this.projectDir = projectDir;
		this.inspectPort = inspectPort;
		this.environment = environment;
		this.onFailure = onFailure;
	}
	/** Start the child once and resolve only after its complete composition is active. */
	async start() {
		if (this.child !== void 0) return this.readyPromise;
		const entry = join(this.runtimeDir, "node_modules", "@deepseek-ai", "dsh-desktop-host", "lib", "index.js");
		const child = spawn(this.executable, [
			...this.inspectPort === void 0 ? [] : [`--inspect=127.0.0.1:${String(this.inspectPort)}`],
			entry,
			this.runtimeDir,
			this.projectDir,
			...this.inspectPort === void 0 ? [] : ["--allow-linked-profile"]
		], {
			cwd: this.projectDir,
			env: {
				...Object.fromEntries(Object.entries(this.environment).filter(([name]) => name !== "NODE_OPTIONS" && name !== "NODE_PATH" && !/^DSH_DESKTOP_/u.test(name) && !/^(?:npm|pnpm|corepack)_/iu.test(name))),
				ELECTRON_RUN_AS_NODE: "1"
			},
			stdio: [
				"ignore",
				"pipe",
				"pipe",
				"pipe",
				"pipe",
				"ipc"
			]
		});
		const requestPipe = child.stdio[3];
		const responsePipe = child.stdio[4];
		if (!(requestPipe instanceof Writable) || !(responsePipe instanceof Readable)) {
			child.kill("SIGTERM");
			throw new Error("dsh desktop host did not expose the required byte pipes and IPC channel");
		}
		this.child = child;
		this.requestPipe = requestPipe;
		this.responsePipe = responsePipe;
		child.stderr?.setEncoding("utf8");
		child.stderr?.on("data", (chunk) => {
			this.stderr += chunk;
		});
		child.stdout?.pipe(process.stdout);
		responsePipe.on("data", (chunk) => {
			this.acceptResponseBytes(chunk);
		});
		responsePipe.once("end", () => {
			try {
				this.responseDecoder.finish();
				this.fail(/* @__PURE__ */ new Error("dsh desktop host response pipe ended"));
			} catch (error) {
				this.fail(errorOf(error, "dsh desktop host response pipe failed"));
			}
		});
		requestPipe.once("error", (error) => {
			this.fail(error);
		});
		responsePipe.once("error", (error) => {
			this.fail(error);
		});
		child.on("message", (message) => {
			if (!isDesktopHostEvent(message)) {
				this.fail(/* @__PURE__ */ new Error("dsh desktop host sent an invalid IPC event"));
				child.kill("SIGTERM");
				return;
			}
			this.handleMessage(message);
		});
		child.once("error", (error) => {
			this.fail(error);
		});
		this.exitPromise = new Promise((resolve) => {
			child.once("close", (code) => {
				const suffix = this.stderr.trim() === "" ? "" : `: ${this.stderr.trim()}`;
				if (code !== 0 && code !== null) this.fail(/* @__PURE__ */ new Error(`dsh desktop host exited with ${String(code)}${suffix}`));
				else this.fail(/* @__PURE__ */ new Error(`dsh desktop host stopped${suffix}`));
				resolve();
			});
		});
		return this.readyPromise;
	}
	/** Forward one `dsh-app://app` request to the child without buffering its body. */
	async fetch(request) {
		await this.start();
		const child = this.child;
		if (child === void 0 || !child.connected || this.requestPipe === void 0) throw new Error("dsh desktop host is unavailable");
		if (this.nextStreamId > 4294967295) throw new Error("dsh desktop host exhausted its request stream ids");
		const streamId = this.nextStreamId++;
		const method = request.method.toUpperCase();
		const hasBody = method !== "GET" && method !== "HEAD" && request.body !== null;
		return new Promise((resolve, reject) => {
			const pending = {
				resolve,
				reject,
				responseStarted: false,
				uploadOpen: hasBody
			};
			const abort = () => {
				if (!this.pending.has(streamId)) return;
				const error = errorOf(request.signal.reason, "request aborted");
				pending.uploadOpen = false;
				pending.requestReader?.cancel(error).catch(() => void 0);
				this.enqueueRequestFrame(encodeDesktopRequestCancel(streamId)).catch((pipeError) => {
					this.fail(errorOf(pipeError, "dsh desktop request pipe failed"));
				});
				if (pending.controller === void 0) pending.reject(error);
				else pending.controller.error(error);
				this.finishPending(streamId, false);
			};
			if (request.signal.aborted) {
				reject(errorOf(request.signal.reason, "request aborted"));
				return;
			}
			request.signal.addEventListener("abort", abort, { once: true });
			pending.removeAbort = () => {
				request.signal.removeEventListener("abort", abort);
			};
			this.pending.set(streamId, pending);
			this.pumpRequest(streamId, request, hasBody).catch((error) => {
				this.failPending(streamId, errorOf(error, "dsh desktop request upload failed"));
			});
		});
	}
	/** Request graceful teardown, then wait for child exit. */
	async stop() {
		const child = this.child;
		if (child === void 0) return;
		this.blockedResponses.clear();
		this.responsePipe?.resume();
		if (child.connected) this.send({ type: "shutdown" });
		this.requestPipe?.destroy();
		const exited = this.exitPromise ?? Promise.resolve();
		if (!await exitsWithin(exited, 1e4)) child.kill("SIGTERM");
		if (!await exitsWithin(exited, 5e3)) {
			child.kill("SIGKILL");
			if (!await exitsWithin(exited, 5e3)) throw new Error("dsh desktop host did not exit after SIGKILL");
		}
		this.child = void 0;
		this.requestPipe = void 0;
		this.responsePipe = void 0;
	}
	async pumpRequest(streamId, request, hasBody) {
		await this.enqueueRequestFrame(encodeDesktopRequestStart(streamId, {
			url: request.url,
			method: request.method.toUpperCase(),
			headers: [...request.headers.entries()],
			hasBody
		}));
		if (!hasBody) return;
		const body = request.body;
		if (body === null) throw new Error("dsh desktop request body disappeared before upload");
		const reader = body.getReader();
		const pending = this.pending.get(streamId);
		if (pending === void 0) {
			await reader.cancel();
			return;
		}
		pending.requestReader = reader;
		try {
			for (;;) {
				const next = await reader.read();
				if (next.done) break;
				for (let offset = 0; offset < next.value.byteLength; offset += DESKTOP_PIPE_CHUNK_BYTES) {
					if (!this.pending.has(streamId)) return;
					await this.enqueueRequestFrame(encodeDesktopRequestData(streamId, next.value.subarray(offset, offset + DESKTOP_PIPE_CHUNK_BYTES)));
				}
			}
			const live = this.pending.get(streamId);
			if (live !== void 0) {
				await this.enqueueRequestFrame(encodeDesktopRequestEnd(streamId));
				live.uploadOpen = false;
			}
		} finally {
			reader.releaseLock();
			const live = this.pending.get(streamId);
			if (live?.requestReader === reader) delete live.requestReader;
		}
	}
	enqueueRequestFrame(frame) {
		const write = this.requestWriteTail.then(async () => {
			const pipe = this.requestPipe;
			if (pipe === void 0 || pipe.destroyed) throw new Error("dsh desktop host request pipe is unavailable");
			if (!pipe.write(frame)) await once(pipe, "drain");
		});
		this.requestWriteTail = write.catch(() => void 0);
		return write;
	}
	send(message) {
		const child = this.child;
		if (child === void 0 || !child.connected) throw new Error("dsh desktop host IPC is unavailable");
		child.send(message, (error) => {
			if (error !== null) this.fail(error);
		});
	}
	acceptResponseBytes(chunk) {
		try {
			for (const frame of this.responseDecoder.push(chunk)) this.handleResponseFrame(frame);
		} catch (error) {
			this.fail(errorOf(error, "dsh desktop host response pipe failed"));
			this.child?.kill("SIGTERM");
		}
	}
	handleResponseFrame(frame) {
		const pending = this.pending.get(frame.streamId);
		if (pending === void 0) {
			if (frame.streamId >= this.nextStreamId) throw new Error(`dsh desktop host responded for unknown stream ${String(frame.streamId)}`);
			return;
		}
		switch (frame.type) {
			case "start": {
				if (pending.responseStarted) throw new Error(`dsh desktop host started stream ${String(frame.streamId)} twice`);
				pending.responseStarted = true;
				let body = null;
				if (frame.hasBody) body = new ReadableStream({
					start: (controller) => {
						pending.controller = controller;
					},
					pull: () => {
						this.blockedResponses.delete(frame.streamId);
						this.resumeResponsePipe();
					},
					cancel: (reason) => {
						this.cancelResponse(frame.streamId, reason);
					}
				});
				pending.resolve(new Response(body, {
					status: frame.status,
					headers: new Headers(frame.headers.map(([name, value]) => [name, value]))
				}));
				return;
			}
			case "data": {
				const controller = pending.controller;
				if (!pending.responseStarted || controller === void 0) throw new Error(`dsh desktop host sent body data before a body start for stream ${String(frame.streamId)}`);
				controller.enqueue(frame.data);
				if ((controller.desiredSize ?? 0) <= 0) {
					this.blockedResponses.add(frame.streamId);
					this.responsePipe?.pause();
				}
				return;
			}
			case "end":
				if (!pending.responseStarted) throw new Error(`dsh desktop host ended stream ${String(frame.streamId)} before its response start`);
				pending.controller?.close();
				this.finishPending(frame.streamId, true);
				return;
			case "error":
				this.failPending(frame.streamId, new Error(frame.message));
				return;
			default:
		}
	}
	cancelResponse(streamId, reason) {
		const pending = this.pending.get(streamId);
		if (pending === void 0) return;
		pending.uploadOpen = false;
		pending.requestReader?.cancel(reason).catch(() => void 0);
		this.enqueueRequestFrame(encodeDesktopRequestCancel(streamId)).catch((error) => {
			this.fail(errorOf(error, "dsh desktop request pipe failed"));
		});
		this.finishPending(streamId, false);
	}
	failPending(streamId, error) {
		const pending = this.pending.get(streamId);
		if (pending === void 0) return;
		pending.uploadOpen = false;
		pending.requestReader?.cancel(error).catch(() => void 0);
		if (pending.controller === void 0) pending.reject(error);
		else pending.controller.error(error);
		this.enqueueRequestFrame(encodeDesktopRequestCancel(streamId)).catch((pipeError) => {
			this.fail(errorOf(pipeError, "dsh desktop request pipe failed"));
		});
		this.finishPending(streamId, false);
	}
	finishPending(streamId, cancelOpenUpload) {
		const pending = this.pending.get(streamId);
		if (pending === void 0) return;
		if (cancelOpenUpload && pending.uploadOpen) {
			pending.uploadOpen = false;
			pending.requestReader?.cancel().catch(() => void 0);
			this.enqueueRequestFrame(encodeDesktopRequestCancel(streamId)).catch((error) => {
				this.fail(errorOf(error, "dsh desktop request pipe failed"));
			});
		}
		pending.removeAbort?.();
		this.pending.delete(streamId);
		this.blockedResponses.delete(streamId);
		this.resumeResponsePipe();
	}
	resumeResponsePipe() {
		if (this.blockedResponses.size === 0) this.responsePipe?.resume();
	}
	handleMessage(message) {
		switch (message.type) {
			case "ready":
				this.readyResolve(message);
				return;
			case "fatal":
				this.fail(new Error(message.message));
				return;
			default:
		}
	}
	fail(error) {
		this.readyReject(error);
		if (!this.failureReported) {
			this.failureReported = true;
			try {
				this.onFailure?.(error);
			} catch (listenerError) {
				console.error("desktop host failure listener failed", listenerError);
			}
		}
		for (const pending of this.pending.values()) {
			pending.requestReader?.cancel(error).catch(() => void 0);
			if (pending.controller === void 0) pending.reject(error);
			else pending.controller.error(error);
			pending.removeAbort?.();
		}
		this.pending.clear();
		this.blockedResponses.clear();
		this.responsePipe?.resume();
	}
};
//#endregion
//#region lib/types/startup-error.js
/** Serializable Desktop failure diagnostics. */
/**
* Preserve nested diagnostics when sending failures to a renderer.
* @param error - Startup or runtime failure.
* @returns Serializable error state.
*/
function desktopErrorState(error) {
	return {
		phase: "error",
		message: error instanceof AggregateError ? [error.message, ...error.errors.map((item) => desktopErrorState(item).message)].join("\n") : error instanceof Error ? error.message : String(error)
	};
}
//#endregion
//#region lib/types/backend-controller.js
/** Owns one backend startup and its quiescent teardown independently of windows. */
/** Serializes retries and prevents children from outliving a closed window. */
var DesktopBackendController = class {
	createHost;
	publish;
	current = { phase: "starting" };
	attempt;
	pending;
	stopping;
	closed = false;
	/**
	* @param createHost - Allocate a child and route its fatal failures to the supplied callback.
	* @param publish - Receive availability changes until the controller closes.
	*/
	constructor(createHost, publish) {
		this.createHost = createHost;
		this.publish = publish;
	}
	/** Current availability, including the last startup or child failure. */
	get state() {
		return this.current;
	}
	/** Child available to application requests; absent during startup and teardown. */
	get host() {
		return !this.closed && !this.attempt?.cancelled && this.current.phase === "ready" ? this.attempt?.host : void 0;
	}
	/**
	* Prepare the profile and start one child; concurrent callers share the attempt.
	* @param prepare - Profile preparation that must finish before spawning.
	* @returns Completion of startup, rejecting on preparation, startup, or cleanup failure.
	*/
	start(prepare) {
		if (this.closed) return Promise.reject(/* @__PURE__ */ new Error("desktop backend is closed"));
		if (this.stopping !== void 0) return Promise.reject(/* @__PURE__ */ new Error("desktop backend is stopping"));
		if (this.pending !== void 0) return this.pending;
		if (this.current.phase === "ready") return Promise.resolve();
		const previous = this.attempt;
		const attempt = {
			cancelled: false,
			...previous?.cleanup === void 0 ? {} : { cleanup: previous.cleanup }
		};
		this.attempt = attempt;
		this.update({ phase: "starting" });
		const pending = Promise.resolve().then(async () => {
			try {
				await previous?.cleanup;
				delete attempt.cleanup;
				if (attempt.cancelled) return;
				await prepare();
				if (attempt.cancelled) return;
				const host = this.createHost((error) => {
					this.failed(attempt, error);
				});
				attempt.host = host;
				await host.start();
				if (attempt.failure !== void 0) throw attempt.failure;
				if (!attempt.cancelled) this.update({ phase: "ready" });
			} catch (error) {
				const cancelled = attempt.cancelled;
				attempt.cancelled = true;
				let failure = error;
				try {
					await this.cleanup(attempt);
				} catch (cleanupError) {
					if (cleanupError !== error) failure = new AggregateError([error, cleanupError], "desktop backend startup and cleanup failed");
				}
				if (!cancelled) this.update(desktopErrorState(failure));
				throw failure;
			}
		}).finally(() => {
			if (this.pending === pending) this.pending = void 0;
		});
		this.pending = pending;
		return pending;
	}
	/**
	* Stop pending preparation and the child before allowing another start.
	* @returns Completion of pending work and child exit; rejects if cleanup fails.
	*/
	stop() {
		if (this.stopping !== void 0) return this.stopping;
		const attempt = this.attempt;
		if (attempt !== void 0) attempt.cancelled = true;
		if (!this.closed) this.update({ phase: "starting" });
		const pending = this.pending;
		const stopping = Promise.allSettled([attempt === void 0 ? Promise.resolve() : this.cleanup(attempt), pending]).then((results) => {
			const cleanup = results[0];
			if (cleanup.status === "rejected") throw cleanup.reason;
			if (this.attempt === attempt) this.attempt = void 0;
		}).finally(() => {
			if (this.stopping === stopping) this.stopping = void 0;
		});
		this.stopping = stopping;
		return stopping;
	}
	/**
	* Permanently prevent startup and suppress further availability notifications.
	* @returns Completion of pending work and child exit; rejects if cleanup fails.
	*/
	close() {
		this.closed = true;
		return this.stop();
	}
	cleanup(attempt) {
		if (attempt.cleanup === void 0) attempt.cleanup = Promise.resolve().then(async () => {
			await attempt.host?.stop();
		});
		return attempt.cleanup;
	}
	failed(attempt, error) {
		if (this.attempt !== attempt || attempt.cancelled) return;
		attempt.failure = error;
		if (this.current.phase !== "ready") return;
		attempt.cancelled = true;
		const cleanup = this.cleanup(attempt);
		this.update(desktopErrorState(error));
		cleanup.catch((cleanupError) => {
			if (this.attempt === attempt) this.update(desktopErrorState(new AggregateError([error, cleanupError], "Desktop backend failed and could not stop")));
		});
	}
	update(state) {
		if (this.closed) return;
		this.current = state;
		try {
			this.publish(state);
		} catch (error) {
			console.error("desktop backend state listener failed", error);
		}
	}
};
//#endregion
//#region lib/types/ipc.js
/** Typed preload operations exposed only by the Electron shell. */
/** IPC channel names kept private to the desktop application bundle. */
const DESKTOP_IPC = {
	localeGet: "dsh-desktop:locale-get",
	pluginsList: "dsh-desktop:plugins-list",
	pluginsAdd: "dsh-desktop:plugins-add",
	pluginsRemove: "dsh-desktop:plugins-remove",
	pluginsUpdate: "dsh-desktop:plugins-update",
	pluginsToggle: "dsh-desktop:plugins-toggle",
	pluginsDisableAll: "dsh-desktop:plugins-disable-all",
	backendStatus: "dsh-desktop:backend-status",
	backendRetry: "dsh-desktop:backend-retry",
	applicationRestart: "dsh-desktop:application-restart",
	configurationReset: "dsh-desktop:configuration-reset",
	backendState: "dsh-desktop:backend-state",
	updatesCheck: "dsh-desktop:updates-check",
	updatesInstall: "dsh-desktop:updates-install",
	updatesState: "dsh-desktop:updates-state"
};
//#endregion
//#region lib/types/locale.js
/** Typed English and Chinese copy owned by the Electron shell. */
const en = {
	application: "Application",
	startupFailed: "DeepSeek Harness could not start",
	startupLoading: "Starting DeepSeek Harness…",
	startupLoadingDescription: "Your workspace will open when it is ready.",
	startupErrorDescription: "Choose a recovery action below. Disabling third-party plugins retains their files.",
	startupReinstallAdvice: "If application files are missing or damaged, close the application and reinstall it. Your tasks are stored separately.",
	startupConfigurationAdvice: "Reset Desktop deletes all Desktop profile configuration and third-party plugins without a backup, then starts a fresh profile. Shared tasks and settings are retained.",
	restartApplication: "Close and restart",
	resetConfiguration: "Reset Desktop and retry",
	disableThirdPartyPlugins: "Disable all third-party plugins and retry",
	pluginsMenu: "Desktop Plugins…",
	pluginsMenuPackagedOnly: "Desktop Plugins… (available in packaged applications)",
	checkUpdatesMenu: "Check for Updates…",
	updateCheckFailedTitle: "Update Check Failed",
	unknownError: "Unknown error",
	updateCheckTitle: "Check for Updates",
	updateCurrent: "You already have the latest version.",
	updateTitle: "DeepSeek Harness Update",
	updateAvailable: "An update is available",
	updateDetail: "DeepSeek Harness {version}\n\nThis release includes its matching dsh version. The application will restart after installation.",
	installAndRestart: "Install and Restart",
	later: "Later",
	updateFailedTitle: "Update Failed",
	pluginManagerTitle: "Desktop Plugins",
	pluginWindowTitle: "DeepSeek Harness — Desktop Plugins",
	pluginManagerDescription: "Plugins are installed only in the Desktop node_modules and are managed by the bundled pnpm.",
	refresh: "Refresh",
	enable: "Enable",
	disable: "Disable",
	disabled: "Disabled",
	retry: "Retry startup",
	disableAll: "Disable all plugins and retry",
	recoveryDescription: "The backend could not start. Update or disable incompatible plugins, then retry. Installed plugins and configuration are retained.",
	changingActivation: "Changing plugin activation…",
	npmPackage: "npm package",
	install: "Install",
	installed: "Installed",
	noPlugins: "No Desktop plugins are installed.",
	remove: "Remove",
	update: "Update",
	targetVersion: "Enter the target version for {name}",
	removing: "Removing {name}…",
	updating: "Updating {name}…",
	installing: "Installing {spec}…",
	operationComplete: "Done. The Desktop backend has restarted.",
	refreshing: "Refreshing…",
	refreshed: "Plugin list refreshed.",
	loadingPlugins: "Reading Desktop plugins…"
};
const zh = {
	application: "应用",
	startupFailed: "DeepSeek Harness 无法启动",
	startupLoading: "正在启动 DeepSeek Harness…",
	startupLoadingDescription: "准备就绪后将自动打开工作区。",
	startupErrorDescription: "请选择下方的恢复操作。禁用第三方插件会保留插件文件。",
	startupReinstallAdvice: "如果应用文件缺失或损坏，请关闭应用并重新安装。任务数据存储在独立位置。",
	startupConfigurationAdvice: "重置 Desktop 会删除桌面端的全部 profile 配置和第三方插件，不保留备份，然后重新初始化并启动。共享任务和设置会保留。",
	restartApplication: "关闭并重启",
	resetConfiguration: "重置 Desktop 并重试",
	disableThirdPartyPlugins: "禁用全部第三方插件并重试",
	pluginsMenu: "桌面插件…",
	pluginsMenuPackagedOnly: "桌面插件…（打包应用中可用）",
	checkUpdatesMenu: "检查更新…",
	updateCheckFailedTitle: "更新检查失败",
	unknownError: "未知错误",
	updateCheckTitle: "检查更新",
	updateCurrent: "当前已是最新版本。",
	updateTitle: "DeepSeek Harness 更新",
	updateAvailable: "发现可用更新",
	updateDetail: "DeepSeek Harness {version}\n\n新版本绑定匹配的 dsh，安装后将重新启动。",
	installAndRestart: "安装并重启",
	later: "稍后",
	updateFailedTitle: "更新失败",
	pluginManagerTitle: "桌面插件",
	pluginWindowTitle: "DeepSeek Harness — 桌面插件",
	pluginManagerDescription: "插件只安装到桌面端自己的 node_modules，并由内置 pnpm 管理。",
	refresh: "刷新",
	enable: "启用",
	disable: "禁用",
	disabled: "已禁用",
	retry: "重试启动",
	disableAll: "禁用全部插件并重试",
	recoveryDescription: "后端无法启动。请更新或禁用不兼容插件，然后重试。已安装插件和配置会保留。",
	changingActivation: "正在更改插件启用状态…",
	npmPackage: "npm 包",
	install: "安装",
	installed: "已安装",
	noPlugins: "还没有安装桌面插件。",
	remove: "移除",
	update: "更新",
	targetVersion: "输入 {name} 的目标版本",
	removing: "正在移除 {name}…",
	updating: "正在更新 {name}…",
	installing: "正在安装 {spec}…",
	operationComplete: "操作完成，桌面后端已重新启动。",
	refreshing: "正在刷新…",
	refreshed: "插件列表已刷新。",
	loadingPlugins: "正在读取桌面插件…"
};
/** Resolve Electron's locale to one shipped Desktop dictionary. */
function resolveDesktopLocale(locale) {
	return locale.toLowerCase().startsWith("zh") ? {
		id: "zh-CN",
		messages: zh
	} : {
		id: "en",
		messages: en
	};
}
/** Replace named placeholders in one locale-owned message. */
function formatDesktopMessage(message, values) {
	return message.replaceAll(/\{([^{}]+)\}/gu, (placeholder, key) => values[key] ?? placeholder);
}
//#endregion
//#region lib/types/single-instance.js
/** Electron single-instance ownership before any Desktop profile lifecycle begins. */
/**
* Claim the process-lifetime Desktop lock and route later launches to the owner.
* @param application - Electron application singleton.
* @param focusOwner - focus or recreate the primary window after a later launch.
* @returns true only in the process that may access the Desktop profile.
*/
function claimDesktopSingleInstance(application, focusOwner) {
	if (!application.requestSingleInstanceLock()) {
		application.quit();
		return false;
	}
	application.on("second-instance", focusOwner);
	return true;
}
//#endregion
//#region lib/types/update-coordinator.js
/** One Electron release stream for the version-bound shell and bundled dsh runtime. */
const { autoUpdater } = electronUpdater;
/** Checks, downloads, and installs one complete Desktop release. */
var DesktopUpdateCoordinator = class {
	publish;
	beforeRestart;
	updater;
	enabled;
	availableVersion;
	checkOperation;
	installOperation;
	/**
	* @param publish - state sink for every desktop window.
	* @param beforeRestart - stop application-owned processes before replacement.
	* @param updater - Electron artifact updater; replaceable for tests.
	* @param enabled - whether this packaged process carries updater configuration.
	*/
	constructor(publish, beforeRestart = async () => {}, updater = autoUpdater, enabled = () => app.isPackaged && existsSync(join(process.resourcesPath, "app-update.yml"))) {
		this.publish = publish;
		this.beforeRestart = beforeRestart;
		this.updater = updater;
		this.enabled = enabled;
		this.updater.autoDownload = false;
		this.updater.autoInstallOnAppQuit = false;
	}
	/** Check the configured Desktop release stream and retain an available version. */
	async check() {
		if (this.installOperation !== void 0) return this.installOperation;
		if (this.checkOperation !== void 0) return this.checkOperation;
		this.checkOperation = this.doCheck().finally(() => {
			this.checkOperation = void 0;
		});
		return this.checkOperation;
	}
	/** Wait for an in-flight check, then download and install its retained release. */
	async install() {
		if (this.installOperation !== void 0) return this.installOperation;
		this.installOperation = (async () => {
			await this.checkOperation;
			return this.doInstall();
		})().finally(() => {
			this.installOperation = void 0;
		});
		return this.installOperation;
	}
	async doCheck() {
		this.publish({ phase: "checking" });
		try {
			if (!this.enabled()) {
				this.availableVersion = void 0;
				return this.publish({ phase: "idle" });
			}
			const result = await this.updater.checkForUpdates();
			const version = result?.isUpdateAvailable === true ? result.updateInfo.version : void 0;
			this.availableVersion = version;
			return version === void 0 ? this.publish({ phase: "idle" }) : this.publish({
				phase: "available",
				version
			});
		} catch (error) {
			this.availableVersion = void 0;
			return this.publish({
				phase: "error",
				message: error instanceof Error ? error.message : String(error)
			});
		}
	}
	async doInstall() {
		const version = this.availableVersion;
		if (version === void 0) throw new Error("desktop update: no verified update is available");
		this.publish({
			phase: "installing",
			version
		});
		try {
			await this.updater.downloadUpdate();
			this.availableVersion = void 0;
			const ready = this.publish({
				phase: "ready",
				version
			});
			await this.beforeRestart();
			this.updater.quitAndInstall(false, true);
			return ready;
		} catch (error) {
			return this.publish({
				phase: "error",
				version,
				message: error instanceof Error ? error.message : String(error)
			});
		}
	}
};
//#endregion
//#region lib/types/startup-document.js
/** Self-contained recovery document for an unavailable shell renderer or preload. */
/**
* Render escaped diagnostics without depending on application resource files.
* @param locale - Shell-owned translations.
* @param message - Failure details displayed as plain text.
* @param profileRecovery - Whether the initialized application can repair its profile.
* @returns An HTML document suitable for an isolated emergency window.
*/
function startupFailureDocument(locale, message, profileRecovery = false) {
	const escape = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&#39;");
	return `<!doctype html><html lang="${locale.id}"><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action dsh-recovery:">
<title>${escape(locale.messages.startupFailed)}</title>
<style>:root{color-scheme:light dark;font-family:system-ui}body{max-width:720px;margin:10vh auto;padding:24px}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style>
<main><h1>${escape(locale.messages.startupFailed)}</h1><p>${escape(locale.messages.startupReinstallAdvice)}</p>
${profileRecovery ? `<p>${escape(locale.messages.startupConfigurationAdvice)}</p>` : ""}
<pre role="alert">${escape(message)}</pre>
<form action="dsh-recovery://restart"><button>${escape(locale.messages.restartApplication)}</button></form>
${profileRecovery ? `<form action="dsh-recovery://plugins"><button>${escape(locale.messages.disableThirdPartyPlugins)}</button></form>
<form action="dsh-recovery://reset"><button>${escape(locale.messages.resetConfiguration)}</button></form>` : ""}
</main></html>`;
}
//#endregion
//#region lib/types/main.js
/** Electron shell: desktop project ownership, custom protocol, windows, and lifecycle. */
const SCHEME = "dsh-app";
let focusPrimaryWindow = () => {};
let profileRecoveryAvailable = () => false;
const emergencyPages = /* @__PURE__ */ new WeakMap();
let recoverApplication = (action) => {
	if (action !== "restart") return Promise.reject(/* @__PURE__ */ new Error("Desktop recovery could not initialize; reinstall the application"));
	app.relaunch();
	app.quit();
	return Promise.resolve();
};
async function showEmergencyDocument(window, message) {
	const document = startupFailureDocument(resolveDesktopLocale(app.getLocale()), message, profileRecoveryAvailable());
	const url = `data:text/html;charset=utf-8,${encodeURIComponent(document)}`;
	emergencyPages.set(window, {
		url,
		message,
		busy: false
	});
	await window.loadURL(url);
}
protocol.registerSchemesAsPrivileged([{
	scheme: SCHEME,
	privileges: {
		standard: true,
		secure: true,
		supportFetchAPI: true,
		corsEnabled: false,
		stream: true,
		codeCache: true
	}
}]);
const MIME = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".svg": "image/svg+xml"
};
function runtimeResources() {
	const development = !app.isPackaged;
	return {
		node: development ? process.env.DSH_DESKTOP_NODE_BINARY ?? join(process.resourcesPath, "runtime", "node", process.platform === "win32" ? "node.exe" : "node") : process.execPath,
		pnpm: (development ? process.env.DSH_DESKTOP_PNPM_ENTRY : void 0) ?? join(process.resourcesPath, "runtime", "pnpm", "bin", "pnpm.mjs"),
		dsh: (development ? process.env.DSH_DESKTOP_DSH_DIR : void 0) ?? (development ? join(process.resourcesPath, "dsh") : join(app.getAppPath(), "dsh")),
		...development ? {} : { profileResolution: "runtime" }
	};
}
function developmentHostInspectPort(enabled) {
	const configured = process.env.DSH_DESKTOP_HOST_INSPECT_PORT;
	if (!enabled || configured === void 0 || configured === "") return void 0;
	const port = Number(configured);
	if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("dsh desktop: DSH_DESKTOP_HOST_INSPECT_PORT must be an integer from 1 through 65535");
	return port;
}
function createWindow(preload, show = false) {
	const window = new BrowserWindow({
		width: 1280,
		height: 840,
		minWidth: 880,
		minHeight: 600,
		show,
		webPreferences: {
			preload,
			nodeIntegration: false,
			contextIsolation: true,
			sandbox: true,
			webSecurity: true
		}
	});
	window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
	window.webContents.on("will-navigate", (event, url) => {
		if (new URL(url).protocol !== `${SCHEME}:`) event.preventDefault();
		const page = emergencyPages.get(window);
		if (page === void 0 || page.busy || window.webContents.getURL() !== page.url) return;
		const action = new URL(url);
		if (action.protocol !== "dsh-recovery:" || ![
			"restart",
			"plugins",
			"reset"
		].includes(action.hostname)) return;
		if (action.hostname !== "restart" && !profileRecoveryAvailable()) return;
		page.busy = true;
		recoverApplication(action.hostname).catch(async (error) => {
			if (!window.isDestroyed()) await showEmergencyDocument(window, `${page.message}\n${desktopErrorState(error).message}`);
		}).catch((error) => {
			console.error(error);
		}).finally(() => {
			page.busy = false;
		});
	});
	return window;
}
function assertDesktopSender(event, hostnames) {
	const senderFrame = event.senderFrame;
	if (senderFrame === null) throw new Error("dsh desktop: rejected IPC without a sender frame");
	const url = new URL(senderFrame.url);
	if (url.protocol !== `${SCHEME}:` || !hostnames.includes(url.hostname)) throw new Error("dsh desktop: rejected IPC from an unowned renderer");
}
async function serveShellAsset(request) {
	if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405 });
	const root = resolve(app.getAppPath(), "renderer");
	const url = new URL(request.url);
	let pathname;
	try {
		pathname = decodeURIComponent(url.pathname);
	} catch {
		return new Response(null, { status: 400 });
	}
	const target = resolve(normalize(join(root, pathname)));
	if (target !== root && !target.startsWith(root + sep)) return new Response(null, { status: 403 });
	try {
		const body = request.method === "HEAD" ? null : await readFile(target);
		return new Response(body, { headers: { "content-type": MIME[extname(target)] ?? "application/octet-stream" } });
	} catch {
		return new Response(null, { status: 404 });
	}
}
async function main() {
	const resources = runtimeResources();
	const paths = resolveDesktopPaths();
	const development = app.isPackaged ? void 0 : join(app.getAppPath(), ".desktop-build", "development", "project");
	const activeProject = development ?? paths.profile;
	const manager = new DesktopProjectManager(paths, resources);
	profileRecoveryAvailable = () => development === void 0 && manager.canRecoverProfile();
	let pageError;
	let quitting = false;
	let startup;
	let mainWindow;
	let pluginWindow;
	let shellInstallerOwnsQuit = false;
	let updateState = { phase: "idle" };
	const locale = resolveDesktopLocale(app.getLocale());
	const messages = locale.messages;
	const appPreload = fileURLToPath(new URL("./preload-app.cjs", import.meta.url));
	const managementPreload = fileURLToPath(new URL("./preload.cjs", import.meta.url));
	const startupUrl = `${SCHEME}://shell/startup.html`;
	const applicationUrl = `${SCHEME}://app/index.html`;
	let navigation;
	let emergencyDocument = false;
	const showEmergencyError = async (error) => {
		if (quitting || emergencyDocument) return;
		emergencyDocument = true;
		const diagnostic = desktopErrorState(error).message;
		pageError = {
			phase: "error",
			message: diagnostic
		};
		if (mainWindow !== void 0) await showEmergencyDocument(mainWindow, diagnostic);
	};
	const navigateMain = (url) => {
		const window = mainWindow;
		if (quitting || emergencyDocument || window === void 0 || window.isDestroyed()) return Promise.resolve();
		if (navigation?.window === window && navigation.url === url) return navigation.promise;
		const next = {
			window,
			url,
			promise: Promise.resolve()
		};
		next.promise = window.loadURL(url).catch((error) => {
			if (quitting || window.isDestroyed() || navigation !== next) return;
			navigation = void 0;
			throw error;
		});
		navigation = next;
		return next.promise;
	};
	const backendState = () => {
		const state = pageError ?? backend.state;
		return state.phase === "error" ? {
			...state,
			profileRecovery: profileRecoveryAvailable()
		} : state;
	};
	const publishBackend = (state) => {
		for (const window of BrowserWindow.getAllWindows()) window.webContents.send(DESKTOP_IPC.backendState, state);
	};
	const backend = new DesktopBackendController((onFailure) => {
		if (development === void 0) manager.assertProfileRuntime(activeProject);
		const hostInspectPort = developmentHostInspectPort(development !== void 0);
		const host = new DesktopHostProcess(resources.node, development ?? resources.dsh, activeProject, hostInspectPort, process.env, onFailure);
		return {
			start: () => host.start(),
			stop: () => host.stop(),
			fetch: (request) => host.fetch(request)
		};
	}, (state) => {
		if (state.phase === "starting" && !emergencyDocument) pageError = void 0;
		publishBackend(backendState());
		if (state.phase === "error") navigateMain(startupUrl).catch((error) => {
			console.error(error);
		});
	});
	const publishUpdate = (state) => {
		updateState = state;
		for (const window of BrowserWindow.getAllWindows()) window.webContents.send(DESKTOP_IPC.updatesState, state);
		return state;
	};
	const hooks = {
		beforeChange: () => backend.stop(),
		afterChange: () => backend.start(async () => {})
	};
	recoverApplication = async (action) => {
		await startup?.catch(() => void 0);
		await backend.stop();
		if (action === "restart") {
			app.relaunch();
			app.quit();
			return;
		}
		if (!profileRecoveryAvailable()) throw new Error(messages.startupReinstallAdvice);
		if (action === "reset") await manager.resetConfiguration(hooks);
		else await manager.mutate({ type: "plugins-disable-all" }, hooks);
		emergencyDocument = false;
		pageError = void 0;
		navigation = void 0;
		await navigateMain(applicationUrl);
	};
	const showStartupError = async (error) => {
		if (quitting) return;
		pageError = desktopErrorState(error);
		try {
			await navigateMain(startupUrl);
		} catch (navigationError) {
			await showEmergencyError(new AggregateError([error, navigationError], messages.startupFailed));
		}
		publishBackend(backendState());
	};
	const reconcileBackend = () => {
		startup ??= (async () => {
			pageError = void 0;
			await navigateMain(startupUrl);
			await backend.start(async () => {
				if (development === void 0) await manager.applyRelease();
			});
			if (backend.host !== void 0) await navigateMain(applicationUrl);
		})().catch(async (error) => {
			await showStartupError(error);
			throw error;
		}).finally(() => {
			startup = void 0;
		});
		return startup;
	};
	const updates = new DesktopUpdateCoordinator(publishUpdate, async () => {
		shellInstallerOwnsQuit = true;
		await backend.stop();
	});
	protocol.handle(SCHEME, (request) => {
		const url = new URL(request.url);
		if (url.hostname === "shell") return serveShellAsset(request).then((response) => {
			if (response.status >= 400 && [
				"/startup.html",
				"/startup.js",
				"/startup.css"
			].includes(url.pathname)) showEmergencyError(/* @__PURE__ */ new Error(`Desktop recovery resource could not be loaded: ${url.pathname} (HTTP ${response.status})`)).catch((error) => {
				console.error(error);
			});
			return response;
		});
		if (url.hostname !== "app") return Promise.resolve(new Response(null, { status: 404 }));
		const active = backend.host;
		if (active === void 0) return Promise.resolve(new Response("backend unavailable", { status: 503 }));
		return active.fetch(request);
	});
	const mutate = async (event, mutation) => {
		assertDesktopSender(event, ["shell"]);
		if (development !== void 0) throw new Error("dsh desktop: plugin package changes require a packaged application");
		await startup?.catch(() => void 0);
		pageError = void 0;
		await navigateMain(startupUrl);
		try {
			await manager.mutate(mutation, hooks);
			await navigateMain(applicationUrl);
		} catch (error) {
			await showStartupError(error);
			throw error;
		}
	};
	ipcMain.handle(DESKTOP_IPC.localeGet, (event) => {
		assertDesktopSender(event, ["shell"]);
		return locale;
	});
	ipcMain.handle(DESKTOP_IPC.pluginsList, (event) => {
		assertDesktopSender(event, ["shell"]);
		if (development !== void 0) return [];
		return manager.listPlugins();
	});
	ipcMain.handle(DESKTOP_IPC.pluginsAdd, (event, spec) => {
		if (typeof spec !== "string") throw new Error("dsh desktop: plugin spec must be a string");
		return mutate(event, {
			type: "plugin-add",
			spec
		});
	});
	ipcMain.handle(DESKTOP_IPC.pluginsRemove, (event, name) => {
		if (typeof name !== "string") throw new Error("dsh desktop: plugin name must be a string");
		return mutate(event, {
			type: "plugin-remove",
			name
		});
	});
	ipcMain.handle(DESKTOP_IPC.pluginsUpdate, (event, name, version) => {
		if (typeof name !== "string" || typeof version !== "string") throw new Error("dsh desktop: plugin name and version must be strings");
		return mutate(event, {
			type: "plugin-update",
			name,
			version
		});
	});
	ipcMain.handle(DESKTOP_IPC.pluginsToggle, (event, name, enabled) => {
		if (typeof name !== "string" || typeof enabled !== "boolean") throw new Error("dsh desktop: invalid plugin activation request");
		return mutate(event, {
			type: "plugin-toggle",
			name,
			enabled
		});
	});
	ipcMain.handle(DESKTOP_IPC.pluginsDisableAll, (event) => mutate(event, { type: "plugins-disable-all" }));
	ipcMain.handle(DESKTOP_IPC.backendStatus, (event) => {
		assertDesktopSender(event, ["shell"]);
		return backendState();
	});
	ipcMain.handle(DESKTOP_IPC.backendRetry, async (event) => {
		assertDesktopSender(event, ["shell"]);
		await reconcileBackend();
		focusPrimaryWindow();
	});
	ipcMain.handle(DESKTOP_IPC.applicationRestart, async (event) => {
		assertDesktopSender(event, ["shell"]);
		try {
			await recoverApplication("restart");
		} catch (error) {
			await showStartupError(error);
		}
	});
	ipcMain.handle(DESKTOP_IPC.configurationReset, async (event) => {
		assertDesktopSender(event, ["shell"]);
		if (development !== void 0) throw new Error("Desktop configuration reset requires a packaged application");
		if (backendState().phase !== "error") throw new Error("Desktop profile reset requires a startup failure");
		await startup?.catch(() => void 0);
		try {
			await recoverApplication("reset");
		} catch (error) {
			await showStartupError(error);
		}
	});
	ipcMain.handle(DESKTOP_IPC.updatesCheck, async (event) => {
		assertDesktopSender(event, ["shell"]);
		return updates.check();
	});
	ipcMain.handle(DESKTOP_IPC.updatesInstall, async (event) => {
		assertDesktopSender(event, ["shell"]);
		await updates.install();
	});
	const checkAndPrompt = async (manual) => {
		const state = await updates.check();
		if (state.phase === "error") {
			if (manual) await dialog.showMessageBox({
				type: "error",
				title: messages.updateCheckFailedTitle,
				message: state.message ?? messages.unknownError
			});
			return;
		}
		if (state.phase !== "available") {
			if (manual) await dialog.showMessageBox({
				type: "info",
				title: messages.updateCheckTitle,
				message: state.message ?? messages.updateCurrent
			});
			return;
		}
		if ((await dialog.showMessageBox({
			type: "info",
			title: messages.updateTitle,
			message: messages.updateAvailable,
			detail: formatDesktopMessage(messages.updateDetail, { version: state.version ?? "" }),
			buttons: [messages.installAndRestart, messages.later],
			defaultId: 0,
			cancelId: 1
		})).response !== 0) return;
		const installed = await updates.install();
		if (installed.phase === "error") await dialog.showMessageBox({
			type: "error",
			title: messages.updateFailedTitle,
			message: installed.message ?? messages.unknownError
		});
	};
	const openPluginWindow = () => {
		if (pluginWindow !== void 0 && !pluginWindow.isDestroyed()) {
			pluginWindow.focus();
			return;
		}
		pluginWindow = createWindow(managementPreload);
		pluginWindow.setSize(900, 620);
		pluginWindow.setTitle(messages.pluginWindowTitle);
		pluginWindow.once("ready-to-show", () => {
			pluginWindow?.show();
		});
		pluginWindow.once("closed", () => {
			pluginWindow = void 0;
		});
		pluginWindow.loadURL(`${SCHEME}://shell/plugin-manager.html`);
	};
	Menu.setApplicationMenu(Menu.buildFromTemplate([{
		label: process.platform === "darwin" ? app.name : messages.application,
		submenu: [
			{
				label: development === void 0 ? messages.pluginsMenu : messages.pluginsMenuPackagedOnly,
				accelerator: "CmdOrCtrl+,",
				enabled: development === void 0,
				click: openPluginWindow
			},
			{
				label: messages.checkUpdatesMenu,
				click: () => {
					checkAndPrompt(true);
				}
			},
			{ type: "separator" },
			{ role: "quit" }
		]
	}]));
	const createMainWindow = () => {
		const window = createWindow(appPreload, true);
		mainWindow = window;
		window.on("closed", () => {
			if (mainWindow === window) mainWindow = void 0;
		});
		window.webContents.on("preload-error", (_event, _path, error) => {
			showEmergencyError(error).catch((failure) => {
				console.error(failure);
			});
		});
		window.webContents.on("render-process-gone", (_event, details) => {
			navigation = void 0;
			emergencyDocument = false;
			showStartupError(/* @__PURE__ */ new Error(`Desktop renderer exited: ${details.reason}`)).catch((failure) => {
				console.error(failure);
			});
		});
		return window;
	};
	focusPrimaryWindow = () => {
		const window = mainWindow;
		if (window === void 0 || window.isDestroyed()) {
			createMainWindow();
			navigateMain(backendState().phase === "ready" ? applicationUrl : startupUrl).catch((error) => {
				console.error(error);
			});
			return;
		}
		if (window.isMinimized()) window.restore();
		window.show();
		window.focus();
	};
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) focusPrimaryWindow();
	});
	app.on("window-all-closed", () => {
		if (process.platform !== "darwin") app.quit();
	});
	app.on("before-quit", (event) => {
		if (shellInstallerOwnsQuit || quitting) return;
		event.preventDefault();
		quitting = true;
		backend.close().catch((error) => {
			console.error(error);
		}).finally(() => {
			app.quit();
		});
	});
	mainWindow = createMainWindow();
	await reconcileBackend().catch(() => void 0);
	if (quitting) return;
	if (mainWindow !== void 0 && development !== void 0 && process.env.DSH_DESKTOP_OPEN_DEVTOOLS !== "0") mainWindow.webContents.openDevTools({ mode: "detach" });
	publishUpdate(updateState);
	setTimeout(() => {
		checkAndPrompt(false);
	}, 1e4);
}
if (claimDesktopSingleInstance(app, () => {
	focusPrimaryWindow();
})) app.whenReady().then(main).catch(async (error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(error);
	const diagnosticFile = process.env.DSH_DESKTOP_DIAGNOSTIC_FILE;
	if (diagnosticFile !== void 0) await writeFile(diagnosticFile, `${error instanceof Error ? error.stack ?? message : message}\n`).catch(() => void 0);
	const window = BrowserWindow.getAllWindows()[0] ?? createWindow(fileURLToPath(new URL("./preload-app.cjs", import.meta.url)), true);
	window.once("closed", () => {
		app.quit();
	});
	await showEmergencyDocument(window, message);
}).catch((error) => {
	console.error(error);
	app.exit(1);
});
//#endregion
export {};
