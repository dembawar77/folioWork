import { describe, expect, it } from "vitest";
import { isAllowedPushEndpoint, isValidKeys } from "./pushEndpoint";

describe("adresses push", () => {
  it.each([
    ["https://fcm.googleapis.com/fcm/send/abc", true],
    ["https://updates.push.services.mozilla.com/wpush/v2/abc", true],
    ["https://web.push.apple.com/QG9…", true],
    ["https://wns2-par02p.notify.windows.com/w/?token=abc", true],
    ["https://evil.com/fcm.googleapis.com", false],
    ["https://fcm.googleapis.com.evil.com/x", false],
    ["https://fcm.googleapis.com:8443/x", false],
    ["http://fcm.googleapis.com/x", false],
    ["https://169.254.169.254/latest/meta-data", false],
    ["https://localhost/x", false],
    ["https://notify.windows.com/x", false],
    ["pas une url", false],
  ])("%s → %s", (u, ok) => expect(isAllowedPushEndpoint(u)).toBe(ok));
  it("clés", () => {
    expect(isValidKeys("BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", "tBHItJI5svbpez7KI4CCXg")).toBe(true);
    expect(isValidKeys("x", "y")).toBe(false);
  });
});
