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

    const connStr = process.env.TARGET_DB_URL || process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
    if (!connStr) {
        console.error('❌ No se encontró cadena de conexión.');
        process.exit(1);
    }

    const isLocalTunnel = connStr.includes('127.0.0.1') || connStr.includes('localhost');

    console.log(`📁 Leyendo backup: ${backupFile}`);
    const backupData = JSON.parse(fs.readFileSync(path.join(__dirname, backupFile), 'utf8'));

    console.log('🔄 Conectando a la base de datos destino...');
    const pool = new Pool({
        connectionString: connStr,
        ssl: isLocalTunnel ? false : { rejectUnauthorized: false }
    });

    const client = await pool.connect();

    try {
        console.log('✅ Conectado exitosamente.');

        // 1. Asegurar que las tablas auxiliares existan
        await client.query(`
            CREATE TABLE IF NOT EXISTS team_goals (
                id SERIAL PRIMARY KEY,
                equipo_id INTEGER NOT NULL,
                miembro_id INTEGER NOT NULL,
                tipo VARCHAR(50) NOT NULL,
                periodo VARCHAR(7) NOT NULL,
                objetivo NUMERIC NOT NULL DEFAULT 0,
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (equipo_id, miembro_id, tipo, periodo)
            );

            CREATE TABLE IF NOT EXISTS message_templates (
                id SERIAL PRIMARY KEY,
                owner_id INTEGER NOT NULL,
                equipo_id INTEGER,
                nombre VARCHAR(120) NOT NULL,
                canal VARCHAR(20) NOT NULL DEFAULT 'general',
                scope VARCHAR(20) NOT NULL DEFAULT 'ambos',
                etapa VARCHAR(80),
                contenido TEXT NOT NULL,
                activo BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Relajar columnas NOT NULL para coincidir con el estado real de los datos
            ALTER TABLE clientes ALTER COLUMN "vendedorAsignado" DROP NOT NULL;
            ALTER TABLE clientes ALTER COLUMN "apellidoPaterno" DROP NOT NULL;
            ALTER TABLE clientes ALTER COLUMN "telefono" DROP NOT NULL;
            ALTER TABLE clientes ALTER COLUMN "correo" DROP NOT NULL;
            ALTER TABLE actividades ALTER COLUMN "cliente" DROP NOT NULL;
        `);

        const tablesToRestore = [
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

        // 2. Comprobar que todas las columnas del backup existan en la base de datos; si falta alguna, crearla automáticamente
        console.log('🔍 Verificando columnas entre backup y base de datos...');
        for (const table of tablesToRestore) {
            const rows = backupData.tables[table];
            if (!rows || !rows.length) continue;

            const colsRes = await client.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = $1
            `, [table]);
            const existingCols = new Set(colsRes.rows.map(r => r.column_name));

            const sampleRow = rows[0];
            for (const col of Object.keys(sampleRow)) {
                if (!existingCols.has(col)) {
                    console.log(`   ➕ Añadiendo columna faltante "${col}" a tabla "${table}"...`);
                    await client.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${col}" TEXT;`);
                    existingCols.add(col);
                }
            }
        }

        // 3. Limpiar tablas para que no haya duplicados ni IDs cruzados
        console.log('🧹 Limpiando tablas...');
        await client.query(`
            TRUNCATE TABLE 
                usuarios, 
                equipos, 
                clientes, 
                actividades, 
                tareas, 
                ventas, 
                oportunidades, 
                team_goals, 
                message_templates, 
                etiquetas_globales 
            RESTART IDENTITY CASCADE;
        `);

        await client.query('BEGIN');

        // Desactivar temporalmente verificación de foreign keys
        try {
            await client.query("SET session_replication_role = 'replica';");
        } catch (e) {
            console.log('Nota replication role:', e.message);
        }

        let totalRestored = 0;

        for (const table of tablesToRestore) {
            const rows = backupData.tables[table];
            if (!rows || !Array.isArray(rows) || rows.length === 0) continue;

            console.log(`📥 Restaurando tabla [${table}] (${rows.length} registros)...`);
            let count = 0;
            for (const row of rows) {
                const keys = Object.keys(row);
                const values = keys.map(k => {
                    let val = row[k];
                    // Si googleTokenExpiry viene como ISO string, convertir a timestamp ms (DOUBLE PRECISION)
                    if (k === 'googleTokenExpiry' && val) {
                        const ms = Date.parse(val);
                        return isNaN(ms) ? null : ms;
                    }
                    return val;
                });

                const cols = keys.map(k => `"${k}"`).join(', ');
                const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

                const query = `
                    INSERT INTO "${table}" (${cols})
                    VALUES (${placeholders})
                    ON CONFLICT DO NOTHING;
                `;
                await client.query(query, values);
                count++;
            }
            totalRestored += count;
        }

        // Reactivar verificación de foreign keys
        try {
            await client.query("SET session_replication_role = 'origin';");
        } catch (e) {}

        // Sincronizar secuencias seriales de PostgreSQL
        console.log('🔄 Sincronizando secuencias de auto-incremento...');
        for (const table of tablesToRestore) {
            try {
                await client.query(`
                    SELECT setval(
                        pg_get_serial_sequence('"${table}"', 'id'),
                        COALESCE((SELECT MAX(id) FROM "${table}"), 1)
                    );
                `);
            } catch (seqErr) {}
        }

        await client.query('COMMIT');
        console.log('\n=============================================');
        console.log('🎉 ¡RESTAURACIÓN COMPLETADA CON ÉXITO!');
        console.log(`📊 Total de registros restaurados: ${totalRestored}`);
        console.log('=============================================\n');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error durante la restauración (se hizo ROLLBACK):', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

restore();
