const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.resolve(__dirname, 'automacao_gets.log');
const CACHE_FILE = path.resolve(__dirname, 'automacao_cache.json');
const INTERVAL_MS = 60000; // 1 minuto
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos de TTL para o cache

// Horário de funcionamento: 6:45 às 19:45 (horário de São Paulo)
const HORARIO_INICIO = { hora: 6, minuto: 45 };
const HORARIO_FIM = { hora: 19, minuto: 45 };

function estaNoHorarioFuncionamento() {
    const now = new Date();
    const spTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const hora = spTime.getHours();
    const minuto = spTime.getMinutes();

    const inicioMinutos = HORARIO_INICIO.hora * 60 + HORARIO_INICIO.minuto;
    const fimMinutos = HORARIO_FIM.hora * 60 + HORARIO_FIM.minuto;
    const atualMinutos = hora * 60 + minuto;

    return atualMinutos >= inicioMinutos && atualMinutos <= fimMinutos;
}

// Função para obter data/hora atual em São Paulo
function getSaoPauloDateTime() {
    const now = new Date();
    const spTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    return spTime;
}

// Função para obter data atual em São Paulo (formato YYYY-MM-DD)
function getSaoPauloDate() {
    return getSaoPauloDateTime().toISOString().split('T')[0];
}

// Função para obter timestamp completo em São Paulo
function getSaoPauloTimestamp() {
    return getSaoPauloDateTime().toISOString();
}

function aguardarProximoHorario() {
    const now = new Date();
    const spTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const hora = spTime.getHours();
    const minuto = spTime.getMinutes();
    const atualMinutos = hora * 60 + minuto;
    const inicioMinutos = HORARIO_INICIO.hora * 60 + HORARIO_INICIO.minuto;

    let esperaMinutos;
    let proximoHorario;
    if (atualMinutos < inicioMinutos) {
        // Ainda não chegou o horário de início hoje
        esperaMinutos = inicioMinutos - atualMinutos;
        proximoHorario = `hoje às ${HORARIO_INICIO.hora}:${HORARIO_INICIO.minuto.toString().padStart(2, '0')}`;
    } else {
        // Já passou o horário de fim, aguardar até amanhã
        const minutosAteMeiaNoite = (24 * 60) - atualMinutos;
        esperaMinutos = minutosAteMeiaNoite + inicioMinutos;
        proximoHorario = `amanhã às ${HORARIO_INICIO.hora}:${HORARIO_INICIO.minuto.toString().padStart(2, '0')}`;
    }

    const esperaMs = esperaMinutos * 60 * 1000;
    const mensagem = `⏸️ Monitor em pausa - Fora do horário comercial\n\n` +
                    `Próxima ativação: ${proximoHorario}\n` +
                    `Aguardando: ${Math.floor(esperaMinutos / 60)}h ${esperaMinutos % 60}min`;

    log(`Fora do horário de funcionamento. Aguardando ${Math.floor(esperaMinutos / 60)}h ${esperaMinutos % 60}min até ${proximoHorario}.`);
    sendTelegramAlert(mensagem);
    return new Promise(resolve => setTimeout(resolve, esperaMs));
}

function log(message) {
    const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    fs.appendFileSync(LOG_FILE, logMessage + '\n');
}

// Sistema de Cache Inteligente
let cacheDados = new Map(); // Cache em memória para dados atuais
let cacheTimestamp = 0; // Timestamp do último cache válido

function carregarCache() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            const cacheAge = Date.now() - cacheData.timestamp;

            if (cacheAge < CACHE_TTL_MS) {
                cacheDados = new Map(Object.entries(cacheData.dados));
                cacheTimestamp = cacheData.timestamp;
                log(`Cache carregado com ${cacheDados.size} registros (idade: ${Math.floor(cacheAge / 1000)}s)`);
                return true;
            } else {
                log(`Cache expirado (${Math.floor(cacheAge / 1000)}s > ${CACHE_TTL_MS / 1000}s), será recriado`);
                return false;
            }
        }
    } catch (error) {
        log(`Erro ao carregar cache: ${error.message}`);
    }
    return false;
}

