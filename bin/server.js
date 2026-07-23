// @bun
var __defProp = Object.defineProperty;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};

// packages/server/src/index.ts
import { Database } from "bun:sqlite";
import { mkdir as mkdir3, readFile as readFile4, writeFile as writeFile3 } from "fs/promises";
import { join as join7 } from "path";

// packages/server/src/bus.ts
function createBus() {
  const handlers = new Set;
  return {
    publish(event) {
      for (const h of handlers)
        h(event);
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    }
  };
}

// packages/server/src/handoff/index.ts
import { mkdir } from "fs/promises";
import { join } from "path";

class HandoffService {
  cwd;
  db;
  constructor(cwd, db) {
    this.cwd = cwd;
    this.db = db;
  }
  async generate(storyId) {
    const story = this.lookupStory(storyId);
    if (!story)
      return null;
    const content = await this.buildStorySections(story);
    const dateStr = new Date().toISOString().slice(0, 10);
    return this.writeHandoff(storyId, null, content, `${dateStr}-${storyId}.md`);
  }
  async generateForSession(sessionId) {
    const session = this.db.query(`SELECT active_story_id, started_at FROM sessions WHERE id = ?`).get(sessionId);
    const story = session?.active_story_id ? this.lookupStory(session.active_story_id) : null;
    const mined = this.mineSession(sessionId, session?.started_at ?? null);
    const thisSession = this.renderThisSession(mined, !story);
    const dateStr = new Date().toISOString().slice(0, 10);
    if (story) {
      const content2 = [
        await this.buildStorySections(story),
        "",
        thisSession
      ].join(`
`);
      return this.writeHandoff(story.id, sessionId, content2, `${dateStr}-${story.id}.md`);
    }
    const content = ["# Handoff", "", thisSession].join(`
`);
    const shortId = sessionId.slice(0, 8);
    return this.writeHandoff(null, sessionId, content, `${dateStr}-session-${shortId}.md`);
  }
  async writeHandoff(storyId, sessionId, content, fileName) {
    const handoffsDir = join(this.cwd, ".throughline", "handoffs");
    await mkdir(handoffsDir, { recursive: true });
    const filePath = join(handoffsDir, fileName);
    await Bun.write(filePath, content);
    this.db.run(`INSERT INTO handoffs (story_id, session_id, file_path, generated_at) VALUES (?, ?, ?, ?)`, [storyId, sessionId, filePath, Date.now()]);
    return { filePath, content };
  }
  lookupStory(storyId) {
    return this.db.query(`SELECT id, title, file_path, linked_plan_path, size, status
           FROM stories WHERE id = ?`).get(storyId) ?? null;
  }
  async buildStorySections(story) {
    const [storyBody, planText] = await Promise.all([
      Bun.file(story.file_path).text().catch(() => ""),
      story.linked_plan_path ? Bun.file(story.linked_plan_path).text().catch(() => "") : Promise.resolve(null)
    ]);
    const planSection = planText != null ? this.extractPlanSummary(planText) : "(no plan yet)";
    return [
      `# Handoff: ${story.title}`,
      "",
      `**Story:** ${story.id} \xB7 **Status:** ${story.status} \xB7 **Size:** ${story.size ?? "\u2014"}`,
      "",
      "## Next Up",
      planSection,
      "",
      "## Story Body",
      "",
      storyBody.replace(/^---[\s\S]*?---\n/, "").trim()
    ].join(`
`);
  }
  mineSession(sessionId, startedAt) {
    const lastTs = this.db.query(`SELECT MAX(ts) AS ts FROM events WHERE session_id = ?`).get(sessionId)?.ts ?? null;
    let timeRange = "(none)";
    if (startedAt != null) {
      const start = new Date(startedAt).toISOString();
      const end = lastTs ? new Date(lastTs).toISOString() : start;
      timeRange = `${start} \u2192 ${end}`;
    }
    const files = this.db.query(`SELECT DISTINCT JSON_EXTRACT(payload_json, '$.tool_input.file_path') AS file_path
         FROM events
         WHERE session_id = ?
           AND event_name = 'PostToolUse'
           AND JSON_EXTRACT(payload_json, '$.tool_name') IN ('Edit', 'Write')
           AND file_path IS NOT NULL
         ORDER BY file_path`).all(sessionId).map((r) => r.file_path);
    const bashCommands = this.db.query(`SELECT JSON_EXTRACT(payload_json, '$.tool_input.command') AS command
         FROM events
         WHERE session_id = ?
           AND event_name = 'PostToolUse'
           AND JSON_EXTRACT(payload_json, '$.tool_name') = 'Bash'
           AND command IS NOT NULL
         ORDER BY ts`).all(sessionId).map((r) => r.command);
    const commits = bashCommands.filter((c) => /\bgit commit\b/.test(c));
    const tests = bashCommands.filter((c) => /test/.test(c));
    const failing = this.db.query(`SELECT JSON_EXTRACT(payload_json, '$.tool_name') AS tool_name, COUNT(*) AS c
         FROM events
         WHERE session_id = ?
           AND event_name = 'PostToolUseFailure'
         GROUP BY tool_name
         HAVING c >= 3`).all(sessionId).map((r) => r.tool_name);
    const firstPrompt = this.db.query(`SELECT JSON_EXTRACT(payload_json, '$.prompt') AS prompt
         FROM events
         WHERE session_id = ?
           AND event_name = 'UserPromptSubmit'
         ORDER BY ts ASC
         LIMIT 1`).get(sessionId)?.prompt ?? null;
    return { timeRange, files, commits, tests, failing, firstPrompt };
  }
  renderThisSession(mined, includeGoal) {
    const renderList = (items) => items.length === 0 ? "(none)" : items.map((i) => `- ${i}`).join(`
`);
    const lines = ["## This session", ""];
    if (includeGoal && mined.firstPrompt) {
      lines.push(`Goal: ${mined.firstPrompt}`, "");
    }
    lines.push(`**Time range:** ${mined.timeRange}`, "", "### Files edited", renderList(mined.files), "", "### Commits", renderList(mined.commits), "", "### Test runs", renderList(mined.tests), "", "### Tools failing \u22653\xD7", renderList(mined.failing));
    return lines.join(`
`);
  }
  extractPlanSummary(planText) {
    const lines = planText.split(`
`);
    if (lines.length === 0)
      return "(no tasks in plan)";
    const taskIndices = [];
    for (let i = 0;i < lines.length; i++) {
      if (lines[i].match(/^###\s+Task/))
        taskIndices.push(i);
    }
    if (taskIndices.length === 0)
      return "(no tasks in plan)";
    for (let ti = 0;ti < taskIndices.length; ti++) {
      const taskIdx = taskIndices[ti];
      const nextTaskIdx = taskIndices[ti + 1] ?? lines.length;
      const taskBlock = lines.slice(taskIdx, Math.min(taskIdx + 30, nextTaskIdx));
      const hasDoneStep = taskBlock.some((s) => s.match(/^- \[x\]/i));
      if (!hasDoneStep)
        return lines[taskIdx];
    }
    return lines[taskIndices[taskIndices.length - 1]];
  }
  list() {
    return this.db.query(`SELECT id, story_id, session_id, file_path, generated_at FROM handoffs ORDER BY generated_at DESC`).all();
  }
  latest(storyId) {
    const where = storyId ? "WHERE story_id = ?" : "";
    const query = this.db.query(`SELECT id, story_id, session_id, file_path, generated_at FROM handoffs
       ${where} ORDER BY generated_at DESC LIMIT 1`);
    return (storyId ? query.get(storyId) : query.get()) ?? null;
  }
  async latestWithContext(storyId) {
    const row = this.latest(storyId);
    if (!row)
      return null;
    const content = await Bun.file(row.file_path).text().catch(() => "");
    let title = "Session handoff";
    if (row.story_id) {
      const story = this.lookupStory(row.story_id);
      title = `Handoff: ${story?.title ?? row.story_id}`;
    }
    return { ...row, title, content };
  }
}

// packages/server/src/lifecycle/index.ts
import { writeFile } from "fs/promises";
import { join as join2 } from "path";
async function writeRuntimeJson(dataDir, data) {
  const path = join2(dataDir, "runtime.json");
  await writeFile(path, JSON.stringify(data, null, 2), { mode: 384 });
}
function startIdleTimer(server, db, idleMs = 4 * 60 * 60 * 1000) {
  let timer = setTimeout(shutdown, idleMs);
  function shutdown() {
    db.close();
    server.stop(true);
    process.exit(0);
  }
  return {
    reset() {
      clearTimeout(timer);
      timer = setTimeout(shutdown, idleMs);
    },
    cancel() {
      clearTimeout(timer);
    }
  };
}
function registerShutdownHandler(server, db, cancelIdle) {
  process.once("SIGTERM", () => {
    cancelIdle();
    db.close();
    server.stop(true);
    process.exit(0);
  });
}

// packages/server/src/server.ts
import { join as join4 } from "path";

// packages/server/src/stories/index.ts
import { watch } from "fs";
import { readFileSync } from "fs";
import { mkdir as mkdir2, readFile, readdir, rename, writeFile as writeFile2 } from "fs/promises";
import { join as join3 } from "path";

// node_modules/.bun/zod@3.25.76/node_modules/zod/v3/external.js
var exports_external = {};
__export(exports_external, {
  void: () => voidType,
  util: () => util,
  unknown: () => unknownType,
  union: () => unionType,
  undefined: () => undefinedType,
  tuple: () => tupleType,
  transformer: () => effectsType,
  symbol: () => symbolType,
  string: () => stringType,
  strictObject: () => strictObjectType,
  setErrorMap: () => setErrorMap,
  set: () => setType,
  record: () => recordType,
  quotelessJson: () => quotelessJson,
  promise: () => promiseType,
  preprocess: () => preprocessType,
  pipeline: () => pipelineType,
  ostring: () => ostring,
  optional: () => optionalType,
  onumber: () => onumber,
  oboolean: () => oboolean,
  objectUtil: () => objectUtil,
  object: () => objectType,
  number: () => numberType,
  nullable: () => nullableType,
  null: () => nullType,
  never: () => neverType,
  nativeEnum: () => nativeEnumType,
  nan: () => nanType,
  map: () => mapType,
  makeIssue: () => makeIssue,
  literal: () => literalType,
  lazy: () => lazyType,
  late: () => late,
  isValid: () => isValid,
  isDirty: () => isDirty,
  isAsync: () => isAsync,
  isAborted: () => isAborted,
  intersection: () => intersectionType,
  instanceof: () => instanceOfType,
  getParsedType: () => getParsedType,
  getErrorMap: () => getErrorMap,
  function: () => functionType,
  enum: () => enumType,
  effect: () => effectsType,
  discriminatedUnion: () => discriminatedUnionType,
  defaultErrorMap: () => en_default,
  datetimeRegex: () => datetimeRegex,
  date: () => dateType,
  custom: () => custom,
  coerce: () => coerce,
  boolean: () => booleanType,
  bigint: () => bigIntType,
  array: () => arrayType,
  any: () => anyType,
  addIssueToContext: () => addIssueToContext,
  ZodVoid: () => ZodVoid,
  ZodUnknown: () => ZodUnknown,
  ZodUnion: () => ZodUnion,
  ZodUndefined: () => ZodUndefined,
  ZodType: () => ZodType,
  ZodTuple: () => ZodTuple,
  ZodTransformer: () => ZodEffects,
  ZodSymbol: () => ZodSymbol,
  ZodString: () => ZodString,
  ZodSet: () => ZodSet,
  ZodSchema: () => ZodType,
  ZodRecord: () => ZodRecord,
  ZodReadonly: () => ZodReadonly,
  ZodPromise: () => ZodPromise,
  ZodPipeline: () => ZodPipeline,
  ZodParsedType: () => ZodParsedType,
  ZodOptional: () => ZodOptional,
  ZodObject: () => ZodObject,
  ZodNumber: () => ZodNumber,
  ZodNullable: () => ZodNullable,
  ZodNull: () => ZodNull,
  ZodNever: () => ZodNever,
  ZodNativeEnum: () => ZodNativeEnum,
  ZodNaN: () => ZodNaN,
  ZodMap: () => ZodMap,
  ZodLiteral: () => ZodLiteral,
  ZodLazy: () => ZodLazy,
  ZodIssueCode: () => ZodIssueCode,
  ZodIntersection: () => ZodIntersection,
  ZodFunction: () => ZodFunction,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodError: () => ZodError,
  ZodEnum: () => ZodEnum,
  ZodEffects: () => ZodEffects,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodDefault: () => ZodDefault,
  ZodDate: () => ZodDate,
  ZodCatch: () => ZodCatch,
  ZodBranded: () => ZodBranded,
  ZodBoolean: () => ZodBoolean,
  ZodBigInt: () => ZodBigInt,
  ZodArray: () => ZodArray,
  ZodAny: () => ZodAny,
  Schema: () => ZodType,
  ParseStatus: () => ParseStatus,
  OK: () => OK,
  NEVER: () => NEVER,
  INVALID: () => INVALID,
  EMPTY_PATH: () => EMPTY_PATH,
  DIRTY: () => DIRTY,
  BRAND: () => BRAND
});

// node_modules/.bun/zod@3.25.76/node_modules/zod/v3/helpers/util.js
var util;
(function(util2) {
  util2.assertEqual = (_) => {};
  function assertIs(_arg) {}
  util2.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error;
  }
  util2.assertNever = assertNever;
  util2.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util2.getValidEnumValues = (obj) => {
    const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj[k];
    }
    return util2.objectValues(filtered);
  };
  util2.objectValues = (obj) => {
    return util2.objectKeys(obj).map(function(e) {
      return obj[e];
    });
  };
  util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
    const keys = [];
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        keys.push(key);
      }
    }
    return keys;
  };
  util2.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return;
  };
  util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  util2.joinValues = joinValues;
  util2.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util || (util = {}));
