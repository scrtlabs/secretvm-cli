/**
 * Client-side encryption for Secret Network KMS contract.
 *
 * Algorithm: X25519 ECDH + AES-128-SIV (matches the Rust contract's
 * Aes128Siv implementation).
 *
 * Wire format:
 *   hex(ephemeral_x25519_pubkey[32] || AES-128-SIV(shared_secret, plaintext, ad=[[]]))
 *
 * The contract's decrypt_with_contract_key() expects exactly this format.
 */

import nacl from "tweetnacl";
import { SIV, PolyfillCryptoProvider } from "miscreant";

function hexToBytes(hex: string): Uint8Array {
    const clean = hex.replace(/^0x/, "");
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * Encrypt plaintext for the KMS contract using X25519 ECDH + AES-128-SIV.
 *
 * @param plaintext         UTF-8 string to encrypt
 * @param contractPubKeyHex 64-char hex string — contract's X25519 public key
 * @returns hex string: eph_pub[32] || AES-128-SIV(shared, plaintext)
 */
export async function encryptForKmsContract(
    plaintext: string,
    contractPubKeyHex: string,
): Promise<string> {
    if (!contractPubKeyHex || contractPubKeyHex.length !== 64) {
        throw new Error(
            "KMS contract public key is missing or invalid (expected 64-char hex)",
        );
    }

    // 1. Generate ephemeral X25519 keypair
    const ephPriv = nacl.randomBytes(32);
    const ephPub = nacl.scalarMult.base(ephPriv); // 32 bytes

    // 2. ECDH: shared = x25519(ephPriv, contractPub)
    const contractPub = hexToBytes(contractPubKeyHex);
    const shared = nacl.scalarMult(ephPriv, contractPub); // 32 bytes

    // 3. AES-128-SIV encrypt (32-byte key = two 16-byte AES-128 sub-keys)
    //    Associated data: one empty byte slice — matches Rust's ad = &[&[]] default
    const provider = new PolyfillCryptoProvider();
    const siv = await SIV.importKey(shared, "AES-SIV", provider);
    const plaintextBytes = new TextEncoder().encode(plaintext);
    const ciphertext = await siv.seal(plaintextBytes, [new Uint8Array(0)]);

    // 4. Concatenate ephPub || ciphertext and hex-encode
    const combined = new Uint8Array(ephPub.length + ciphertext.length);
    combined.set(ephPub, 0);
    combined.set(ciphertext, ephPub.length);

    return bytesToHex(combined);
}
