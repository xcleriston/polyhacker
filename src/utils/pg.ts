import { Client } from 'pg';

export const getPgClient = async () => {
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL not found');
    }
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    return client;
};

export const query = async (text: string, params?: any[]) => {
    const client = await getPgClient();
    try {
        const res = await client.query(text, params);
        return res;
    } finally {
        await client.end();
    }
};