var objectUtil;
(function(objectUtil2) {
  objectUtil2.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
    };
  };
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);
var getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
};

// node_modules/.bun/zod@3.25.76/node_modules/zod/v3/ZodError.js
var ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
var quotelessJson = (obj) => {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:");
};

class ZodError extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = (error) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    };
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof ZodError)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        const firstEl = sub.path[0];
        fieldErrors[firstEl] = fieldErrors[firstEl] || [];
        fieldErrors[firstEl].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
}
ZodError.create = (issues) => {
  const error = new ZodError(issues);
  return error;
};

// node_modules/.bun/zod@3.25.76/node_modules/zod/v3/locales/en.js
var errorMap = (issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "bigint")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
};
var en_default = errorMap;

// node_modules/.bun/zod@3.25.76/node_modules/zod/v3/errors.js
var overrideErrorMap = en_default;
function setErrorMap(map) {
  overrideErrorMap = map;
}
function getErrorMap() {
  return overrideErrorMap;
}
// node_modules/.bun/zod@3.25.76/node_modules/zod/v3/helpers/parseUtil.js
var makeIssue = (params) => {
  const { data, path, errorMaps, issueData } = params;
  const fullPath = [...path, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== undefined) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
};
var EMPTY_PATH = [];
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      ctx.schemaErrorMap,
      overrideMap,
      overrideMap === en_default ? undefined : en_default
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}

class ParseStatus {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
}
var INVALID = Object.freeze({
  status: "aborted"
});
var DIRTY = (value) => ({ status: "dirty", value });
var OK = (value) => ({ status: "valid", value });
var isAborted = (x) => x.status === "aborted";
var isDirty = (x) => x.status === "dirty";
var isValid = (x) => x.status === "valid";
var isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;
// node_modules/.bun/zod@3.25.76/node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
(function(errorUtil2) {
  errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));

// node_modules/.bun/zod@3.25.76/node_modules/zod/v3/types.js
class ParseInputLazyPath {
  constructor(parent, value, path, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (Array.isArray(this._key)) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
}
var handleResult = (ctx, result) => {
  if (isValid(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error = new ZodError(ctx.common.issues);
        this._error = error;
        return this._error;
      }
    };
  }
};
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = (iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  };
  return { errorMap: customMap, description };
}

class ZodType {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus,
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    const ctx = {
      common: {
        issues: [],
        async: params?.async ?? false,
        contextualErrorMap: params?.errorMap
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result);
  }
  "~validate"(data) {
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if (err?.message?.toLowerCase()?.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: true
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }
  refine(check, message) {
    const getIssueProperties = (val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    };
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError = () => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      });
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data)
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(undefined).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
}
var cuidRegex = /^c[^\s-]{8,}$/i;
var cuid2Regex = /^[0-9a-z]+$/;
var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex = /^[a-z0-9_-]{21}$/i;
var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
var emojiRegex;
var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    if (!header)
      return false;
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}

