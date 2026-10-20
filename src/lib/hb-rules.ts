import type { Method } from "./hb";

// The one door from the browser to HomeButler. Only what is listed here passes, each with the roles
// that may use it (deny by default: something new is never opened to the wall tablet by accident).
// "kid" is the remote tablet's role; it gets the devices page and nothing else, as before.
export type Role = "member" | "kid";
interface Rule { method: Method; path: RegExp; roles: Role[]; timeoutMs?: number }
const BOTH: Role[] = ["member", "kid"];
const MEMBER: Role[] = ["member"];
const NAME = "[^/]+";

export const RULES: Rule[] = [
  { method: "GET", path: /^devices$/, roles: BOTH },
  { method: "GET", path: /^history$/, roles: BOTH },
  { method: "POST", path: new RegExp(`^devices/(ac|ir)/${NAME}$`), roles: BOTH, timeoutMs: 35_000 },
  { method: "GET", path: /^theater$/, roles: BOTH },
  { method: "POST", path: /^theater\/flags$/, roles: BOTH },
  { method: "GET", path: /^schedules$/, roles: BOTH },
  { method: "POST", path: /^schedules$/, roles: BOTH },
  { method: "PATCH", path: /^schedules\/\d+$/, roles: BOTH },
  { method: "DELETE", path: /^schedules\/\d+$/, roles: BOTH },
  { method: "GET", path: /^dehumidifiers$/, roles: BOTH },
  { method: "GET", path: /^dehumidifiers\/history$/, roles: BOTH },
  { method: "POST", path: new RegExp(`^dehumidifiers/${NAME}/control$`), roles: BOTH, timeoutMs: 35_000 },
  { method: "PUT", path: new RegExp(`^dehumidifiers/${NAME}/rule$`), roles: BOTH, timeoutMs: 35_000 },
  { method: "GET", path: /^home$/, roles: MEMBER },
  { method: "GET", path: /^weather$/, roles: MEMBER },
  { method: "GET", path: /^todos$/, roles: MEMBER },
  { method: "POST", path: /^todos$/, roles: MEMBER },
  { method: "PATCH", path: /^todos\/\d+$/, roles: MEMBER },
  { method: "POST", path: /^todos\/\d+\/complete$/, roles: MEMBER },
  { method: "POST", path: /^todo-templates$/, roles: MEMBER },
  { method: "PATCH", path: /^todo-templates\/\d+$/, roles: MEMBER },
  { method: "DELETE", path: /^todo-templates\/\d+$/, roles: MEMBER },
  { method: "GET", path: /^food$/, roles: MEMBER },
  { method: "POST", path: /^food$/, roles: MEMBER },
  { method: "PATCH", path: /^food\/\d+$/, roles: MEMBER },
  { method: "DELETE", path: /^food\/\d+$/, roles: MEMBER },
  { method: "GET", path: /^lighting$/, roles: MEMBER },
  { method: "PATCH", path: /^lighting\/areas\/\d+$/, roles: MEMBER },
  { method: "PATCH", path: new RegExp(`^lighting/${NAME}/state$`), roles: MEMBER },
  { method: "POST", path: new RegExp(`^lighting/${NAME}/(effect|notification)$`), roles: MEMBER },
  { method: "POST", path: new RegExp(`^lighting/scenes/${NAME}/recall$`), roles: MEMBER },
];

export function findRule(method: string, path: string, role: Role): Rule | "forbidden" | null {
  const rule = RULES.find((r) => r.method === method && r.path.test(path));
  if (!rule) return null;
  return rule.roles.includes(role) ? rule : "forbidden";
}
