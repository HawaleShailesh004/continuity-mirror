/**
 * Every route, for the accessibility and console checks. `/dev/states` is a
 * developer gallery that is a deliberate 404 in production builds, so it is
 * only checked against a dev server (E2E_BASE_URL points the suite at a build).
 * `/brows` and `/regrowth` need a journey, so with none they send the visitor back to the
 * start; their real screens are checked in p1.spec.ts and p1-brows.spec.ts.
 * `/share/<token>` is the helper's page: an unknown link reads "this link has ended".
 */
const all = [
  "/",
  "/start/consent",
  "/start/consent?helper=1",
  "/start/capture",
  "/start/snapshot",
  "/paths",
  "/paths/closest",
  "/paths/easier",
  "/paths/new-chapter",
  "/brows",
  "/regrowth",
  "/plan",
  "/plan/export",
  "/privacy",
  "/about",
  "/partners",
  "/share/AAAAAAAAAAAAAAAAAAAAAA",
  "/offline",
  "/dev/states",
];

export const routes = process.env.E2E_BASE_URL ? all.filter((r) => r !== "/dev/states") : all;
