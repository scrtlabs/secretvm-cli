import * as forge from "node-forge";
import * as CryptoJS from "crypto-js";

const publicKey = `
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA4oLWArYud2yi7PUYQp90
5BfPHyklsEnZmOhceuinPjTiJd9yg5Ur3+91bRV2zigSK7jwqTK0IQCuTuGJRjWZ
Hhg5QxJ5iwwgaY1DjSkNIj6doCGROtXR3BCDyVEnkWxoDSmX256Pv5UWtqiLENSz
iOT6vcmCce1AwPLMMVfEegTFDTKceqm8teyGgIKO3s9/WVKWYKxURXxCeKb535MN
A6E5Cgopo/NxuHWCs3nZumXli3D3m3aXHyeoQwBgf7mI7TdwzKd5HMwcmN1khDi4
WaQiiGeHEOIq3yUhV9jF4gNSBlzmPMmIFlzdTGmiOVTmoVQ8a5stGReFvTFMRAbr
OQIDAQAB
-----END PUBLIC KEY-----
`;

async function encryptData(data: string): Promise<{
    encryptedData: string;
    encryptedAESKey: string;
}> {
    try {
        const aesKey = CryptoJS.lib.WordArray.random(32);
        const aesKeyString = CryptoJS.enc.Base64.stringify(aesKey);
        const encryptedData = CryptoJS.AES.encrypt(
            data,
            aesKeyString,
        ).toString();

        let encryptedAESKey: string;
        try {
            const publicKeyObj = forge.pki.publicKeyFromPem(publicKey);
            const aesKeyBase64 = CryptoJS.enc.Base64.stringify(aesKey);
            let encrypted;

            try {
                encrypted = publicKeyObj.encrypt(aesKeyBase64, "RSA-OAEP");
            } catch (oaepError) {
                encrypted = publicKeyObj.encrypt(
                    aesKeyBase64,
                    "RSAES-PKCS1-V1_5",
                );
            }

            encryptedAESKey = forge.util.encode64(encrypted);
        } catch (forgeError: any) {
            throw new Error(
                `Forge encryption failed: ${forgeError.message || "Unknown error"}`,
            );
        }

        return {
            encryptedData,
            encryptedAESKey,
        };
    } catch (error: any) {
        throw new Error(
            `Failed to encrypt data: ${error.message || "Unknown error"}`,
        );
    }
}

export async function encryptDockerCredentials(
    repository: string,
    username: string,
    password: string,
): Promise<{ encryptedData: string; encryptedAESKey: string }> {
    try {
        const data = JSON.stringify({
            repository,
            username,
            password,
        });

        return await encryptData(data);
    } catch (error: any) {
        throw new Error(
            `Failed to encrypt Docker credentials: ${error.message || "Unknown error"}`,
        );
    }
}
