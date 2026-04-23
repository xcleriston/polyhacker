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
const validateAndCorrectFunder = async (signerAddress: string, providedFunder?: string): Promise<string> => {
    // If user provided a specific proxy, trust it first
    if (providedFunder && providedFunder.toLowerCase() !== signerAddress.toLowerCase()) {
        return providedFunder;
    }

    try {
        // Try multiple endpoints for reliability
        const [profile, funderData] = await Promise.allSettled([
            fetchData(`https://data-api.polymarket.com/profiles?address=${signerAddress}`),
            fetchData(`https://clob.polymarket.com/funder-address?address=${signerAddress}`)
        ]);

        let officialProxy = null;
        if (profile.status === 'fulfilled') {
            officialProxy = profile.value?.proxyAddress || profile.value?.address;
        }
        if (!officialProxy && funderData.status === 'fulfilled') {
            officialProxy = funderData.value?.funderAddress;
        }

        return officialProxy || providedFunder || signerAddress;
    } catch (e) {
        return providedFunder || signerAddress;
    }
};

const getSignatureType = async (address: string, provider: ethers.providers.Provider): Promise<number> => {
    try {
        // If it looks like a proxy address, we should be careful
        const code = await provider.getCode(address);
        if (code && code !== '0x') {
            return SignatureType.GNOSIS_SAFE;
        }
        return SignatureType.EOA;
    } catch (error) {
        // If network fails, we check if it's NOT the signer address
        // (In Polymarket, if funder !== signer, it's almost always a Gnosis Safe)
        return SignatureType.GNOSIS_SAFE; 
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
    const rpcUrl = process.env.RPC_URL || 'https://polygon-rpc.com';
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    
    // Agent 3 & 5: Wallet Detection & Funder Validation
    let signatureType = SignatureType.EOA;
    if (proxyWallet && proxyWallet.toLowerCase() !== wallet.address.toLowerCase()) {
        signatureType = await getSignatureType(proxyWallet, provider);
    }

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