class ZodString extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.string,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const status = new ParseStatus;
    let ctx = undefined;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "length") {
        const tooBig = input.data.length > check.value;
        const tooSmall = input.data.length < check.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          } else if (tooSmall) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          }
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "emoji") {
        if (!emojiRegex) {
          emojiRegex = new RegExp(_emojiRegex, "u");
        }
        if (!emojiRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "emoji",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "nanoid") {
        if (!nanoidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "nanoid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid2") {
        if (!cuid2Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid2",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ulid") {
        if (!ulidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ulid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "includes") {
        if (!input.data.includes(check.value, check.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { includes: check.value, position: check.position },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check.kind === "startsWith") {
        if (!input.data.startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { startsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!input.data.endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { endsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "datetime") {
        const regex = datetimeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "datetime",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "date") {
        const regex = dateRegex;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "date",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "time") {
        const regex = timeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "time",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "duration") {
        if (!durationRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "duration",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ip") {
        if (!isValidIP(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ip",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "jwt") {
        if (!isValidJWT(input.data, check.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "jwt",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cidr") {
        if (!isValidCidr(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cidr",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64") {
        if (!base64Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64url") {
        if (!base64urlRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode.invalid_string,
      ...errorUtil.errToObj(message)
    });
  }
  _addCheck(check) {
    return new ZodString({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
  }
  datetime(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      offset: options?.offset ?? false,
      local: options?.local ?? false,
      ...errorUtil.errToObj(options?.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options
      });
    }
    return this._addCheck({
      kind: "time",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      ...errorUtil.errToObj(options?.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options?.position,
      ...errorUtil.errToObj(options?.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil.errToObj(message)
    });
  }
  nonempty(message) {
    return this.min(1, errorUtil.errToObj(message));
  }
  trim() {
    return new ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
}
ZodString.create = (params) => {
  return new ZodString({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodString,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}

class ZodNumber extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    let ctx = undefined;
    const status = new ParseStatus;
    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_finite,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new ZodNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
  }
  get isFinite() {
    let max = null;
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
}
ZodNumber.create = (params) => {
  return new ZodNumber({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodNumber,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};

class ZodBigInt extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch {
        return this._getInvalidInput(input);
      }
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = undefined;
    const status = new ParseStatus;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            type: "bigint",
            minimum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            type: "bigint",
            maximum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (input.data % check.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.bigint,
      received: ctx.parsedType
    });
    return INVALID;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new ZodBigInt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
}
ZodBigInt.create = (params) => {
  return new ZodBigInt({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodBigInt,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};

class ZodBoolean extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
}
ZodBoolean.create = (params) => {
  return new ZodBoolean({
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};

class ZodDate extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    if (Number.isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_date
      });
      return INVALID;
    }
    const status = new ParseStatus;
    let ctx = undefined;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            message: check.message,
            inclusive: true,
            exact: false,
            minimum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            message: check.message,
            inclusive: true,
            exact: false,
            maximum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check) {
    return new ZodDate({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
}
ZodDate.create = (params) => {
  return new ZodDate({
    checks: [],
    coerce: params?.coerce || false,
    typeName: ZodFirstPartyTypeKind.ZodDate,
    ...processCreateParams(params)
  });
};

class ZodSymbol extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.symbol,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
}
ZodSymbol.create = (params) => {
  return new ZodSymbol({
    typeName: ZodFirstPartyTypeKind.ZodSymbol,
    ...processCreateParams(params)
  });
};

class ZodUndefined extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
}
ZodUndefined.create = (params) => {
  return new ZodUndefined({
    typeName: ZodFirstPartyTypeKind.ZodUndefined,
    ...processCreateParams(params)
  });
};

class ZodNull extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
}
ZodNull.create = (params) => {
  return new ZodNull({
    typeName: ZodFirstPartyTypeKind.ZodNull,
    ...processCreateParams(params)
  });
};

class ZodAny extends ZodType {
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK(input.data);
  }
}
ZodAny.create = (params) => {
  return new ZodAny({
    typeName: ZodFirstPartyTypeKind.ZodAny,
    ...processCreateParams(params)
  });
};

class ZodUnknown extends ZodType {
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK(input.data);
  }
}
ZodUnknown.create = (params) => {
  return new ZodUnknown({
    typeName: ZodFirstPartyTypeKind.ZodUnknown,
    ...processCreateParams(params)
  });
};

class ZodNever extends ZodType {
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType
    });
    return INVALID;
  }
}
ZodNever.create = (params) => {
  return new ZodNever({
    typeName: ZodFirstPartyTypeKind.ZodNever,
    ...processCreateParams(params)
  });
};

class ZodVoid extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
}
ZodVoid.create = (params) => {
  return new ZodVoid({
    typeName: ZodFirstPartyTypeKind.ZodVoid,
    ...processCreateParams(params)
  });
};

class ZodArray extends ZodType {
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext(ctx, {
          code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
          minimum: tooSmall ? def.exactLength.value : undefined,
          maximum: tooBig ? def.exactLength.value : undefined,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all([...ctx.data].map((item, i) => {
        return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      })).then((result2) => {
        return ParseStatus.mergeArray(status, result2);
      });
    }
    const result = [...ctx.data].map((item, i) => {
      return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
    });
    return ParseStatus.mergeArray(status, result);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new ZodArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) }
    });
  }
  max(maxLength, message) {
    return new ZodArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) }
    });
  }
  length(len, message) {
    return new ZodArray({
      ...this._def,
      exactLength: { value: len, message: errorUtil.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
}
ZodArray.create = (schema, params) => {
  return new ZodArray({
    type: schema,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind.ZodArray,
    ...processCreateParams(params)
  });
};
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: () => newShape
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}

class ZodObject extends ZodType {
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    this._cached = { shape, keys };
    return this._cached;
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }
    const pairs = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] }
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.unrecognized_keys,
            keys: extraKeys
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") {} else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: catchall._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
          alwaysSet: key in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value,
            alwaysSet: pair.alwaysSet
          });
        }
        return syncPairs;
      }).then((syncPairs) => {
        return ParseStatus.mergeObjectSync(status, syncPairs);
      });
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil.errToObj;
    return new ZodObject({
      ...this._def,
      unknownKeys: "strict",
      ...message !== undefined ? {
        errorMap: (issue, ctx) => {
          const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
          if (issue.code === "unrecognized_keys")
            return {
              message: errorUtil.errToObj(message).message ?? defaultError
            };
          return {
            message: defaultError
          };
        }
      } : {}
    });
  }
  strip() {
    return new ZodObject({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new ZodObject({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  extend(augmentation) {
    return new ZodObject({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...augmentation
      })
    });
  }
  merge(merging) {
    const merged = new ZodObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }),
      typeName: ZodFirstPartyTypeKind.ZodObject
    });
    return merged;
  }
  setKey(key, schema) {
    return this.augment({ [key]: schema });
  }
  catchall(index) {
    return new ZodObject({
      ...this._def,
      catchall: index
    });
  }
  pick(mask) {
    const shape = {};
    for (const key of util.objectKeys(mask)) {
      if (mask[key] && this.shape[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  omit(mask) {
    const shape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (!mask[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  deepPartial() {
    return deepPartialify(this);
  }
  partial(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      const fieldSchema = this.shape[key];
      if (mask && !mask[key]) {
        newShape[key] = fieldSchema;
      } else {
        newShape[key] = fieldSchema.optional();
      }
    }
    return new ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  required(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (mask && !mask[key]) {
        newShape[key] = this.shape[key];
      } else {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional) {
          newField = newField._def.innerType;
        }
        newShape[key] = newField;
      }
    }
    return new ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  keyof() {
    return createZodEnum(util.objectKeys(this.shape));
  }
}
ZodObject.create = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.strictCreate = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strict",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.lazycreate = (shape, params) => {
  return new ZodObject({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};

class ZodUnion extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result of results) {
        if (result.result.status === "valid") {
          return result.result;
        }
      }
      for (const result of results) {
        if (result.result.status === "dirty") {
          ctx.common.issues.push(...result.ctx.common.issues);
          return result.result;
        }
      }
      const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return Promise.all(options.map(async (option) => {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    } else {
      let dirty = undefined;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        const result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result.status === "valid") {
          return result;
        } else if (result.status === "dirty" && !dirty) {
          dirty = { result, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError(issues2));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
  }
  get options() {
    return this._def.options;
  }
}
ZodUnion.create = (types, params) => {
  return new ZodUnion({
    options: types,
    typeName: ZodFirstPartyTypeKind.ZodUnion,
    ...processCreateParams(params)
  });
};
var getDiscriminator = (type) => {
  if (type instanceof ZodLazy) {
    return getDiscriminator(type.schema);
  } else if (type instanceof ZodEffects) {
    return getDiscriminator(type.innerType());
  } else if (type instanceof ZodLiteral) {
    return [type.value];
  } else if (type instanceof ZodEnum) {
    return type.options;
  } else if (type instanceof ZodNativeEnum) {
    return util.objectValues(type.enum);
  } else if (type instanceof ZodDefault) {
    return getDiscriminator(type._def.innerType);
  } else if (type instanceof ZodUndefined) {
    return [undefined];
  } else if (type instanceof ZodNull) {
    return [null];
  } else if (type instanceof ZodOptional) {
    return [undefined, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodNullable) {
    return [null, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodBranded) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodReadonly) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodCatch) {
    return getDiscriminator(type._def.innerType);
  } else {
    return [];
  }
};

class ZodDiscriminatedUnion extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const discriminator = this.discriminator;
    const discriminatorValue = ctx.data[discriminator];
    const option = this.optionsMap.get(discriminatorValue);
    if (!option) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union_discriminator,
        options: Array.from(this.optionsMap.keys()),
        path: [discriminator]
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return option._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    } else {
      return option._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    }
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  static create(discriminator, options, params) {
    const optionsMap = new Map;
    for (const type of options) {
      const discriminatorValues = getDiscriminator(type.shape[discriminator]);
      if (!discriminatorValues.length) {
        throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
      }
      for (const value of discriminatorValues) {
        if (optionsMap.has(value)) {
          throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
        }
        optionsMap.set(value, type);
      }
    }
    return new ZodDiscriminatedUnion({
      typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
      discriminator,
      options,
      optionsMap,
      ...processCreateParams(params)
    });
  }
}
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0;index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}

class ZodIntersection extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = (parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) {
        return INVALID;
      }
      const merged = mergeValues(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_intersection_types
        });
        return INVALID;
      }
      if (isDirty(parsedLeft) || isDirty(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    };
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        })
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(this._def.left._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }), this._def.right._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }));
    }
  }
}
ZodIntersection.create = (left, right, params) => {
  return new ZodIntersection({
    left,
    right,
    typeName: ZodFirstPartyTypeKind.ZodIntersection,
    ...processCreateParams(params)
  });
};

class ZodTuple extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      return INVALID;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      status.dirty();
    }
    const items = [...ctx.data].map((item, itemIndex) => {
      const schema = this._def.items[itemIndex] || this._def.rest;
      if (!schema)
        return null;
      return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
    }).filter((x) => !!x);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus.mergeArray(status, results);
      });
    } else {
      return ParseStatus.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new ZodTuple({
      ...this._def,
      rest
    });
  }
}
ZodTuple.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple({
    items: schemas,
    typeName: ZodFirstPartyTypeKind.ZodTuple,
    rest: null,
    ...processCreateParams(params)
  });
};

class ZodRecord extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const pairs = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
        value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (ctx.common.async) {
      return ParseStatus.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    if (second instanceof ZodType) {
      return new ZodRecord({
        keyType: first,
        valueType: second,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(third)
      });
    }
    return new ZodRecord({
      keyType: ZodString.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(second)
    });
  }
}

class ZodMap extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs = [...ctx.data.entries()].map(([key, value], index) => {
      return {
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
        value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = new Map;
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = new Map;
      for (const pair of pairs) {
        const key = pair.key;
        const value = pair.value;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
}
ZodMap.create = (keyType, valueType, params) => {
  return new ZodMap({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind.ZodMap,
    ...processCreateParams(params)
  });
};

class ZodSet extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements2) {
      const parsedSet = new Set;
      for (const element of elements2) {
        if (element.status === "aborted")
          return INVALID;
        if (element.status === "dirty")
          status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
    if (ctx.common.async) {
      return Promise.all(elements).then((elements2) => finalizeSet(elements2));
    } else {
      return finalizeSet(elements);
    }
  }
  min(minSize, message) {
    return new ZodSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) }
    });
  }
  max(maxSize, message) {
    return new ZodSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) }
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
}
ZodSet.create = (valueType, params) => {
  return new ZodSet({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind.ZodSet,
    ...processCreateParams(params)
  });
};

class ZodFunction extends ZodType {
  constructor() {
    super(...arguments);
    this.validate = this.implement;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.function) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.function,
        received: ctx.parsedType
      });
      return INVALID;
    }
    function makeArgsIssue(args, error) {
      return makeIssue({
        data: args,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_arguments,
          argumentsError: error
        }
      });
    }
    function makeReturnsIssue(returns, error) {
      return makeIssue({
        data: returns,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_return_type,
          returnTypeError: error
        }
      });
    }
    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn = ctx.data;
    if (this._def.returns instanceof ZodPromise) {
      const me = this;
      return OK(async function(...args) {
        const error = new ZodError([]);
        const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
          error.addIssue(makeArgsIssue(args, e));
          throw error;
        });
        const result = await Reflect.apply(fn, this, parsedArgs);
        const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
          error.addIssue(makeReturnsIssue(result, e));
          throw error;
        });
        return parsedReturns;
      });
    } else {
      const me = this;
      return OK(function(...args) {
        const parsedArgs = me._def.args.safeParse(args, params);
        if (!parsedArgs.success) {
          throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
        }
        const result = Reflect.apply(fn, this, parsedArgs.data);
        const parsedReturns = me._def.returns.safeParse(result, params);
        if (!parsedReturns.success) {
          throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
        }
        return parsedReturns.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...items) {
    return new ZodFunction({
      ...this._def,
      args: ZodTuple.create(items).rest(ZodUnknown.create())
    });
  }
  returns(returnType) {
    return new ZodFunction({
      ...this._def,
      returns: returnType
    });
  }
  implement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  strictImplement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  static create(args, returns, params) {
    return new ZodFunction({
      args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
      returns: returns || ZodUnknown.create(),
      typeName: ZodFirstPartyTypeKind.ZodFunction,
      ...processCreateParams(params)
    });
  }
}

class ZodLazy extends ZodType {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
}
ZodLazy.create = (getter, params) => {
  return new ZodLazy({
    getter,
    typeName: ZodFirstPartyTypeKind.ZodLazy,
    ...processCreateParams(params)
  });
};

class ZodLiteral extends ZodType {
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_literal,
        expected: this._def.value
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
}
ZodLiteral.create = (value, params) => {
  return new ZodLiteral({
    value,
    typeName: ZodFirstPartyTypeKind.ZodLiteral,
    ...processCreateParams(params)
  });
};
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}

