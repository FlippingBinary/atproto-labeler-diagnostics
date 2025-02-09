import { cborEncode } from "@atproto/common";
import { verifySignature } from "@atproto/crypto";
import { Label, lexicons } from "@atproto/api";
import { Subscription } from "@atproto/xrpc-server";
import { ids } from "@atproto/api/dist/client/lexicons.js";
import {
  OutputSchema as LabelMessage,
  isLabels,
} from "@atproto/pds/dist/lexicon/types/com/atproto/label/subscribeLabels.js";
import { EndpointAssessment } from "./util.js";

type SubscribeLabels = {
  cursor: number;
  endpoint: URL;
  key?: string;
  limit?: number;
  registeredLabels?: Set<string>;
};

export async function subscribeLabels({
  endpoint,
  registeredLabels,
  key,
  limit = 250,
}: SubscribeLabels): Promise<EndpointAssessment> {
  let assess = new EndpointAssessment();

  const ac = new AbortController();
  let doneTimer: NodeJS.Timeout;
  const resetDoneTimer = () => {
    clearTimeout(doneTimer);
    doneTimer = setTimeout(() => ac.abort("Timeout"), 1000);
  };

  const sub = new Subscription({
    signal: ac.signal,
    // NOTE: The `Subscription` constructor improperly appends the endpoint path
    // to `service` even when it ends with a `/`, like `URL` does when stringified.
    // NOTE: The url is passed to `ws` without modifying the protocol, so it should
    // be either `wss` or `ws`.
    service: `${endpoint.protocol.replace("http", "ws")}//${endpoint.host}`,
    method: ids.ComAtprotoLabelSubscribeLabels,
    getParams() {
      return { cursor: 0 };
    },
    validate(obj: any) {
      try {
        return lexicons.assertValidXrpcMessage<LabelMessage>(
          ids.ComAtprotoLabelSubscribeLabels,
          obj,
        );
      } catch (err) {
        assess.addFlag(`Message failed XRPC LabelMessage validation: ${err}`);
      }
    },
  });

  try {
    for await (const message of sub) {
      resetDoneTimer();
      // NOTE: This type assertion is for typescript's benefit only
      if (isLabels(message)) {
        for (const label of message.labels) {
          // sigs are currently parsed as a Buffer which is a Uint8Array under the hood, but fails our equality test so we cast to Uint8Array
          if (label.sig !== undefined && key !== undefined) {
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
          } else if (key !== undefined) {
            assess.addFlag("Label used no signature");
          }
        }
      }
      if (assess.total >= limit) {
        ac.abort("Limit");
      }
    }
  } catch (err) {
    if (assess.total === 0) {
      if (err === "Timeout") {
        throw "Timeout occurred before finding any labels";
      } else {
        throw `${err}`;
      }
    } else if (err !== "Timeout" && err !== "Limit") {
      assess.addFlag(`The message iterator stopped with a fatal error: ${err}`);
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