function salvarCache() {
    try {
        const cacheData = {
            timestamp: Date.now(),
            dados: Object.fromEntries(cacheDados)
        };
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2));
        log(`Cache salvo com ${cacheDados.size} registros`);
    } catch (error) {
        log(`Erro ao salvar cache: ${error.message}`);
    }
}

async function dadosMudaram(dadosNovos) {
    const chave = dadosNovos.numero_os;
    const dadosAntigos = cacheDados.get(chave);

    if (!dadosAntigos) {
        // Dados novos, não existem no cache
        return true;
    }

    // Verificar se a origem mudou - este é um caso especial onde sempre devemos verificar o banco
    const origemCache = dadosAntigos.origem || '';
    const origemExtraida = dadosNovos.origem || '';

    if (origemCache !== origemExtraida) {
        // Origem mudou! Precisamos verificar se isso já está correto no banco
        try {
            const { data: existingRows, error } = await supabase
                .from('ordens_servico')
                .select('origem')
                .eq('numero_os', chave)
                .limit(1);

            if (!error && existingRows && existingRows.length > 0) {
                const origemNoBanco = existingRows[0].origem || '';
                if (origemNoBanco !== origemExtraida) {
                    log(`ORIGEM: OS ${chave} será atualizada para '${origemExtraida}'`);
                    return true; // Origem no banco é diferente da extraída
                }
            }
        } catch (err) {
            // Silenciar erros de verificação
        }
    }

    // Comparar outros campos relevantes
    const camposComparar = [
        'codigo_equipamento', 'descricao_equipamento',
        'criticidade', 'status', 'dias_aberta', 'nome_executor'
    ];

    for (const campo of camposComparar) {
        if (dadosAntigos[campo] !== dadosNovos[campo]) {
            return true; // Campo mudou
        }
    }

    // Verificar data de abertura (comparar apenas a data, não hora)
    const dataAberturaAntiga = dadosAntigos.data_abertura ?
        (typeof dadosAntigos.data_abertura === 'string' ? dadosAntigos.data_abertura.split('T')[0] : dadosAntigos.data_abertura) : null;
    const dataAberturaNova = dadosNovos.data_abertura ?
        dadosNovos.data_abertura.toISOString().split('T')[0] : null;

    if (dataAberturaAntiga !== dataAberturaNova) {
        return true;
    }

    return false; // Nenhum campo relevante mudou
}

function atualizarCache(dados) {
    const chave = dados.numero_os;

    // Adicionar timestamp de atualização para controle
    const dadosComTimestamp = {
        ...dados,
        ultima_atualizacao: Date.now()
    };

    cacheDados.set(chave, dadosComTimestamp);
}

function limparCacheExpirado() {
    const agora = Date.now();
    let removidos = 0;

    for (const [chave, dados] of cacheDados) {
        if (dados.ultima_atualizacao && (agora - dados.ultima_atualizacao) > CACHE_TTL_MS) {
            cacheDados.delete(chave);
            removidos++;
        }
    }

    if (removidos > 0) {
        log(`Cache: ${removidos} registros expirados removidos`);
    }
}

// Configurações do Supabase
const SUPABASE_URL = 'https://ytytltrxazwqpjxuikcv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0eXRsdHJ4YXp3cXBqeHVpa2N2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI4NDY5OTIsImV4cCI6MjA3ODQyMjk5Mn0.C5mE2yFO-2B8Lzl7i0RD6d7QrMzWt5qtPqHqsXHpNuk';

const LOGIN_EMAIL = 'williann.dev@gmail.com';
const LOGIN_SENHA = '@1Bento396127';