class ZodEnum extends ZodType {
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(this._def.values);
    }
    if (!this._cache.has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return ZodEnum.create(values, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values, newDef = this._def) {
    return ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
      ...this._def,
      ...newDef
    });
  }
}
ZodEnum.create = createZodEnum;

class ZodNativeEnum extends ZodType {
  _parse(input) {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(util.getValidEnumValues(this._def.values));
    }
    if (!this._cache.has(input.data)) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get enum() {
    return this._def.values;
  }
}
ZodNativeEnum.create = (values, params) => {
  return new ZodNativeEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
    ...processCreateParams(params)
  });
};

class ZodPromise extends ZodType {
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK(promisified.then((data) => {
      return this._def.type.parseAsync(data, {
        path: ctx.path,
        errorMap: ctx.common.contextualErrorMap
      });
    }));
  }
}
ZodPromise.create = (schema, params) => {
  return new ZodPromise({
    type: schema,
    typeName: ZodFirstPartyTypeKind.ZodPromise,
    ...processCreateParams(params)
  });
};

class ZodEffects extends ZodType {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: (arg) => {
        addIssueToContext(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      },
      get path() {
        return ctx.path;
      }
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID;
          const result = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        });
      } else {
        if (status.value === "aborted")
          return INVALID;
        const result = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        if (result.status === "aborted")
          return INVALID;
        if (result.status === "dirty")
          return DIRTY(result.value);
        if (status.value === "dirty")
          return DIRTY(result.value);
        return result;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = (acc) => {
        const result = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result);
        }
        if (result instanceof Promise) {
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        }
        return acc;
      };
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inner.status === "aborted")
          return INVALID;
        if (inner.status === "dirty")
          status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          return executeRefinement(inner.value).then(() => {
            return { status: status.value, value: inner.value };
          });
        });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid(base))
          return INVALID;
        const result = effect.transform(base.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
        }
        return { status: status.value, value: result };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
          if (!isValid(base))
            return INVALID;
          return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
            status: status.value,
            value: result
          }));
        });
      }
    }
    util.assertNever(effect);
  }
}
ZodEffects.create = (schema, effect, params) => {
  return new ZodEffects({
    schema,
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    effect,
    ...processCreateParams(params)
  });
};
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
  return new ZodEffects({
    schema,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    ...processCreateParams(params)
  });
};
class ZodOptional extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined) {
      return OK(undefined);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
}
ZodOptional.create = (type, params) => {
  return new ZodOptional({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodOptional,
    ...processCreateParams(params)
  });
};

class ZodNullable extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.null) {
      return OK(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
}
ZodNullable.create = (type, params) => {
  return new ZodNullable({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodNullable,
    ...processCreateParams(params)
  });
};

class ZodDefault extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
}
ZodDefault.create = (type, params) => {
  return new ZodDefault({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams(params)
  });
};

class ZodCatch extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    };
    const result = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    if (isAsync(result)) {
      return result.then((result2) => {
        return {
          status: "valid",
          value: result2.status === "valid" ? result2.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      });
    } else {
      return {
        status: "valid",
        value: result.status === "valid" ? result.value : this._def.catchValue({
          get error() {
            return new ZodError(newCtx.common.issues);
          },
          input: newCtx.data
        })
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
}
ZodCatch.create = (type, params) => {
  return new ZodCatch({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams(params)
  });
};

class ZodNaN extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
}
ZodNaN.create = (params) => {
  return new ZodNaN({
    typeName: ZodFirstPartyTypeKind.ZodNaN,
    ...processCreateParams(params)
  });
};
var BRAND = Symbol("zod_brand");

class ZodBranded extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
}

class ZodPipeline extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      };
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      if (inResult.status === "aborted")
        return INVALID;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      }
    }
  }
  static create(a, b) {
    return new ZodPipeline({
      in: a,
      out: b,
      typeName: ZodFirstPartyTypeKind.ZodPipeline
    });
  }
}

