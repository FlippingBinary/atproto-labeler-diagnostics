import { AppBskyLabelerService, AtpAgent } from "@atproto/api";
import { emojify } from "node-emoji";
import { getDidKeyFromMultibase, IdResolver } from "@atproto/identity";
import "dotenv/config";
import { subscribeLabels } from "./subscribe.js";
import { queryLabels } from "./query.js";
import {
  InvalidArgumentError,
  InvalidOptionArgumentError,
  program,
} from "commander";
import { ensureValidDid, isValidHandle } from "@atproto/syntax";
import { oraPromise } from "ora";
import kit from "terminal-kit";
import chalk from "chalk";
import { EndpointAssessment } from "./util.js";
const terminal = kit.terminal;

const USER_AGENT =
  process.env.USER_AGENT ?? "github:FlippingBinary/atproto-labeler-diagnostics";
const ATPROTO_PDS = process.env.ATPROTO_PDS ?? "https://bsky.social";
const ATPROTO_PLC = process.env.ATPROTO_PLC ?? "https://plc.directory";

function normalizeUrl(rawUrl: string): string {
  let normalizedUrl: URL;
  try {
    const parsedUrl = new URL(rawUrl);
    if (parsedUrl != undefined) {
      normalizedUrl = parsedUrl;
    } else {
      throw new InvalidOptionArgumentError("Not a valid URL");
    }
  } catch (err) {
    throw new InvalidOptionArgumentError("Not a valid URL");
  }
  switch (normalizedUrl.protocol) {
    case "http:":
    case "https:":
      return normalizedUrl.toString();
    default:
      throw new InvalidOptionArgumentError("URL must use HTTP/HTTPS");
  }
}

function normalizeDid(rawDid: string): string {
  // ensureValidDid()
  let normalizedDid = rawDid.toLowerCase();
  try {
    ensureValidDid(normalizedDid);
  } catch (err) {
    throw new InvalidOptionArgumentError(`${err}`);
  }
  return normalizedDid;
}

function normalizeHandle(rawHandle: string): string {
  let normalizedHandle: string;
  if (rawHandle.startsWith("@")) {
    normalizedHandle = rawHandle.toLowerCase().slice(1);
  } else {
    normalizedHandle = rawHandle.toLowerCase();
  }
  if (!isValidHandle(normalizedHandle)) {
    throw new InvalidArgumentError("Not a valid handle");
  }
  return normalizedHandle;
}

function normalizeKey(rawKey: string): string {
  if (rawKey.startsWith("did:")) {
    // Assume it's a valid DID key
    return rawKey;
  }
  const keyDid = getDidKeyFromMultibase({
    type: "Multikey",
    publicKeyMultibase: rawKey,
  });
  if (keyDid !== undefined) {
    return keyDid;
  } else {
    throw new InvalidArgumentError("Not a valid validation key");
  }
}

function normalizeInt(rawInt: string): number {
  const normalizedInt = parseInt(rawInt);
  if (isNaN(normalizedInt)) {
    throw new InvalidArgumentError("Not an integer");
  }
  if (normalizedInt.toFixed(0) !== rawInt) {
    throw new InvalidArgumentError("Not a valid integer");
  }
  return normalizedInt;
}

