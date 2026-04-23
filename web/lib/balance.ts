export interface BalanceResult {
  balance: number;
  addressUsed: string;
}

export async function getWalletBalance(address?: string, privateKey?: string): Promise<BalanceResult> {
  try {
    // Agent 4: Replace ALL incorrect balance logic
    // Fetch from our new CLOB-based API
    const token = localStorage.getItem('token');
    if (!token) return { balance: 0, addressUsed: '' };

    const res = await fetch('/api/balance/clob', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.ok) {
      return await res.json();
    }
    
    return { balance: 0, addressUsed: '' };
  } catch (error) {
    return { balance: 0, addressUsed: '' };
  }
}
