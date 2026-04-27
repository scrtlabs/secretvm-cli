// Local type override for miscreant@0.3.2.
// miscreant's package.json points "types" at its TypeScript source (src/index.ts),
// which was written for TypeScript 2.x and fails strict TS5+ checks.
// This ambient module declaration satisfies the compiler using only the
// subset of the API we actually use.
declare module "miscreant" {
    export class PolyfillCryptoProvider { }

    export class SIV {
        static importKey(
            key: Uint8Array,
            algorithm: "AES-SIV" | "AES-PMAC-SIV",
            provider: PolyfillCryptoProvider,
        ): Promise<SIV>;
        seal(plaintext: Uint8Array, associatedData: Uint8Array[]): Promise<Uint8Array>;
        open(ciphertext: Uint8Array, associatedData: Uint8Array[]): Promise<Uint8Array>;
    }
}