class ZodReadonly extends ZodType {
  _parse(input) {
    const result = this._def.innerType._parse(input);
    const freeze = (data) => {
      if (isValid(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    };
    return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
  }
  unwrap() {
    return this._def.innerType;
  }
}
ZodReadonly.create = (type, params) => {
  return new ZodReadonly({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodReadonly,
    ...processCreateParams(params)
  });
};
function cleanParams(params, data) {
  const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
function custom(check, _params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      const r = check(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          if (!r2) {
            const params = cleanParams(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
var late = {
  object: ZodObject.lazycreate
};
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind2) {
  ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
var instanceOfType = (cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom((data) => data instanceof cls, params);
var stringType = ZodString.create;
var numberType = ZodNumber.create;
var nanType = ZodNaN.create;
var bigIntType = ZodBigInt.create;
var booleanType = ZodBoolean.create;
var dateType = ZodDate.create;
var symbolType = ZodSymbol.create;
var undefinedType = ZodUndefined.create;
var nullType = ZodNull.create;
var anyType = ZodAny.create;
var unknownType = ZodUnknown.create;
var neverType = ZodNever.create;
var voidType = ZodVoid.create;
var arrayType = ZodArray.create;
var objectType = ZodObject.create;
var strictObjectType = ZodObject.strictCreate;
var unionType = ZodUnion.create;
var discriminatedUnionType = ZodDiscriminatedUnion.create;
var intersectionType = ZodIntersection.create;
var tupleType = ZodTuple.create;
var recordType = ZodRecord.create;
var mapType = ZodMap.create;
var setType = ZodSet.create;
var functionType = ZodFunction.create;
var lazyType = ZodLazy.create;
var literalType = ZodLiteral.create;
var enumType = ZodEnum.create;
var nativeEnumType = ZodNativeEnum.create;
var promiseType = ZodPromise.create;
var effectsType = ZodEffects.create;
var optionalType = ZodOptional.create;
var nullableType = ZodNullable.create;
var preprocessType = ZodEffects.createWithPreprocess;
var pipelineType = ZodPipeline.create;
var ostring = () => stringType().optional();
var onumber = () => numberType().optional();
var oboolean = () => booleanType().optional();
var coerce = {
  string: (arg) => ZodString.create({ ...arg, coerce: true }),
  number: (arg) => ZodNumber.create({ ...arg, coerce: true }),
  boolean: (arg) => ZodBoolean.create({
    ...arg,
    coerce: true
  }),
  bigint: (arg) => ZodBigInt.create({ ...arg, coerce: true }),
  date: (arg) => ZodDate.create({ ...arg, coerce: true })
};
var NEVER = INVALID;
// packages/shared/src/events.ts
var BaseHookSchema = exports_external.object({
  session_id: exports_external.string(),
  transcript_path: exports_external.string(),
  cwd: exports_external.string(),
  hook_event_name: exports_external.string(),
  permission_mode: exports_external.enum([
    "default",
    "plan",
    "acceptEdits",
    "auto",
    "dontAsk",
    "bypassPermissions"
  ]),
  agent_id: exports_external.string().optional(),
  agent_type: exports_external.string().optional()
});
var SessionStartSchema = BaseHookSchema.extend({
  hook_event_name: exports_external.literal("SessionStart"),
  model: exports_external.string().optional()
});
var SessionEndSchema = BaseHookSchema.extend({
  hook_event_name: exports_external.literal("SessionEnd")
});
var UserPromptSubmitSchema = BaseHookSchema.extend({
  hook_event_name: exports_external.literal("UserPromptSubmit"),
  prompt: exports_external.string()
});
var UserPromptExpansionSchema = BaseHookSchema.extend({
  hook_event_name: exports_external.literal("UserPromptExpansion"),
  expansion: exports_external.string().optional()
});
var PreToolUseSchema = BaseHookSchema.extend({
  hook_event_name: exports_external.literal("PreToolUse"),
  tool_name: exports_external.string(),
  tool_input: exports_external.unknown()
});
var PostToolUseSchema = BaseHookSchema.extend({
  hook_event_name: exports_external.literal("PostToolUse"),
  tool_name: exports_external.string(),
  tool_input: exports_external.unknown(),
  tool_response: exports_external.unknown()
});
var PostToolUseFailureSchema = BaseHookSchema.extend({
  hook_event_name: exports_external.literal("PostToolUseFailure"),
  tool_name: exports_external.string(),
  tool_input: exports_external.unknown(),
  error: exports_external.string()
});
var SubagentStartSchema = BaseHookSchema.extend({
  hook_event_name: exports_external.literal("SubagentStart"),
  agent_type: exports_external.string(),
  prompt: exports_external.string(),
  subagent_id: exports_external.string(),
  parent_session_id: exports_external.string()
});
var SubagentStopSchema = BaseHookSchema.extend({
  hook_event_name: exports_external.literal("SubagentStop"),
  agent_type: exports_external.string(),
  subagent_id: exports_external.string(),
  stop_reason: exports_external.enum(["completed", "error", "user_interrupt"]),
  output: exports_external.string()
});
var StopSchema = BaseHookSchema.extend({
  hook_event_name: exports_external.literal("Stop"),
  stop_reason: exports_external.string().optional()
});
var NotificationSchema = BaseHookSchema.extend({
  hook_event_name: exports_external.literal("Notification"),
  message: exports_external.string(),
  level: exports_external.string().optional()
});
var InstructionsLoadedSchema = BaseHookSchema.extend({
  hook_event_name: exports_external.literal("InstructionsLoaded"),
  file_path: exports_external.string(),
  memory_type: exports_external.enum(["Project", "User", "Local", "Managed"]),
  load_reason: exports_external.string(),
  globs: exports_external.array(exports_external.string()).optional(),
  trigger_file_path: exports_external.string().optional(),
  parent_file_path: exports_external.string().optional()
});
var PreCompactSchema = BaseHookSchema.extend({
  hook_event_name: exports_external.literal("PreCompact")
});
var PostCompactSchema = BaseHookSchema.extend({
  hook_event_name: exports_external.literal("PostCompact")
});
var HookEventSchema = exports_external.discriminatedUnion("hook_event_name", [
  SessionStartSchema,
  SessionEndSchema,
  UserPromptSubmitSchema,
  UserPromptExpansionSchema,
  PreToolUseSchema,
  PostToolUseSchema,
  PostToolUseFailureSchema,
  SubagentStartSchema,
  SubagentStopSchema,
  StopSchema,
  NotificationSchema,
  InstructionsLoadedSchema,
  PreCompactSchema,
  PostCompactSchema
]);
// packages/shared/src/plan.ts
function parsePlan(content, path) {
  const lines = content.split(`
`);
  let title = "";
  const tasks = [];
  let currentTask = null;
  let inFilesBlock = false;
  for (const line of lines) {
    if (!title && line.startsWith("# ")) {
      title = line.slice(2).trim();
      continue;
    }
    const taskMatch = line.match(/^### Task (\d+):\s*(.+)/);
    if (taskMatch) {
      currentTask = {
        index: Number.parseInt(taskMatch[1], 10),
        title: taskMatch[2].trim(),
        files: [],
        steps: []
      };
      tasks.push(currentTask);
      inFilesBlock = false;
      continue;
    }
    if (!currentTask)
      continue;
    if (line.trim() === "**Files:**") {
      inFilesBlock = true;
      continue;
    }
    if (inFilesBlock) {
      if (line.trim() === "") {
        inFilesBlock = false;
        continue;
      }
      if (line.startsWith("- ")) {
        currentTask.files.push(line.slice(2).trim());
        continue;
      }
    }
    const todoMatch = line.match(/^- \[ \] (.+)/);
    if (todoMatch) {
      currentTask.steps.push({
        index: currentTask.steps.length + 1,
        label: todoMatch[1].trim(),
        state: "todo"
      });
      continue;
    }
    const doneMatch = line.match(/^- \[x\] (.+)/i);
    if (doneMatch) {
      currentTask.steps.push({
        index: currentTask.steps.length + 1,
        label: doneMatch[1].trim(),
        state: "done"
      });
    }
  }
  return { path, title, tasks };
}
// packages/shared/src/story.ts
var StoryFrontmatterSchema = exports_external.object({
  id: exports_external.string(),
  title: exports_external.string(),
  status: exports_external.string(),
  created: exports_external.string(),
  size: exports_external.enum(["XS", "S", "M", "L", "XL"]).optional(),
  linked_spec: exports_external.string().optional(),
  linked_plan: exports_external.string().optional()
});
function parseFrontmatter(content) {
  const parts = content.split("---");
  if (parts.length < 3)
    return null;
  const yamlBlock = parts[1].trim();
  const record = {};
  for (const line of yamlBlock.split(`
`)) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1)
      continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key && value)
      record[key] = value;
  }
  const result = StoryFrontmatterSchema.safeParse(record);
  return result.success ? result.data : null;
}
// packages/server/src/stories/template.ts
function scaffoldStory(id, title, created) {
  return `---
id: ${id}
title: ${title}
status: backlog
created: ${created}
---

## Story

As a [...], I want [...], so that [...].

## Acceptance criteria

- [ ] ...

## Notes

(optional)
`;
}

// packages/server/src/stories/index.ts
function isValidStoryId(id) {
  return /^US\d+$/.test(id) || /^US-\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(id);
}
function updateFrontmatterField(yaml, key, value) {
  const regex = new RegExp(`^(${key}:).*$`, "m");
  return regex.test(yaml) ? yaml.replace(regex, `$1 ${value}`) : `${yaml}
${key}: ${value}`;
}
function applyPatch(content, patch) {
  const parts = content.split("---");
  if (parts.length < 3)
    return content;
  let yaml = parts[1];
  if (patch.title)
    yaml = updateFrontmatterField(yaml, "title", patch.title);
  if (patch.status)
    yaml = updateFrontmatterField(yaml, "status", patch.status);
  if (patch.size !== undefined)
    yaml = updateFrontmatterField(yaml, "size", patch.size ?? "");
  if (patch.linked_spec !== undefined)
    yaml = updateFrontmatterField(yaml, "linked_spec", patch.linked_spec ?? "");
  if (patch.linked_plan !== undefined)
    yaml = updateFrontmatterField(yaml, "linked_plan", patch.linked_plan ?? "");
  if (!yaml.endsWith(`
`))
    yaml += `
`;
  return ["", yaml, ...parts.slice(2)].join("---");
}

class StoryService {
  cwd;
  db;
  bus;
  storiesDir;
  watcher = null;
  reconcileTimer = null;
  constructor(cwd, db, bus) {
    this.cwd = cwd;
    this.db = db;
    this.bus = bus;
    this.storiesDir = join3(cwd, "docs/superpowers/stories");
  }
  async start() {
    await mkdir2(this.storiesDir, { recursive: true });
    await this.loadAll();
    this.watcher = watch(this.storiesDir, { persistent: false }, (_event, filename) => {
      this.handleFileEvent(filename).catch((err) => console.error("[StoryService] handleFileEvent error:", err));
    });
    this.reconcileTimer = setInterval(() => {
      this.reconcile().catch((err) => console.error("[StoryService] reconcile error:", err));
    }, 30000);
  }
  stop() {
    this.watcher?.close();
    this.watcher = null;
    if (this.reconcileTimer !== null) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = null;
    }
  }
  list() {
    return this.db.query(`SELECT id, file_path, title, size, status, linked_spec_path, linked_plan_path, created_at, updated_at
         FROM stories WHERE status != 'archived' ORDER BY created_at DESC`).all();
  }
  get(id) {
    if (!isValidStoryId(id))
      return null;
    const row = this.db.query("SELECT * FROM stories WHERE id = ?").get(id);
    if (!row)
      return null;
    let content;
    try {
      content = readFileSync(row.file_path, "utf-8");
    } catch {
      return null;
    }
    const parts = content.split("---");
    const body = parts.slice(2).join("---").trim();
    return { ...row, body };
  }
  async create(title) {
    const { n } = this.db.query("SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM stories").get();
    const id = `US${n}`;
    const filePath = join3(this.storiesDir, `${id}.md`);
    const today = new Date().toISOString().slice(0, 10);
    await writeFile2(filePath, scaffoldStory(id, title, today), "utf-8");
    const ts = Date.now();
    this.db.transaction(() => {
      this.db.run(`INSERT INTO stories (id, file_path, title, size, status, linked_spec_path, linked_plan_path, created_at, updated_at, seq)
         VALUES (?, ?, ?, NULL, 'backlog', NULL, NULL, ?, ?, ?)`, [id, filePath, title, ts, ts, n]);
    })();
    this.bus.publish({ type: "story.changed", data: { id, op: "create" } });
    const created = this.db.query("SELECT * FROM stories WHERE id = ?").get(id);
    if (!created)
      throw new Error(`Story not found after insert: ${id}`);
    return created;
  }
  async update(id, patch) {
    if (!isValidStoryId(id))
      return null;
    const row = this.db.query("SELECT file_path FROM stories WHERE id = ?").get(id);
    if (!row)
      return null;
    const content = await readFile(row.file_path, "utf-8");
    await writeFile2(row.file_path, applyPatch(content, patch), "utf-8");
    const ts = Date.now();
    const sets = ["updated_at = ?"];
    const vals = [ts];
    if (patch.title) {
      sets.push("title = ?");
      vals.push(patch.title);
    }
    if (patch.status) {
      sets.push("status = ?");
      vals.push(patch.status);
    }
    if (patch.size !== undefined) {
      sets.push("size = ?");
      vals.push(patch.size ?? null);
    }
    if (patch.linked_spec !== undefined) {
      sets.push("linked_spec_path = ?");
      vals.push(patch.linked_spec || null);
    }
    if (patch.linked_plan !== undefined) {
      sets.push("linked_plan_path = ?");
      vals.push(patch.linked_plan || null);
    }
    vals.push(id);
    this.db.run(`UPDATE stories SET ${sets.join(", ")} WHERE id = ?`, vals);
    this.bus.publish({ type: "story.changed", data: { id, op: "update" } });
    const updated = this.db.query("SELECT * FROM stories WHERE id = ?").get(id);
    if (!updated)
      throw new Error(`Story not found after update: ${id}`);
    return updated;
  }
  async archive(id) {
    if (!isValidStoryId(id))
      return;
    const row = this.db.query("SELECT file_path FROM stories WHERE id = ?").get(id);
    if (!row)
      return;
    const archiveDir = join3(this.storiesDir, "archive");
    await mkdir2(archiveDir, { recursive: true });
    await rename(row.file_path, join3(archiveDir, `${id}.md`));
    this.db.run("UPDATE stories SET status = 'archived', updated_at = ? WHERE id = ?", [Date.now(), id]);
    this.bus.publish({ type: "story.changed", data: { id, op: "delete" } });
  }
  async handleFileEvent(filename) {
    if (!filename?.endsWith(".md"))
      return;
    const filePath = join3(this.storiesDir, filename);
    const content = await readFile(filePath, "utf-8").catch(() => null);
    if (content === null) {
      const row = this.db.query("SELECT id FROM stories WHERE file_path = ? AND status != 'archived'").get(filePath);
      if (!row)
        return;
      this.db.run("DELETE FROM stories WHERE file_path = ?", [filePath]);
      this.bus.publish({
        type: "story.changed",
        data: { id: row.id, op: "delete" }
      });
      return;
    }
    const fm = parseFrontmatter(content);
    if (!fm)
      return;
    this.upsertRow(fm.id, filePath, fm.title, fm.status, fm.size ?? null, fm.linked_spec ?? null, fm.linked_plan ?? null);
    this.bus.publish({
      type: "story.changed",
      data: { id: fm.id, op: "update" }
    });
  }
  async reconcile() {
    const entries = await readdir(this.storiesDir).catch(() => []);
    const onDiskPaths = new Set(entries.filter((n) => n.endsWith(".md")).map((n) => join3(this.storiesDir, n)));
    const rows = this.db.query("SELECT id, file_path FROM stories WHERE status != 'archived'").all();
    for (const row of rows) {
      if (!onDiskPaths.has(row.file_path)) {
        this.db.run("DELETE FROM stories WHERE id = ?", [row.id]);
        this.bus.publish({
          type: "story.changed",
          data: { id: row.id, op: "delete" }
        });
      }
    }
    const knownPaths = new Set(rows.map((r) => r.file_path));
    for (const filePath of onDiskPaths) {
      if (knownPaths.has(filePath))
        continue;
      const content = await readFile(filePath, "utf-8").catch(() => null);
      if (content === null)
        continue;
      const fm = parseFrontmatter(content);
      if (!fm)
        continue;
      this.upsertRow(fm.id, filePath, fm.title, fm.status, fm.size ?? null, fm.linked_spec ?? null, fm.linked_plan ?? null);
      this.bus.publish({
        type: "story.changed",
        data: { id: fm.id, op: "create" }
      });
    }
  }
  async loadAll() {
    const entries = await readdir(this.storiesDir).catch(() => []);
    const onDiskPaths = new Set;
    for (const name of entries) {
      if (!name.endsWith(".md"))
        continue;
      const filePath = join3(this.storiesDir, name);
      onDiskPaths.add(filePath);
      const content = await readFile(filePath, "utf-8").catch(() => null);
      if (content === null)
        continue;
      const fm = parseFrontmatter(content);
      if (!fm)
        continue;
      this.upsertRow(fm.id, filePath, fm.title, fm.status, fm.size ?? null, fm.linked_spec ?? null, fm.linked_plan ?? null);
    }
    const rows = this.db.query("SELECT id, file_path FROM stories WHERE status != 'archived'").all();
    for (const row of rows) {
      if (!onDiskPaths.has(row.file_path)) {
        this.db.run("DELETE FROM stories WHERE id = ?", [row.id]);
      }
    }
  }
  upsertRow(id, filePath, title, status, size, linkedSpec, linkedPlan) {
    const ts = Date.now();
    this.db.run(`INSERT OR REPLACE INTO stories (id, file_path, title, size, status, linked_spec_path, linked_plan_path, created_at, updated_at, seq)
       VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM stories WHERE id = ?), ?), ?, (SELECT seq FROM stories WHERE id = ?))`, [id, filePath, title, size, status, linkedSpec, linkedPlan, id, ts, ts, id]);
  }
}

// packages/server/src/api/handoff.ts
function relativeAge(generatedAt, now) {
  const diff = Math.max(0, now - generatedAt);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1)
    return "just now";
  const hours = Math.floor(diff / 3600000);
  if (hours < 1)
    return `${minutes}m ago`;
  const days = Math.floor(diff / 86400000);
  if (days < 1)
    return `${hours}h ago`;
  return `${days}d ago`;
}
async function mountHandoffRoutes(req, url, handoff) {
  if (req.method === "GET" && url.pathname === "/api/handoffs/latest") {
    const story = url.searchParams.get("story") ?? undefined;
    const result = await handoff.latestWithContext(story);
    if (!result) {
      return Response.json({ error: "no handoff found" }, { status: 404 });
    }
    const age = relativeAge(result.generated_at, Date.now());
    return Response.json({ ...result, age });
  }
  if (req.method === "GET" && url.pathname === "/api/handoffs") {
    const rows = handoff.list();
    return Response.json(rows);
  }
  const match = url.pathname.match(/^\/api\/handoff\/(.+)$/);
  if (match && req.method === "POST") {
    const storyId = decodeURIComponent(match[1]);
    if (!isValidStoryId(storyId)) {
      return Response.json({ error: "invalid story ID" }, { status: 400 });
    }
    const result = await handoff.generate(storyId);
    if (result === null) {
      return Response.json({ error: `Story not found: ${storyId}` }, { status: 404 });
    }
    return Response.json(result, { status: 201 });
  }
  return Response.json({ error: "not found" }, { status: 404 });
}

// packages/server/src/api/sessions.ts
async function mountSessionRoutes(req, url, db, bus) {
  if (req.method === "GET" && url.pathname === "/api/sessions") {
    const sessions = db.query("SELECT * FROM sessions ORDER BY started_at DESC").all();
    return Response.json(sessions);
  }
  if (req.method === "GET" && url.pathname === "/api/sessions/current") {
    const session = db.query("SELECT id, active_story_id, inferred_phase FROM sessions ORDER BY started_at DESC LIMIT 1").get();
    return Response.json({
      sessionId: session?.id ?? null,
      activeStoryId: session?.active_story_id ?? null,
      phase: session?.inferred_phase ?? null
    });
  }
  const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
  if (req.method === "GET" && sessionMatch) {
    const id = decodeURIComponent(sessionMatch[1]);
    const session = db.query("SELECT * FROM sessions WHERE id = ?").get(id);
    if (!session)
      return Response.json({ error: "not found" }, { status: 404 });
    const events = db.query("SELECT * FROM events WHERE session_id = ? ORDER BY ts DESC LIMIT 50").all(id);
    return Response.json({ ...session, events });
  }
  if (req.method === "GET" && url.pathname === "/api/events") {
    const sessionFilter = url.searchParams.get("session");
    const since = Number(url.searchParams.get("since") ?? 0);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 200);
    const events = sessionFilter ? db.query("SELECT * FROM events WHERE session_id = ? AND ts > ? ORDER BY ts ASC LIMIT ?").all(sessionFilter, since, limit) : db.query("SELECT * FROM events WHERE ts > ? ORDER BY ts ASC LIMIT ?").all(since, limit);
    const cursor = events.length > 0 ? events[events.length - 1].ts : since;
    return Response.json({ events, cursor });
  }
  if (req.method === "PATCH" && url.pathname === "/api/sessions/current") {
    let body;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "invalid JSON" }, { status: 400 });
    }
    const session = db.query("SELECT id FROM sessions ORDER BY started_at DESC LIMIT 1").get();
    if (!session)
      return Response.json({ error: "no session" }, { status: 404 });
    db.run("UPDATE sessions SET active_story_id = ? WHERE id = ?", [
      body.active_story_id ?? null,
      session.id
    ]);
    bus.publish({
      type: "session.updated",
      data: { activeStoryId: body.active_story_id ?? null }
    });
    return Response.json({ ok: true });
  }
  return Response.json({ error: "not found" }, { status: 404 });
}

