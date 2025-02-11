import { cborEncode } from "@atproto/common";
import { verifySignature } from "@atproto/crypto";
import { Agent, ComAtprotoLabelDefs, Label } from "@atproto/api";
import { EndpointAssessment } from "./util.js";
import { validateLabel } from "@atproto/api/dist/client/types/com/atproto/label/defs.js";

type QueryLabels = {
  cursor: number;
  endpoint: URL;
  key?: string;
  limit?: number;
  registeredLabels?: Set<string>;
  uriPatterns: string[];
  userAgent: string;
};

export async function queryLabels({
  endpoint,
  cursor,
  uriPatterns,
  limit,
  registeredLabels,
  key,
  userAgent,
}: QueryLabels): Promise<EndpointAssessment> {
  let assess = new EndpointAssessment();
  let labels: ComAtprotoLabelDefs.Label[] = [];

  try {
    const agent = new Agent(endpoint);

    const res = await agent.com.atproto.label.queryLabels(
      {
        uriPatterns,
        cursor: cursor.toString(),
        limit,
      },
      {
        headers: {
          "User-Agent": userAgent,
        },
      },
    );

    labels = res.data.labels;
  } catch (err) {
    throw `Query endpoint rejected request: ${err}`;
  }

  for (const label of labels) {
    const labelValidation = validateLabel(label);
    if (labelValidation.success) {
      const { ver, src, uri, cid, val, neg, cts, exp, sig, ...overflow } =
        label;
      const signableLabel: Label = { src, uri, val, cts };
      if (ver !== undefined) {
        signableLabel.ver = ver;
      }
      if (cid !== undefined) {
        signableLabel.cid = cid;
      }
      if (neg !== undefined) {
        signableLabel.neg = neg;
      }
      if (exp !== undefined) {
        signableLabel.exp = exp;
      }
      if (sig !== undefined && key !== undefined) {
        try {
          const encodedLabel = cborEncode(signableLabel);
          if (await verifySignature(key, encodedLabel, sig)) {
            if (
              registeredLabels !== undefined &&
              !registeredLabels.has(label.val)
            ) {
              assess.addFlag(
                `Label assigned an unregistered value ${label.val}`,
              );
            } else {
              assess.addPassed();
            }
          } else {
            const unrecognizedFields = Object.keys(overflow);
            if (unrecognizedFields.length > 0) {
              assess.addFlag(
                `Invalid signature on label with non-standard fields [${Object.keys(overflow).join(", ")}]`,
              );
            } else {
              assess.addFlag(
                `Invalid signature on label with only standard fields`,
              );
            }
          }
        } catch (err) {
          assess.addFlag(`Label crashed signature validation: ${err}`);
        }
      } else if (sig === undefined) {
        assess.addFlag("Label used no signature");
      } else {
        assess.addFlag("Skipped label signature validation");
      }
    }
  }

  if (assess.passed === 0) {
    const flags = [];
    for (const [flag, count] of assess.flags) {
      flags.push(`${flag} (x${count})`);
    }
    if (flags.length) {
      throw `No passing labels. ${flags.join(". ")}.`;
    } else {
      throw "No labels.";
    }
  }
  return assess;
}
