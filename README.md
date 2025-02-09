# 🥼 AT Protocol Labeler Diagnostics

This basic tool runs a few tests on an AT protocol labeler to rule out some problems
that can prevent the labels from appearing in clients. A passing labeler is not
a guarantee that the labels will appear, and a failing test is not a guarantee
that they won't appear. The warnings are just indications of potential problems
that might interfere with a labeler's acceptance by AT protocol services.

I created it to help rule out some potential issues in a labeler I built with
Rust. This tool leverages packages in the `@atproto` namespace to ensure alignment
with current standards.

If a labeler passes all the tests with this tool and still isn't showing labels
after 24 hours, it might be best to remove the record and set it up again. Then
wait another 24 hours. The PDS activity I've noticed seems to occur about once
per day, so changes might take some time to be noticed.

## Quick Start

1. Install dependencies
   - Use `npm ci`, `npm i`, or your package manager of choice.
2. Start the diagnostics
   - Use `npm start your-labeler-name.bsky.social`

## Tests

1. Resolve the labeler's handle via DNS/web queries
2. Resolves the labeler's DID record from a PLC
3. Gets the labeler's registered label values and verification key from its PDS.
4. Tests labels against the labeler's verification key.
   - ...by getting one or more labels from the labeler's `queryLabels` endpoint.
   - ...by listening for labels on the labeler's `subscribeLabels` websocket endpoint.

## Contributing

I'm not an AT protocol expert, so contributions would be greatly appreciated.
Please open an issue and/or a pull request. I'm sure there are other tests that
would be informative, so there's definitely room for this tool to grow. I will
add them as they come to my attention.
