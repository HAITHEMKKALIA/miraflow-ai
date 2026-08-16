const { Client } = require('./temp_db_fix/node_modules/pg');

async function fix() {
    const client = new Client({ connectionString: 'postgresql://postgres:postgres@localhost:5432/postgres' });
    await client.connect();
    try {
        const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
        console.log("Tables in public:", res.rows.map(r => r.table_name).join(', '));
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        client.end();
    }
}
fix();
