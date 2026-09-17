import { ClientRoster } from './roster.ts';
/** The `web` profile's bundle layers, in the order `dsh --profile web` applies them (app-boot `PROFILE_TEMPLATES.web`). */
export declare const WEB_PROFILE_BUNDLES: readonly string[];
/**
 * Compose the browser roster of `bundles`, applied in order.
 * @param bundles - bundle package names in application order.
 * @param anchor - file whose package resolution locates the bundles; default this package.
 * @returns the roster in composition order, one row per package.
 * @throws {Error} when a bundle, its patch file, or an enabled row's package does not resolve, when the patch list
 * is not a list or does not apply as written, or when a browser row's `disabled` is a `!!js` expression.
 */
export declare function bundleRoster(bundles: readonly string[], anchor?: string): ClientRoster;
/** The `web` profile's browser roster, composed from its bundles at import. */
export declare const webApp: ClientRoster;
//# sourceMappingURL=bundle-roster.d.ts.map