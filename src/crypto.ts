import {
  verifySignature,
  Secp256k1Keypair,
  P256Keypair,
} from "@atproto/crypto";

export async function crypto_test() {
  const privateKey = new Uint8Array([
    20, 215, 60, 73, 238, 75, 125, 193, 226, 181, 69, 163, 111, 97, 45, 206,
    215, 187, 140, 209, 201, 45, 112, 124, 142, 84, 70, 222, 165, 95, 62, 84,
  ]);
  const newKeypair = await Secp256k1Keypair.import(privateKey);

  const publicKey = new Uint8Array([
    3, 58, 241, 188, 151, 83, 134, 174, 125, 226, 81, 57, 37, 222, 22, 148, 83,
    180, 255, 97, 133, 66, 118, 92, 164, 141, 71, 176, 116, 243, 214, 132, 207,
  ]);

  console.log("Keypair: ", newKeypair);

  // sign binary data, resulting signature bytes.
  // SHA-256 hash of data is what actually gets signed.
  // signature output is often base64-encoded.
  const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const sig = await newKeypair.sign(data);

  console.log("Signature: ", sig);

  // serialize the public key as a did:key string, which includes key type metadata
  const pubDidKey = newKeypair.did();
  console.log(pubDidKey);
  if (
    pubDidKey != "did:key:zQ3shicCZqPfmizpdXSGtogjyycdh39DLzMLi67N73FcCUCge"
  ) {
    console.log("No match to original DID");
  }

  // output would look something like: 'did:key:zQ3shVRtgqTRHC7Lj4DYScoDgReNpsDp3HBnuKBKt1FSXKQ38'

  // verify signature using public key
  const ok = await verifySignature(pubDidKey, data, sig);
  if (!ok) {
    throw new Error("Uh oh, something is fishy");
  } else {
    console.log("Success");
  }
}
