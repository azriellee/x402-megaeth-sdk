// Shared (at root for easy access)
export * from "./shared/types.js";
export * from "./shared/constants.js";
export * from "./shared/headers.js";
export * from "./shared/price.js";

// Role-based Namespacing
export * as Server from "./server/index.js";
export * as Client from "./client/index.js";

// Facilitator — exported for the hosted facilitator-server.
// End-users of the SDK typically don't need this directly.
export * as Facilitator from "./facilitator/index.js";
