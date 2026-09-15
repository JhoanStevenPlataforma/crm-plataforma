/**
 * The app's domain types.
 *
 * This used to be one 919-line `types.ts`. It is a barrel now so that every
 * existing `import ... from "../types"` keeps resolving unchanged -- the split
 * is about where the types are MAINTAINED, not about rewriting hundreds of
 * import lines.
 *
 * Import from the domain module directly when you know which one you need;
 * `../types` stays correct either way.
 */

export * from "./core";
export * from "./crm";
export * from "./tasks";
export * from "./teams";
export * from "./activity";
export * from "./analytics";
export * from "./reports";
export * from "./catalog";
export * from "./quotes";