const TELEGRAM_TOKEN = '8002781004:AAFRlLnlVboI80oU_TSV2JX1-EbcN-4YXu0';
const TELEGRAM_CHAT_ID = '1494275780';

const bot = new TelegramBot(TELEGRAM_TOKEN);

async function sendTelegramAlert(message) {
    try {
        await bot.sendMessage(TELEGRAM_CHAT_ID, message);
    } catch (error) {
        log(`Erro ao enviar alerta Telegram: ${error.message}`);
    }
}

// Cliente Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function conectarBanco() {
    try {
        // Testar conexão com Supabase
        const { data, error } = await supabase.from('ordens_servico').select('count').limit(1);
        if (error) throw error;
        log('Conectado ao banco de dados Supabase');
        return true;
    } catch (error) {
        log('Erro ao conectar ao banco Supabase: ' + error.message);
        await sendTelegramAlert('❌ Erro ao conectar ao banco Supabase. Verifique a configuração.');
        return null;
    }
}

async function verificarTabelas() {
    try {
        // Verificar se as tabelas existem fazendo uma consulta simples
        const { data: data1, error: error1 } = await supabase.from('ordens_servico').select('count').limit(1);
        if (error1) throw new Error('Tabela ordens_servico não encontrada: ' + error1.message);

        const { data: data2, error: error2 } = await supabase.from('ordens_servico_historico').select('count').limit(1);
        if (error2) throw new Error('Tabela ordens_servico_historico não encontrada: ' + error2.message);

        log('Tabelas verificadas com sucesso.');
    } catch (error) {
        log('Erro ao verificar tabelas: ' + error.message);
        await sendTelegramAlert('❌ Erro ao verificar tabelas no banco. Execute o script de migração primeiro.');
    }
}

async function inserirHistorico(numero_os, campo, valor_antigo, valor_novo) {
    try {
        const { error } = await supabase
            .from('ordens_servico_historico')
            .insert({
                numero_os: numero_os,
                campo_alterado: campo,
                valor_antigo: valor_antigo,
                valor_novo: valor_novo,
                alterado_por: 'automacao' // Importante: deve ser 'automacao' para passar pela política RLS
            });

        if (error) throw error;
    } catch (err) {
        log('Erro ao inserir histórico: ' + err.message);
        await sendTelegramAlert('❌ Erro ao inserir histórico no banco.');
    }
}