async function main() {
  program
    .description("AT Protocol Labeler Diagnostics")
    .version("0.1.0")
    .option(
      "--agent <user-agent>",
      "The user-agent string to use when connecting to the labeler",
      USER_AGENT,
    )
    .option(
      "--depth <count>",
      "The target number of labels to validate",
      normalizeInt,
      10,
    )
    .option("--did <did>", "The labeler's DID", normalizeDid)
    .option(
      "--endpoint <url>",
      "The labeler's service endpoint URL",
      normalizeUrl,
    )
    .option("--full", "Run additional validation tests")
    .option(
      "--key <validation key>",
      "The labeler's validation key",
      normalizeKey,
    )
    .option("--pds <url>", "The PDS of the labeler", normalizeUrl, ATPROTO_PDS)
    .option(
      "--plc <url>",
      "The PLC directory is used to resolve DIDs",
      normalizeUrl,
      ATPROTO_PLC,
    )
    .argument("handle", "The labeler's handle", normalizeHandle)
    .addHelpText(
      "after",
      `
The following environment variables control the default behavior:
  $ATPROTO_PLC: Set the default for the '--plc' option.
`,
    )
    .showHelpAfterError("(add --help for additional information)")
    .parse();

  console.log(emojify(":labcoat: AT Protocol Labeler Diagnostics\n"));

  const options = program.opts();
  const handle: string = program.args[0];

  let did: string | undefined = options.did;
  let serviceUrl: URL | undefined =
    options.endpoint !== undefined ? new URL(options.endpoint) : undefined;
  let full: boolean = options.full;
  let validationKey: string | undefined = options.key;
  let plcUrl: string | undefined = options.plc;
  let pdsUrl: string | undefined = options.pds;
  let labels: Set<string> | undefined;
  let userAgent: string = options.agent;

  if (
    full ||
    did === undefined ||
    handle === undefined ||
    validationKey === undefined ||
    serviceUrl === undefined
  ) {
    const resolver = new IdResolver({ plcUrl });

    if (full || did === undefined) {
      try {
        did = await oraPromise(resolveHandle(resolver, handle, did), {
          prefixText: "Resolving DID from handle...",
          successText: (did) => chalk.green(` Found ${did}`),
          failText: (err) => chalk.red(` ${err}`),
        });
      } catch {}
    }

    if (
      did !== undefined &&
      (full ||
        handle === undefined ||
        validationKey === undefined ||
        serviceUrl === undefined)
    ) {
      try {
        const doc = await oraPromise(resolveDid(resolver, did), {
          prefixText: "Resolving service endpoint from DID...",
          successText: (doc) => chalk.green(` Found ${doc.serviceUrl}`),
          failText: (err) => chalk.red(` ${err}`),
        });
        pdsUrl = doc.pdsUrl;
        validationKey = doc.validationKey;
        serviceUrl = new URL(doc.serviceUrl);
      } catch {}
    }
  }

  if (pdsUrl !== undefined && did !== undefined) {
    try {
      labels = await oraPromise(resolvePolicies(pdsUrl, did), {
        prefixText: "Resolving label policies...",
        successText: (labels) =>
          chalk.green(` Found ${labels.size} label policies`),
        failText: (err) => chalk.red(` ${err}`),
      });
      // Print the labels
      terminal.wrapColumn({
        width: terminal.width - 15,
        x: 5,
      });
      const taggedLabels = Array.from(labels).map((label) =>
        emojify(`:label:\u00A0${label}`),
      );
      terminal.wrap(taggedLabels.join(", "));
      terminal("\n");
    } catch {}
  }

  if (serviceUrl !== undefined) {
    await assessEndpoint(
      "queryLabels",
      queryLabels({
        endpoint: serviceUrl,
        cursor: 0,
        limit: 10,
        uriPatterns: ["*"],
        registeredLabels: labels,
        key: validationKey,
        userAgent,
      }),
    );
    await assessEndpoint(
      "subscribeLabels",
      subscribeLabels({
        endpoint: serviceUrl,
        cursor: 0,
        registeredLabels: labels,
        key: validationKey,
        limit: 10,
        userAgent,
      }),
    );
  }

  console.log(emojify("\n:tada: All done!"));
  process.exit(0);
}

// Safety: This function may pass through an error thrown by `AtpAgent.resolveHandle`.
async function resolveHandle(
  resolver: IdResolver,
  handle: string,
  did?: string,
): Promise<string> {
  const resolvedDid = await resolver.handle.resolve(handle);
  if (resolvedDid === undefined) {
    throw `Resolver returned nothing`;
  }
  if (did !== undefined && did !== resolvedDid) {
    throw `Known DID ${did} does not match resolved DID ${resolvedDid}`;
  }
  return resolvedDid;
}

