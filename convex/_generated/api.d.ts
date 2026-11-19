/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as http from "../http.js";
import type * as intake from "../intake.js";
import type * as lib_format from "../lib/format.js";
import type * as lib_parse from "../lib/parse.js";
import type * as lib_pushEndpoint from "../lib/pushEndpoint.js";
import type * as lib_recurrence from "../lib/recurrence.js";
import type * as lib_telegram from "../lib/telegram.js";
import type * as lib_time from "../lib/time.js";
import type * as lib_whatsapp from "../lib/whatsapp.js";
import type * as notify from "../notify.js";
import type * as preferences from "../preferences.js";
import type * as push from "../push.js";
import type * as tasks from "../tasks.js";
import type * as telegram from "../telegram.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  http: typeof http;
  intake: typeof intake;
  "lib/format": typeof lib_format;
  "lib/parse": typeof lib_parse;
  "lib/pushEndpoint": typeof lib_pushEndpoint;
  "lib/recurrence": typeof lib_recurrence;
  "lib/telegram": typeof lib_telegram;
  "lib/time": typeof lib_time;
  "lib/whatsapp": typeof lib_whatsapp;
  notify: typeof notify;
  preferences: typeof preferences;
  push: typeof push;
  tasks: typeof tasks;
  telegram: typeof telegram;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  auth: import("@convex-dev/auth/_generated/component.js").ComponentApi<"auth">;
  authGoogle: import("@convex-dev/auth/components/google/_generated/component.js").ComponentApi<"authGoogle">;
};