async function inserirAtualizarOrdemServico(dados) {
    try {
        // Buscar registro existente
        const { data: existingRows, error: selectError } = await supabase
            .from('ordens_servico')
            .select('*')
            .eq('numero_os', dados.numero_os);

        if (selectError) throw selectError;

        const existing = existingRows[0];

        let dias_no_status_atual;
        let status_change_date;

        if (!existing) {
            dias_no_status_atual = 0;
            status_change_date = getSaoPauloDate();
        } else if (existing.status !== dados.status) {
            await inserirHistorico(dados.numero_os, 'status', existing.status, dados.status);

            // ALERTA CRÍTICO: Verificar se OS crítica mudou de SOS para CO em menos de 24h
            if (existing.status === 'SOS' && dados.status === 'CO' && dados.criticidade === 'Sim') {
                const dataAbertura = new Date(dados.data_abertura);
                const agora = getSaoPauloDateTime();
                const diffHoras = (agora - dataAbertura) / (1000 * 60 * 60);

                if (diffHoras < 24) {
                    const alertaCritico = `🚨 ALERTA CRÍTICO - OS ENCERRADA RAPIDAMENTE\n\n` +
                                         `OS: ${dados.numero_os}\n` +
                                         `Equipamento: ${dados.descricao_equipamento}\n` +
                                         `Status: SOS → CO\n` +
                                         `Tempo decorrido: ${Math.floor(diffHoras)}h ${Math.floor((diffHoras % 1) * 60)}min\n` +
                                         `Criticidade: ${dados.criticidade}\n` +
                                         `Executor: ${dados.nome_executor}\n\n` +
                                         `⚠️ ATENÇÃO: OS crítica encerrada em menos de 24h!`;
                    sendTelegramAlert(alertaCritico);
                    log(`ALERTA CRÍTICO: OS ${dados.numero_os} encerrada em ${diffHoras.toFixed(1)}h`);
                }
            }

            dias_no_status_atual = 0;
            status_change_date = getSaoPauloDate();
        } else {
            const changeDate = new Date(existing.status_change_date);
            const today = getSaoPauloDateTime();
            const diffTime = Math.abs(today - changeDate);
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            dias_no_status_atual = diffDays;
            status_change_date = existing.status_change_date;
        }

        if (existing && existing.nome_executor !== dados.nome_executor) {
            await inserirHistorico(dados.numero_os, 'executor', existing.nome_executor, dados.nome_executor);
        }

        const hasChanges = !existing || (
            existing.origem !== dados.origem ||
            existing.codigo_equipamento !== dados.codigo_equipamento ||
            existing.descricao_equipamento !== dados.descricao_equipamento ||
            existing.criticidade !== dados.criticidade ||
            existing.status !== dados.status ||
            (existing.data_abertura ? existing.data_abertura.split('T')[0] : null) !== (dados.data_abertura ? dados.data_abertura.toISOString().split('T')[0] : null) ||
            existing.dias_aberta !== dados.dias_aberta ||
            existing.dias_no_status_atual !== dias_no_status_atual ||
            existing.nome_executor !== dados.nome_executor
        );

        if (!hasChanges) {
            return false;
        }

        // Usar upsert do Supabase
        const { error: upsertError } = await supabase
            .from('ordens_servico')
            .upsert({
                origem: dados.origem,
                numero_os: dados.numero_os,
                codigo_equipamento: dados.codigo_equipamento,
                descricao_equipamento: dados.descricao_equipamento,
                criticidade: dados.criticidade,
                status: dados.status,
                data_abertura: dados.data_abertura ? dados.data_abertura.toISOString().split('T')[0] : null,
                dias_aberta: dados.dias_aberta,
                dias_no_status_atual: dias_no_status_atual,
                status_change_date: status_change_date,
                nome_executor: dados.nome_executor,
                updated_at: getSaoPauloTimestamp()
            }, {
                onConflict: 'numero_os',
                ignoreDuplicates: false
            });

        if (upsertError) throw upsertError;

        return true;
    } catch (error) {
        log('Erro ao salvar ordem de serviço: ' + error.message);
        await sendTelegramAlert('❌ Erro ao salvar ordem de serviço no banco.');
        return false;
    }
}

async function realizarLogin(page) {
    await page.goto('https://gets.ceb.unicamp.br/nec/view/inicio/index.jsf', { waitUntil: 'load', timeout: 30000 });

    await page.waitForSelector('#j_username', { timeout: 15000 });

    await page.fill('#j_username', LOGIN_EMAIL);
    await page.fill('body > table.loginForm > tbody > tr:nth-child(2) > td > input[type=password]:nth-child(6)', LOGIN_SENHA);
    await page.click('input[type="submit"]');

    for (let i = 0; i < 15; i++) {
        await page.waitForTimeout(1000);
        const currentUrl = page.url();
        if (!currentUrl.includes('login') && (await page.locator('text=Senha inválida').count()) === 0) {
            log('Login realizado com sucesso.');
            return true;
        }
    }
    log('Falha no login após tentativas.');
    await sendTelegramAlert('❌ Falha no login no GETS. Verifique credenciais ou conexão.');
    return false;
}

