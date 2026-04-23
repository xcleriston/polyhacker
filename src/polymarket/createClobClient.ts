import { ethers } from 'ethers';
import { ClobClient } from '@polymarket/clob-client';

/**
 * Detects wallet type and signature type for Polymarket
 */
const getSignatureType = async (address: string, provider: ethers.providers.Provider): Promise<number> => {
    try {
        const code = await provider.getCode(address);
        if (code !== '0x') {
            return 2; // POLY_GNOSIS_SAFE
        }
        return 0; // EOA
    } catch (error) {
        return 0;
    }
};

const createClobClient = async (privateKey: string, proxyWallet?: string): Promise<ClobClient> => {
    const chainId = 137;
    const host = 'https://clob.polymarket.com';
    const provider = new ethers.providers.JsonRpcProvider('https://polygon-rpc.com');
    const wallet = new ethers.Wallet(privateKey, provider);
    
    // Agent 2 & 3: Wallet Resolution & Proxy Wallet
    const signatureType = proxyWallet 
        ? await getSignatureType(proxyWallet, provider)
        : 0; // EOA

    // Agent 1: Authentication Specialist (L1 + L2)
    let clobClient = new ClobClient(
        host,
        chainId,
        wallet,
        undefined,
        signatureType as any,
        proxyWallet
    );

    // Agent 7: Error Handling / Auto-fix
    let creds;
    try {
        creds = await clobClient.deriveApiKey();
        if (!creds || !creds.key) {
            creds = await clobClient.createApiKey();
        }
    } catch (e) {
        creds = await clobClient.createApiKey();
    }

    // Final client with L2 credentials
    return new ClobClient(
        host,
        chainId,
        wallet,
        creds,
        signatureType as any,
        proxyWallet
    );
};

export default createClobClient;