// packages/server/src/api/standup.ts
function mountStandupRoutes(req, url, standup) {
  if (req.method === "GET" && url.pathname === "/api/standup") {
    const today = new Date().toISOString().slice(0, 10);
    const date = url.searchParams.get("date") ?? today;
    return Response.json(standup.generate(date));
  }
  return Response.json({ error: "not found" }, { status: 404 });
}

// packages/server/src/api/stories.ts
async function mountStoryRoutes(req, url, stories) {
  if (req.method === "GET" && url.pathname === "/api/stories") {
    return Response.json(stories.list());
  }
  if (req.method === "POST" && url.pathname === "/api/stories") {
    let body;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "invalid JSON" }, { status: 400 });
    }
    if (!body.title || typeof body.title !== "string") {
      return Response.json({ error: "title required" }, { status: 400 });
    }
    const story = await stories.create(body.title);
    return Response.json(story, { status: 201 });
  }
  const storyMatch = url.pathname.match(/^\/api\/stories\/([^/]+)$/);
  if (storyMatch) {
    const id = decodeURIComponent(storyMatch[1]);
    if (req.method === "GET") {
      const detail = stories.get(id);
      if (!detail)
        return Response.json({ error: "not found" }, { status: 404 });
      return Response.json(detail);
    }
    if (req.method === "PATCH") {
      let patch;
      try {
        patch = await req.json();
      } catch {
        return Response.json({ error: "invalid JSON" }, { status: 400 });
      }
      const updated = await stories.update(id, patch);
      if (!updated)
        return Response.json({ error: "not found" }, { status: 404 });
      return Response.json(updated);
    }
    if (req.method === "DELETE") {
      await stories.archive(id);
      return Response.json({});
    }
  }
  return Response.json({ error: "not found" }, { status: 404 });
}

// packages/server/src/superpowers/parser.ts
function parseSpec(content, path) {
  const titleLine = content.split(`
`).find((l) => l.startsWith("# "));
  const title = titleLine ? titleLine.slice(2).trim() : "";
  return { path, title, body: content };
}

// packages/server/src/api/superpowers.ts
function validatePath(raw) {
  const decoded = decodeURIComponent(raw);
  if (decoded.includes(".."))
    return null;
  return decoded;
}
function mountSuperpowersRoutes(req, url, watcher) {
  const planMatch = url.pathname.match(/^\/api\/plans\/(.+)$/);
  if (req.method === "GET" && planMatch) {
    const path = validatePath(planMatch[1]);
    if (!path)
      return Response.json({ error: "invalid path" }, { status: 400 });
    const plan = watcher.getParsedPlan(path);
    if (!plan)
      return Response.json({ error: "not found" }, { status: 404 });
    return Response.json(plan);
  }
  const specMatch = url.pathname.match(/^\/api\/specs\/(.+)$/);
  if (req.method === "GET" && specMatch) {
    const path = validatePath(specMatch[1]);
    if (!path)
      return Response.json({ error: "invalid path" }, { status: 400 });
    const body = watcher.getSpecBody(path);
    if (!body)
      return Response.json({ error: "not found" }, { status: 404 });
    return Response.json(parseSpec(body, path));
  }
  return Response.json({ error: "not found" }, { status: 404 });
}

// packages/server/src/api/index.ts
function mountApiRoutes(req, url, ctx) {
  if (url.pathname.startsWith("/api/sessions") || url.pathname === "/api/events") {
    return mountSessionRoutes(req, url, ctx.db, ctx.bus);
  }
  if (url.pathname.startsWith("/api/stories")) {
    return mountStoryRoutes(req, url, ctx.stories);
  }
  if (url.pathname.startsWith("/api/plans") || url.pathname.startsWith("/api/specs")) {
    return mountSuperpowersRoutes(req, url, ctx.watcher);
  }
  if (url.pathname === "/api/standup") {
    return mountStandupRoutes(req, url, ctx.standup);
  }
  if (url.pathname.startsWith("/api/handoff")) {
    return mountHandoffRoutes(req, url, ctx.handoff);
  }
  return Response.json({ error: "not found" }, { status: 404 });
}

