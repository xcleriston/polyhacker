import { ethers } from 'ethers';
import { ClobClient } from '@polymarket/clob-client';

/**
 * Signature Types for Polymarket
 * 0: EOA
 * 1: Poly (Legacy)
 * 2: Gnosis Safe / Proxy
 */
export enum SignatureType {
    EOA = 0,
    POLY = 1,
    GNOSIS_SAFE = 2
}
/**
 * Agent 3: Wallet Detection Engine
 */
const getSignatureType = async (address: string, provider: ethers.providers.Provider): Promise<number> => {
    try {
        const code = await provider.getCode(address);
        // IF proxy wallet detected: signatureType = 1 OR 2
        // Most Polymarket proxies are Gnosis Safes (SignatureType.POLY_GNOSIS_SAFE = 2)
        if (code !== '0x') {
            return SignatureType.GNOSIS_SAFE;
        }
        // IF direct private key wallet: signatureType = 0
        return SignatureType.EOA;
    } catch (error) {
        return SignatureType.EOA;
    }
};

/**
 * Agent 2: Authentication Engine
 * Implement FULL L1 + L2 auth
 */
const createOrDeriveApiCreds = async (client: ClobClient) => {
    try {
        // 1. Try to derive
        let creds = await client.deriveApiKey();
        if (creds && creds.key) {
            return creds;
        }
        // 2. If fails, create
        return await client.createApiKey();
    } catch (e) {
        return await client.createApiKey();
    }
};

const createClobClient = async (privateKey: string, proxyWallet?: string): Promise<ClobClient> => {
    const chainId = 137;
    const host = 'https://clob.polymarket.com';
    const provider = new ethers.providers.JsonRpcProvider('https://polygon-rpc.com');
    const wallet = new ethers.Wallet(privateKey, provider);
    
    // Agent 3 & 5: Wallet Detection & Funder Validation
    const signatureType = proxyWallet 
        ? await getSignatureType(proxyWallet, provider)
        : SignatureType.EOA;

    // Agent 1: Initial client for authentication
    let authClient = new ClobClient(
        host,
        chainId,
        wallet,
        undefined,
        signatureType,
        proxyWallet
    );

    // Agent 2: Generate/Derive API credentials
    const apiCreds = await createOrDeriveApiCreds(authClient);

    // Agent 1: Final EXACT initialization
    // host, chainId, signer, apiCreds, signatureType, funderAddress
    return new ClobClient(
        host,
        chainId,
        wallet,
        apiCreds,
        signatureType,
        proxyWallet
    );
};

export default createClobClient;

