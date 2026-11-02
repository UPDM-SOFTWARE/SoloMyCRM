const fs = require('fs');
const path = require('path');
require(path.join(__dirname, 'backend', 'node_modules', 'dotenv')).config({ path: path.join(__dirname, 'backend', '.env') });
const { Pool } = require(path.join(__dirname, 'backend', 'node_modules', 'pg'));

async function backup() {
    const connStr = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
    if (!connStr) {
        console.error('❌ No se encontró DATABASE_PUBLIC_URL ni DATABASE_URL en backend/.env');
        process.exit(1);
    }

    console.log('🔄 Conectando a la base de datos de Railway...');
    const pool = new Pool({
        connectionString: connStr,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const client = await pool.connect();
        console.log('✅ Conexión establecida con éxito.');

        // Obtener lista de tablas
        const tablesRes = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
              AND table_type = 'BASE TABLE'
            ORDER BY table_name;
        `);

        const tables = tablesRes.rows.map(r => r.table_name);
        console.log(`📋 Se encontraron ${tables.length} tablas:`, tables.join(', '));

        const backupData = {
            metadata: {
                timestamp: new Date().toISOString(),
                total_tables: tables.length,
                database_engine: 'PostgreSQL'
            },
            tables: {}
        };

        let totalRecords = 0;
        for (const table of tables) {
            try {
                // Escapar nombres de tabla con comillas dobles
                const res = await client.query(`SELECT * FROM "${table}"`);
                backupData.tables[table] = res.rows;
                totalRecords += res.rowCount;
                console.log(`   📦 [${table}]: ${res.rowCount} filas guardadas`);
            } catch (err) {
                console.error(`   ⚠️ Error al leer tabla ${table}:`, err.message);
                backupData.tables[table] = { error: err.message };
            }
        }

        const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `backup_solomycrm_${dateStr}.json`;
        const filePath = path.join(__dirname, fileName);

        fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), 'utf8');
        console.log('\n=============================================');
        console.log(`🎉 BACKUP COMPLETADO EXITOSAMENTE`);
        console.log(`📁 Archivo generado: ${fileName}`);
        console.log(`📊 Total de tablas: ${tables.length}`);
        console.log(`📈 Total de registros: ${totalRecords}`);
        console.log(`💾 Tamaño del archivo: ${(fs.statSync(filePath).size / 1024).toFixed(2)} KB`);
        console.log('=============================================\n');

        client.release();
        await pool.end();
    } catch (err) {
        console.error('❌ Error conectando a la base de datos:', err.message);
        await pool.end();
        process.exit(1);
    }
}

backup();