// Safety: This function may pass through an error thrown by `AtpAgent.com.atproto.repo.listRecords`.
async function resolvePolicies(
  pdsUrl: string,
  did: string,
): Promise<Set<string>> {
  const agent = new AtpAgent({
    service: pdsUrl,
  });
  const listedRecords = await agent.com.atproto.repo.listRecords({
    repo: did,
    collection: "app.bsky.labeler.service",
  });
  for (const record of listedRecords.data.records) {
    if (AppBskyLabelerService.isRecord(record.value)) {
      const validation = AppBskyLabelerService.validateRecord(record.value);
      if (validation.success) {
        return new Set(record.value.policies.labelValues);
      } else {
        throw "Labeler service record failed validation";
      }
    }
  }
  throw "Labeler service record missing";
}

// Get service endpoint and validation key from the DID and resolver
async function resolveDid(
  resolver: IdResolver,
  did: string,
): Promise<{ pdsUrl: string; serviceUrl: string; validationKey: string }> {
  const doc = await resolver.did.resolve(did);

  if (doc === null) {
    throw `The PLC doesn't recognize ${did}`;
  }
  if (doc.verificationMethod === undefined) {
    throw `The PLC doesn't have any verification keys for ${did}`;
  }
  if (doc.service === undefined) {
    throw `The PLC doesn't know of any services for ${did}`;
  }

  const verificationMethod = doc.verificationMethod.find(
    ({ id, publicKeyMultibase }) => {
      return id.endsWith("#atproto_label") && publicKeyMultibase !== undefined;
    },
  );

  if (!verificationMethod) {
    throw `The PLC doesn't know of a labeler service for ${did}`;
  }
  if (!verificationMethod.publicKeyMultibase) {
    throw `The PLC's verification method for ${did}'s labeler service is missing a key.`;
  }

  const validationKey = getDidKeyFromMultibase({
    type: verificationMethod.type,
    publicKeyMultibase: verificationMethod.publicKeyMultibase,
  });
  if (!validationKey) {
    throw "The PLC doesn't have a valid key for the labeler";
  }

  const pds = doc.service.find(({ id, serviceEndpoint }) => {
    return id === "#atproto_pds" && typeof serviceEndpoint === "string";
  });
  if (!pds) {
    throw "The PLC doesn't have a PDS endpoint for the labeler";
  }
  let pdsUrl: string;
  try {
    pdsUrl = new URL(pds.serviceEndpoint as string).toString();
  } catch {
    throw "Invalid PDS URL reported by PLC";
  }

  const service = doc.service.find(({ id, serviceEndpoint }) => {
    return id === "#atproto_labeler" && typeof serviceEndpoint === "string";
  });
  if (!service) {
    throw "The PLC doesn't have service endpoint for the labeler";
  }
  let serviceUrl: string;
  try {
    serviceUrl = new URL(service.serviceEndpoint as string).toString();
  } catch {
    throw "Invalid labeler endpoitn reported by PLC";
  }

  return {
    pdsUrl,
    serviceUrl,
    validationKey,
  };
}

async function assessEndpoint(
  name: string,
  action: PromiseLike<EndpointAssessment>,
): Promise<void> {
  try {
    const assessment = await oraPromise(
      Promise.race([
        action,
        new Promise<EndpointAssessment>((_resolve, reject) =>
          setTimeout(
            () => reject(`Timeout expired waiting for results`),
            15000,
          ),
        ),
      ]),
      {
        prefixText: `Testing service endpoint ${name}...`,
        successText: (success) => {
          if (success.flags.size > 0) {
            return chalk.green(
              ` ${success.total} scanned with ${success.flags.size} warnings`,
            );
          } else {
            return chalk.green(` ${success.total} scanned without warnings!`);
          }
        },
        failText: (fail) => chalk.red(` ${fail}`),
      },
    );
    if (assessment.flags.size) {
      // Print the flags
      terminal.wrapColumn({
        width: terminal.width - 15,
        x: 5,
      });
      for (const [flag, count] of assessment.flags) {
        terminal.wrap(`${flag} (x${count})`);
      }
      terminal("\n");
    }
  } catch {}
}

main();