// packages/server/src/store/index.ts
function upsertSession(db, event) {
  db.run(`INSERT INTO sessions (id, cwd, permission_mode, started_at, status)
     VALUES (?, ?, ?, ?, 'active')
     ON CONFLICT(id) DO NOTHING`, [event.session_id, event.cwd, event.permission_mode, Date.now()]);
}
function endSession(db, sessionId) {
  db.run(`UPDATE sessions SET status = 'ended', ended_at = ? WHERE id = ?`, [
    Date.now(),
    sessionId
  ]);
}
function persistEvent(db, event) {
  upsertSession(db, event);
  const subagentId = event.hook_event_name === "SubagentStart" || event.hook_event_name === "SubagentStop" ? event.subagent_id : null;
  db.run(`INSERT INTO events (session_id, subagent_id, event_name, payload_json, ts)
     VALUES (?, ?, ?, ?, ?)`, [
    event.session_id,
    subagentId,
    event.hook_event_name,
    JSON.stringify(event),
    Date.now()
  ]);
  if (event.hook_event_name === "SessionEnd") {
    endSession(db, event.session_id);
  }
}

// packages/server/src/hooks/handlers.ts
var SKILL_PHASE_MAP = {
  "superpowers:brainstorming": "brainstorm",
  "superpowers:writing-specs": "spec",
  "superpowers:writing-plans": "plan",
  "superpowers:executing-plans": "implement",
  "superpowers:subagent-driven-development": "implement"
};
async function dispatchEvent(event, db, bus, handoff) {
  persistEvent(db, event);
  bus.publish({ type: "hook", data: event });
  if (event.hook_event_name === "PostToolUse" && event.tool_name === "Skill") {
    const skill = event.tool_input.skill;
    const phase = skill ? SKILL_PHASE_MAP[skill] : undefined;
    if (phase) {
      bus.publish({
        type: "phase.inferred",
        data: { sessionId: event.session_id, phase }
      });
    }
  }
  if (handoff && (event.hook_event_name === "SessionEnd" || event.hook_event_name === "PreCompact")) {
    handoff.generateForSession(event.session_id).catch(() => {});
  }
  return new Response("{}", { status: 200 });
}

