/**
 * Script para restaurar los datos de un backup JSON a una base de datos PostgreSQL.
 * Uso: node restore_database.cjs [archivo_backup.json]
 */
const fs = require('fs');
const path = require('path');
require(path.join(__dirname, 'backend', 'node_modules', 'dotenv')).config({ path: path.join(__dirname, 'backend', '.env') });
const { Pool } = require(path.join(__dirname, 'backend', 'node_modules', 'pg'));

async function restore() {
    const backupFile = process.argv[2] || fs.readdirSync(__dirname).filter(f => f.startsWith('backup_solomycrm_') && f.endsWith('.json')).pop();

    if (!backupFile || !fs.existsSync(path.join(__dirname, backupFile))) {
        console.error('❌ No se encontró ningún archivo de backup para restaurar.');
        process.exit(1);
    }

    const connStr = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
    if (!connStr) {
        console.error('❌ No se encontró DATABASE_PUBLIC_URL ni DATABASE_URL en backend/.env');
        process.exit(1);
    }

    console.log(`📁 Leyendo backup: ${backupFile}`);
    const backupData = JSON.parse(fs.readFileSync(path.join(__dirname, backupFile), 'utf8'));

    console.log('🔄 Conectando a la base de datos de destino...');
    const pool = new Pool({
        connectionString: connStr,
        ssl: { rejectUnauthorized: false }
    });

    const client = await pool.connect();

    try {
        console.log('✅ Conectado.');
        await client.query('BEGIN');

        // Orden de inserción para respetar claves foráneas (Foreign Keys)
        const order = [
            'usuarios',
            'equipos',
            'team_goals',
            'clientes',
            'oportunidades',
            'actividades',
            'tareas',
            'ventas',
            'message_templates',
            'etiquetas_globales'
        ];

        for (const table of order) {
            const rows = backupData.tables[table];
            if (!rows || !Array.isArray(rows) || rows.length === 0) continue;

            console.log(`📥 Restaurando tabla [${table}] (${rows.length} registros)...`);
            for (const row of rows) {
                const keys = Object.keys(row);
                const values = Object.values(row);
                const cols = keys.map(k => `"${k}"`).join(', ');
                const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

                const query = `
                    INSERT INTO "${table}" (${cols})
                    VALUES (${placeholders})
                    ON CONFLICT DO NOTHING;
                `;
                await client.query(query, values);
            }
        }

        await client.query('COMMIT');
        console.log('\n🎉 ¡Restauración completada con éxito!');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error durante la restauración (se hizo ROLLBACK):', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

restore();