async function main() {
    let browser;
    let page;
    let estavaEmPausa = false;

    log('Iniciando automação...');

    try {
        // Carregar cache na inicialização
        carregarCache();

        const conn = await conectarBanco();
        if (!conn) return;
        await verificarTabelas();

        browser = await chromium.launch({ headless: true });
        page = await browser.newPage();

        const loginOk = await realizarLogin(page);
        if (!loginOk) throw new Error('Login falhou.');

        await page.goto('https://gets.ceb.unicamp.br/nec/view/pendencias/consulta.jsf', { waitUntil: 'networkidle' });

        while (true) {
            // Verificar horário de funcionamento
            if (!estaNoHorarioFuncionamento()) {
                estavaEmPausa = true;
                await aguardarProximoHorario();
                continue; // Reinicia o loop após aguardar
            }

            // Se estava em pausa e agora voltou, enviar alerta
            if (estavaEmPausa) {
                const mensagemRetomada = `▶️ Monitor retomando atividades\n\n` +
                                        `Horário comercial iniciado: ${HORARIO_INICIO.hora}:${HORARIO_INICIO.minuto.toString().padStart(2, '0')} às ${HORARIO_FIM.hora}:${HORARIO_FIM.minuto.toString().padStart(2, '0')}\n` +
                                        `Iniciando extração de dados...`;
                sendTelegramAlert(mensagemRetomada);
                log('Monitor retomando atividades após pausa.');
                estavaEmPausa = false;
            }

            try {
                await page.reload({ timeout: 15000, waitUntil: 'networkidle' });

                await page.waitForSelector('#fm1\\:tbPendencias_data tr[data-ri]', { timeout: 7000 });
                const linhas = await page.locator('#fm1\\:tbPendencias_data tr[data-ri]').all();

                const dadosArray = await Promise.all(linhas.map(async (linha, i) => {
                    try {
                        const numeroOS = await linha.locator('td.columnOS a').textContent().catch(() => '');

                        // Tentar diferentes seletores para capturar a origem (MP/MC)
                        let origem = '';
                        try {
                            // Primeiro: tentar encontrar texto que contenha MP ou MC em qualquer lugar da linha
                            const linhaText = await linha.textContent();

                            if (linhaText.includes('MP')) {
                                origem = 'MP';
                            } else if (linhaText.includes('MC')) {
                                origem = 'MC';
                            } else if (linhaText.includes('INST')) {
                                origem = 'INST';
                            } else {
                                // Fallback: tentar seletores específicos
                                origem = await linha.locator('td div.MP-fontcolor, td div.MC-fontcolor').textContent().catch(() => '');
                                // log(`OS ${numeroOS}: Tentativa seletor específico = "${origem}"`);

                                if (!origem || origem.trim() === '') {
                                    // Se não funcionar, tentar apenas div dentro de td
                                    origem = await linha.locator('td div').first().textContent().catch(() => '');
                                    // log(`OS ${numeroOS}: Tentativa td div = "${origem}"`);
                                }
                                if (!origem || origem.trim() === '') {
                                    // Última tentativa: primeira célula da linha
                                    origem = await linha.locator('td').first().textContent().catch(() => '');
                                    // log(`OS ${numeroOS}: Tentativa td first = "${origem}"`);
                                }
                            }
                        } catch (error) {
                            origem = '';
                        }
                        const equipamentoCell = linha.locator('td').nth(4);
                        const equipamentoText = await equipamentoCell.textContent();

                        const parts = equipamentoText.split(' - ');
                        const codigoEquipamento = parts[0] ? parts[0].trim() : '';
                        const afterDash = parts[1] || '';
                        const beforeStatus = afterDash.split(/\s+[A-Z]{2,3}\s*\(/)[0];
                        const descricaoEquipamento = beforeStatus.trim();

                        const criticidade = (await linha.locator('i.fa.fa-exclamation-triangle[title*="Equipamento Crítico"]').count()) > 0 ? 'Sim' : 'Não';

                        const statusCodes = ['EE', 'AE', 'OSP', 'AVT', 'ADE', 'SOS', 'CO', 'AM', 'ADPD', 'ACE', 'AO'];
                        let status = '';
                        for (const code of statusCodes) {
                            if (equipamentoText.includes(code)) {
                                status = code;
                                break;
                            }
                        }

                        const dataMatch = equipamentoText.match(/Aberta em\s+(\d{1,2}\/\d{1,2}\/\d{4})/);
                        const dataAbertura = dataMatch ? new Date(dataMatch[1].split('/').reverse().join('-')) : null;

                        const diasMatch = equipamentoText.match(/\((\d+)\s+dias\)/);
                        const diasAberta = diasMatch ? parseInt(diasMatch[1]) : 0;
                        const lastCell = linha.locator('td.columnRight');
                        const lastCellText = await lastCell.textContent();
                        const nomeExecutor = lastCellText.split('Neste estado há')[0].trim();

                        return {
                            origem: origem.trim(),
                            numero_os: numeroOS.trim(),
                            codigo_equipamento: codigoEquipamento.trim(),
                            descricao_equipamento: descricaoEquipamento.trim(),
                            criticidade: criticidade,
                            status: status.trim(),
                            data_abertura: dataAbertura,
                            dias_aberta: diasAberta,
                            nome_executor: nomeExecutor.trim()
                        };
                    } catch (error) {
                        // Erro na extração - ignorar esta linha
                        return null;
                    }
                }));

                const validDados = dadosArray.filter(d => d !== null);

                // Limpar cache expirado periodicamente
                limparCacheExpirado();

                let inseridos = 0;
                let cacheHits = 0;
                let cacheMisses = 0;

                for (const dados of validDados) {
                    // Verificar se os dados mudaram comparando com o cache
                    if (dadosMudaram(dados)) {
                        // Dados mudaram ou são novos - salvar no Supabase
                        const mudou = await inserirAtualizarOrdemServico(dados);
                        if (mudou) {
                            inseridos++;
                            cacheMisses++;
                        }
                        // Atualizar cache com os novos dados
                        atualizarCache(dados);
                    } else {
                        // Dados não mudaram - cache hit
                        cacheHits++;
                        // Ainda assim atualizar timestamp do cache para este registro
                        atualizarCache(dados);
                    }
                }

                // Salvar cache em arquivo periodicamente (a cada 10 iterações ou quando houver mudanças significativas)
                if (inseridos > 0 || Math.random() < 0.1) { // 10% de chance ou quando houver inserções
                    salvarCache();
                }

                log(`Atualização concluída. Inseridos/atualizados: ${inseridos}, Cache hits: ${cacheHits}, Cache misses: ${cacheMisses}`);

                // Emite heartbeat para indicar atividade
                console.log('HEARTBEAT');

                await new Promise(resolve => setTimeout(resolve, INTERVAL_MS));
            } catch (error) {
                log('Erro durante atualização dos dados: ' + error.message);
                await sendTelegramAlert('❌ Erro na atualização dos dados, tentando reiniciar sessão.');

                try {
                    if (browser) await browser.close();
                } catch {}

                try {
                    browser = await chromium.launch({ headless: true });
                    page = await browser.newPage();
                    const loginOk = await realizarLogin(page);
                    if (!loginOk) throw new Error('Login falhou após erro.');
                    await page.goto('https://gets.ceb.unicamp.br/nec/view/pendencias/consulta.jsf', { waitUntil: 'networkidle' });
                } catch (err) {
                    log('Erro ao reinicializar navegador e página: ' + err.message);
                    await sendTelegramAlert('❌ Falha ao reinicializar navegador após erro crítico.');
                    return;
                }
            }
        }
    } catch (error) {
        log('Erro crítico na automação: ' + error.message);
        await sendTelegramAlert('❌ Erro crítico na automação: ' + error.message);
    } finally {
        try {
            if (browser) await browser.close();
        } catch {}

        // Salvar cache final antes de encerrar
        salvarCache();
        log('Finalizando automação.');
    }
}

main();