// packages/server/src/hooks/index.ts
async function handleHookEvent(_eventName, body, db, bus, watcher, handoff) {
  let event;
  try {
    event = HookEventSchema.parse(body);
  } catch {
    return new Response(JSON.stringify({ error: "invalid payload" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
  if (watcher && event.hook_event_name === "PostToolUse" && (event.tool_name === "Edit" || event.tool_name === "Write")) {
    const input = event.tool_input;
    const filePath = input.file_path ?? input.path;
    if (filePath) {
      watcher.handleFileChange(filePath).catch(() => {});
    }
  }
  return dispatchEvent(event, db, bus, handoff);
}

// packages/server/src/security/index.ts
class RateLimiter {
  limit;
  windowMs;
  windows = new Map;
  constructor(limit = 1000, windowMs = 60000) {
    this.limit = limit;
    this.windowMs = windowMs;
  }
  allow(sessionId) {
    const now = Date.now();
    const w = this.windows.get(sessionId);
    if (!w || now - w.windowStart > this.windowMs) {
      this.windows.set(sessionId, { count: 1, windowStart: now });
      return true;
    }
    w.count++;
    return w.count <= this.limit;
  }
}
function checkAuth(req, serverPort, token) {
  const host = req.headers.get("host") ?? "";
  const validHosts = [
    `127.0.0.1:${serverPort}`,
    `localhost:${serverPort}`,
    "127.0.0.1",
    "localhost"
  ];
  if (!validHosts.includes(host)) {
    return new Response("Forbidden", { status: 403 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${token}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}

// packages/server/src/server.ts
function createServer(config) {
  const { token, db, bus } = config;
  const rateLimiter = config.rateLimit ? new RateLimiter(config.rateLimit.limit, config.rateLimit.windowMs) : new RateLimiter;
  return Bun.serve({
    hostname: "127.0.0.1",
    port: config.port,
    async fetch(req, server) {
      const url = new URL(req.url);
      if (req.method === "GET" && url.pathname === "/api/healthz") {
        return Response.json({ status: "ok" });
      }
      if (req.method === "GET" && url.pathname === "/api/status") {
        return Response.json({
          status: "ok",
          version: config.version ?? "unknown"
        });
      }
      if (req.method === "GET" && url.pathname === "/ws") {
        if (!config.wsServer)
          return new Response("Not Found", { status: 404 });
        const upgraded = config.wsServer.upgrade(req, server);
        if (upgraded)
          return;
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      const webDist = config.webDistPath ?? join4(import.meta.dir, "../../web/dist");
      if (req.method === "GET" && url.pathname.startsWith("/assets/")) {
        const file = Bun.file(join4(webDist, url.pathname));
        if (await file.exists())
          return new Response(file);
        return new Response("Not Found", { status: 404 });
      }
      if (req.method === "GET" && !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/hooks/")) {
        const file = Bun.file(join4(webDist, "/index.html"));
        if (await file.exists())
          return new Response(file);
      }
      const authError = checkAuth(req, server.port, token);
      if (authError)
        return authError;
      const hookMatch = url.pathname.match(/^\/hooks\/(\w+)$/);
      if (req.method === "POST" && hookMatch) {
        let body;
        try {
          body = await req.json();
        } catch {
          return new Response(JSON.stringify({ error: "invalid JSON" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }
        const sessionId = body?.session_id;
        if (sessionId && !rateLimiter.allow(sessionId)) {
          return new Response("{}", { status: 200 });
        }
        config.onActivity?.();
        return handleHookEvent(hookMatch[1], body, db, bus, config.apiCtx?.watcher, config.apiCtx?.handoff);
      }
      if (url.pathname.startsWith("/api/")) {
        config.onActivity?.();
        if (config.apiCtx)
          return mountApiRoutes(req, url, config.apiCtx);
        return new Response("{}", { status: 501 });
      }
      return new Response("Not Found", { status: 404 });
    },
    websocket: {
      message(ws, msg) {
        config.wsServer?.handleMessage(ws, msg);
      },
      open(ws) {
        config.onActivity?.();
        config.wsServer?.handleOpen(ws);
      },
      close(ws) {
        config.wsServer?.handleClose(ws);
      }
    }
  });
}

// packages/server/src/store/migrate.ts
import { readFile as readFile2, readdir as readdir2 } from "fs/promises";
import { join as join5 } from "path";
async function runMigrations(db, migrationsDir) {
  db.run(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT    PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);
  const files = (await readdir2(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const already = db.query("SELECT 1 FROM _migrations WHERE name = ?").get(file);
    if (already)
      continue;
    const sql = await readFile2(join5(migrationsDir, file), "utf-8");
    db.exec(sql);
    db.run("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)", [
      file,
      Date.now()
    ]);
  }
}

// packages/server/src/standup/index.ts
class StandupService {
  db;
  constructor(db) {
    this.db = db;
  }
  generate(date) {
    const dayStart = new Date(`${date}T00:00:00Z`).getTime();
    const shipStart = dayStart - 86400000;
    const shipEnd = dayStart;
    const shippedRows = this.db.query(`SELECT id, title, size FROM stories
         WHERE status = 'done' AND updated_at >= ? AND updated_at < ?`).all(shipStart, shipEnd);
    const shipped = shippedRows.map((r) => ({
      storyId: r.id,
      title: r.title,
      size: r.size ?? null,
      detail: "shipped"
    }));
    const wipRows = this.db.query(`SELECT id, title, size FROM stories WHERE status = 'in-progress'`).all();
    const inProgress = wipRows.map((r) => ({
      storyId: r.id,
      title: r.title,
      size: r.size ?? null,
      detail: "in progress"
    }));
    const cutoff = shipStart;
    const blockerRows = this.db.query(`SELECT e.session_id, s.active_story_id,
                JSON_EXTRACT(e.payload_json, '$.tool_name') AS tool_name,
                COUNT(*) AS fail_count
         FROM events e
         JOIN sessions s ON e.session_id = s.id
         WHERE e.event_name = 'PostToolUseFailure'
           AND e.ts >= ?
         GROUP BY e.session_id, tool_name
         HAVING fail_count >= 3`).all(cutoff);
    const seenStories = new Set;
    const blockers = [];
    for (const row of blockerRows) {
      const sid = row.active_story_id;
      if (!sid || seenStories.has(sid))
        continue;
      seenStories.add(sid);
      const story = this.db.query(`SELECT title, size FROM stories WHERE id = ?`).get(sid);
      blockers.push({
        storyId: sid,
        title: story?.title ?? sid,
        size: story?.size ?? null,
        detail: `${row.tool_name} failing \u22653\xD7`
      });
    }
    return { date, shipped, inProgress, blockers };
  }
}

// packages/server/src/superpowers/index.ts
import { watch as watch2 } from "fs";
import { readFile as readFile3, readdir as readdir3 } from "fs/promises";
import { join as join6, resolve } from "path";

// packages/server/src/superpowers/diff.ts
function diffCheckboxState(prev, next) {
  const diffs = [];
  const taskCount = Math.min(prev.tasks.length, next.tasks.length);
  for (let t = 0;t < taskCount; t++) {
    const prevSteps = prev.tasks[t].steps;
    const nextSteps = next.tasks[t].steps;
    const stepCount = Math.min(prevSteps.length, nextSteps.length);
    for (let s = 0;s < stepCount; s++) {
      if (prevSteps[s].state !== nextSteps[s].state) {
        diffs.push({
          taskIndex: t + 1,
          stepIndex: s + 1,
          from: prevSteps[s].state,
          to: nextSteps[s].state
        });
      }
    }
  }
  return diffs;
}

// packages/server/src/superpowers/phase.ts
var PHASE_ORDER = ["brainstorm", "spec", "plan", "implement"];
function advancePhase(current, next) {
  if (!current)
    return next;
  return PHASE_ORDER.indexOf(next) > PHASE_ORDER.indexOf(current) ? next : current;
}

// packages/server/src/superpowers/index.ts
class SuperpowersWatcher {
  cwd;
  db;
  bus;
  plans = new Map;
  specs = new Map;
  watchers = [];
  retryTimer = null;
  storyLinker = null;
  constructor(cwd, db, bus) {
    this.cwd = cwd;
    this.db = db;
    this.bus = bus;
  }
  setStoryLinker(fn) {
    this.storyLinker = fn;
  }
  async start() {
    const plansDir = join6(this.cwd, "docs/superpowers/plans");
    const specsDir = join6(this.cwd, "docs/superpowers/specs");
    try {
      await this.loadDir(plansDir, true);
      await this.loadDir(specsDir, false);
      this.watchDir(plansDir);
      this.watchDir(specsDir);
    } catch {
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.start();
      }, 30000);
    }
  }
  stop() {
    for (const w of this.watchers)
      w.close();
    this.watchers = [];
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }
  getParsedPlan(path) {
    return this.plans.get(resolve(path)) ?? null;
  }
  getSpecBody(path) {
    return this.specs.get(resolve(path)) ?? null;
  }
  async handleFileChange(filePath) {
    const abs = resolve(filePath);
    const plansDir = resolve(join6(this.cwd, "docs/superpowers/plans"));
    const specsDir = resolve(join6(this.cwd, "docs/superpowers/specs"));
    let content;
    try {
      content = await readFile3(abs, "utf-8");
    } catch {
      return;
    }
    if (abs.startsWith(plansDir)) {
      const isNew = !this.plans.has(abs);
      const prev = this.plans.get(abs) ?? { path: abs, title: "", tasks: [] };
      const next = parsePlan(content, abs);
      const diffs = diffCheckboxState(prev, next);
      this.plans.set(abs, next);
      this.upsertPlan(abs, next);
      this.bus.publish({
        type: "plan.changed",
        data: { path: abs, tasks: next.tasks }
      });
      if (diffs.length > 0) {
        this.maybeAdvancePhase("implement");
      } else if (prev.tasks.length === 0 && next.tasks.length > 0) {
        this.maybeAdvancePhase("plan");
      }
      if (isNew)
        await this.maybeAutoLink("plan", abs);
    } else if (abs.startsWith(specsDir)) {
      const isNew = !this.specs.has(abs);
      this.specs.set(abs, content);
      this.bus.publish({ type: "spec.changed", data: { path: abs } });
      if (isNew) {
        this.maybeAdvancePhase("spec");
        await this.maybeAutoLink("spec", abs);
      }
    }
  }
  async maybeAutoLink(type, absPath) {
    if (!this.storyLinker)
      return;
    const session = this.db.query("SELECT active_story_id FROM sessions WHERE cwd = ? ORDER BY started_at DESC LIMIT 1").get(this.cwd);
    const storyId = session?.active_story_id;
    if (!storyId)
      return;
    const col = type === "spec" ? "linked_spec_path" : "linked_plan_path";
    const row = this.db.query(`SELECT ${col} FROM stories WHERE id = ?`).get(storyId);
    if (!row || row[col])
      return;
    await this.storyLinker(storyId, type, absPath);
  }
  async loadDir(dir, isPlan) {
    let entries;
    try {
      entries = await readdir3(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (!name.endsWith(".md"))
        continue;
      const abs = resolve(join6(dir, name));
      const content = await readFile3(abs, "utf-8").catch(() => null);
      if (!content)
        continue;
      if (isPlan) {
        const parsed = parsePlan(content, abs);
        this.plans.set(abs, parsed);
        this.upsertPlan(abs, parsed);
      } else {
        this.specs.set(abs, content);
      }
    }
  }
  watchDir(dir) {
    const absDir = resolve(dir);
    let debounce = null;
    try {
      const w = watch2(absDir, { persistent: false }, (_event, filename) => {
        if (!filename?.endsWith(".md"))
          return;
        if (debounce)
          clearTimeout(debounce);
        debounce = setTimeout(() => {
          this.handleFileChange(join6(absDir, filename));
        }, 200);
      });
      this.watchers.push(w);
    } catch {
      const timer = setInterval(async () => {
        const entries = await readdir3(absDir).catch(() => []);
        for (const name of entries) {
          if (name.endsWith(".md"))
            await this.handleFileChange(join6(absDir, name));
        }
      }, 5000);
      this.watchers.push({ close: () => clearInterval(timer) });
    }
  }
  upsertPlan(planPath, plan) {
    const ts = Date.now();
    this.db.run("DELETE FROM plan_tasks WHERE plan_path = ?", [planPath]);
    this.db.run("DELETE FROM plan_steps WHERE plan_path = ?", [planPath]);
    for (const task of plan.tasks) {
      this.db.run("INSERT INTO plan_tasks (plan_path, task_index, task_title, files_json, ts) VALUES (?, ?, ?, ?, ?)", [planPath, task.index, task.title, JSON.stringify(task.files), ts]);
      for (const step of task.steps) {
        this.db.run("INSERT INTO plan_steps (plan_path, task_index, step_index, step_label, state, ts) VALUES (?, ?, ?, ?, ?, ?)", [planPath, task.index, step.index, step.label, step.state, ts]);
      }
    }
  }
  maybeAdvancePhase(target) {
    const session = this.db.query(`SELECT id, inferred_phase FROM sessions WHERE cwd = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1`).get(this.cwd);
    if (!session)
      return;
    const current = session.inferred_phase ?? null;
    const next = advancePhase(current, target);
    if (next === current)
      return;
    this.db.run("UPDATE sessions SET inferred_phase = ? WHERE id = ?", [
      next,
      session.id
    ]);
    this.bus.publish({
      type: "phase.inferred",
      data: { sessionId: session.id, phase: next }
    });
  }
}

// packages/server/src/ws/index.ts
class WsServer {
  bus;
  token;
  sockets = new Set;
  unsubscribe = null;
  constructor(bus, token) {
    this.bus = bus;
    this.token = token;
    this.unsubscribe = bus.subscribe((event) => this.fanOut(event));
  }
  stop() {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
  upgrade(req, server) {
    return server.upgrade(req, {
      data: { topics: new Set, authenticated: false }
    });
  }
  handleOpen(ws) {
    this.sockets.add(ws);
  }
  handleClose(ws) {
    this.sockets.delete(ws);
  }
  handleMessage(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object")
      return;
    const m = msg;
    if (!ws.data.authenticated) {
      if (m.type === "auth" && m.token === this.token) {
        ws.data.authenticated = true;
      } else {
        ws.close(4001, "Unauthorized");
      }
      return;
    }
    if (m.type === "subscribe" && Array.isArray(m.topics)) {
      for (const t of m.topics)
        if (typeof t === "string")
          ws.data.topics.add(t);
    } else if (m.type === "unsubscribe" && Array.isArray(m.topics)) {
      for (const t of m.topics)
        if (typeof t === "string")
          ws.data.topics.delete(t);
    } else if (m.type === "ping") {
      ws.send(JSON.stringify({ type: "pong" }));
    }
  }
  fanOut(event) {
    const pairs = this.toWsMessages(event);
    for (const [msg, topic] of pairs) {
      const json = JSON.stringify(msg);
      for (const ws of this.sockets) {
        if (ws.data.topics.has(topic))
          ws.send(json);
      }
    }
  }
  toWsMessages(event) {
    switch (event.type) {
      case "hook": {
        const out = {
          type: "event",
          data: {
            id: 0,
            session_id: event.data.session_id,
            subagent_id: null,
            event_name: event.data.hook_event_name,
            payload_json: JSON.stringify(event.data),
            ts: Date.now()
          }
        };
        return [
          [out, "events"],
          [out, `events:${event.data.session_id}`]
        ];
      }
      case "plan.changed":
        return [
          [
            { type: "plan.changed", data: event.data },
            `plan:${event.data.path}`
          ]
        ];
      case "spec.changed":
        return [[{ type: "spec.changed", data: event.data }, "specs"]];
      case "story.changed":
        return [[{ type: "story.changed", data: event.data }, "stories"]];
      case "phase.inferred":
        return [[{ type: "phase.inferred", data: event.data }, "session"]];
      case "session.updated":
        return [[{ type: "session.updated", data: event.data }, "session"]];
    }
  }
}

// packages/server/src/index.ts
var MIGRATIONS_DIR = join7(import.meta.dir, "../migrations");
var VERSION = "3.2.0";
async function startDaemon(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const dataDir = options.dataDir ?? join7(cwd, ".throughline");
  await mkdir3(dataDir, { recursive: true });
  const db = new Database(join7(dataDir, "throughline.db"));
  await runMigrations(db, MIGRATIONS_DIR);
  const tokenFile = join7(dataDir, "token");
  let token;
  try {
    token = (await readFile4(tokenFile, "utf8")).trim();
  } catch {
    token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");
    await writeFile3(tokenFile, token, { mode: 384 });
  }
  const bus = createBus();
  const watcher = new SuperpowersWatcher(cwd, db, bus);
  const stories = new StoryService(cwd, db, bus);
  const standupService = new StandupService(db);
  const handoffService = new HandoffService(cwd, db);
  const wsServer = new WsServer(bus, token);
  watcher.setStoryLinker((storyId, type, absPath) => stories.update(storyId, type === "spec" ? { linked_spec: absPath } : { linked_plan: absPath }).then(() => {}));
  await watcher.start();
  await stories.start();
  const apiCtx = { db, bus, watcher, stories, standup: standupService, handoff: handoffService };
  const activityRef = { fn: () => {} };
  const useRange = options.port === undefined;
  const defaultBase = options.portRangeStart ?? 47821;
  const startPort = options.port ?? defaultBase;
  const endPort = useRange ? defaultBase + 9 : startPort;
  let server;
  for (let port = startPort;port <= endPort; port++) {
    try {
      server = createServer({
        port,
        token,
        db,
        bus,
        wsServer,
        apiCtx,
        version: VERSION,
        webDistPath: options.webDistPath,
        onActivity: () => activityRef.fn(),
        rateLimit: options.rateLimit
      });
      break;
    } catch {
      if (port === endPort) {
        process.stderr.write(`Throughline: could not bind to any port in ${startPort}\u2013${endPort}
`);
        process.exit(1);
      }
    }
  }
  if (!server)
    throw new Error("Failed to bind server (unreachable)");
  const idleTimer = startIdleTimer(server, db);
  activityRef.fn = idleTimer.reset;
  registerShutdownHandler(server, db, idleTimer.cancel);
  await writeRuntimeJson(dataDir, {
    port: server.port,
    token,
    pid: process.pid,
    started_at: new Date().toISOString(),
    version: VERSION
  });
  const bound = server;
  return {
    port: server.port,
    token,
    db,
    stop: async () => {
      idleTimer.cancel();
      wsServer.stop();
      watcher.stop();
      stories.stop();
      db.close();
      bound.stop(true);
    }
  };
}
if (import.meta.main) {
  await startDaemon({ webDistPath: process.env.THROUGHLINE_WEB_DIST });
  console.log("Throughline daemon started.");
}
export {
  startDaemon,
  VERSION
};
