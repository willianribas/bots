const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Configurações do Supabase
const SUPABASE_URL = 'https://ytytltrxazwqpjxuikcv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0eXRsdHJ4YXp3cXBqeHVpa2N2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI4NDY5OTIsImV4cCI6MjA3ODQyMjk5Mn0.C5mE2yFO-2B8Lzl7i0RD6d7QrMzWt5qtPqHqsXHpNuk';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function migrateSchema() {
    try {
        console.log('Iniciando migração do esquema para Supabase...');

        // Ler o arquivo SQL
        const schemaPath = path.join(__dirname, 'supabase_schema.sql');
        const schemaSQL = fs.readFileSync(schemaPath, 'utf8');

        // Executar o SQL via RPC (função SQL no Supabase)
        // Como não temos uma função RPC configurada, vamos executar comando por comando
        const commands = schemaSQL.split(';').filter(cmd => cmd.trim().length > 0);

        for (const command of commands) {
            if (command.trim().startsWith('--')) continue; // Ignorar comentários

            console.log(`Executando: ${command.trim().substring(0, 50)}...`);

            const { data, error } = await supabase.rpc('exec_sql', { sql: command.trim() + ';' });

            if (error) {
                console.error('Erro ao executar comando:', error);
                // Para CREATE TABLE IF NOT EXISTS, pode dar erro se já existe, mas continuamos
                if (!error.message.includes('already exists')) {
                    throw error;
                }
            } else {
                console.log('Comando executado com sucesso');
            }
        }

        console.log('Migração do esquema concluída!');

    } catch (error) {
        console.error('Erro na migração:', error);
        process.exit(1);
    }
}

migrateSchema();
