bbconst TelegramBot = require('node-telegram-bot-api');
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const TELEGRAM_TOKEN = '8002781004:AAFRlLnlVboI80oU_TSV2JX1-EbcN-4YXu0';
const TELEGRAM_CHAT_ID = '1494275780';

// Intervalos em ms para heartbeat
const HEARTBEAT_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutos
const HEARTBEAT_CHECK_INTERVAL = 30 * 1000; // 30 segundos

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

let monitorProcess = null;
let isMonitorRunning = false;
let lastHeartbeat = 0;
let heartbeatCheckInterval = null;
let buscarOSMode = false;
let buscaTimeout = null;

// Configurações da automação
const LOG_FILE = path.resolve(__dirname, 'automacao_gets.log');
const CACHE_FILE = path.resolve(__dirname, 'automacao_cache.json');
const INTERVAL_MS = 60000; // 1 minuto
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos de TTL para o cache

// Horário de funcionamento: 6:45 às 19:45 (horário de São Paulo)
const HORARIO_INICIO = { hora: 6, minuto: 45 };
const HORARIO_FIM = { hora: 19, minuto: 45 };

// Configurações do Supabase
const SUPABASE_URL = 'https://ytytltrxazwqpjxuikcv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0eXRsdHJ4YXp3cXBqeHVpa2N2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI4NDY5OTIsImV4cCI6MjA3ODQyMjk5Mn0.C5mE2yFO-2B8Lzl7i0RD6d7QrMzWt5qtPqHqsXHpNuk';

const LOGIN_EMAIL = 'williann.dev@gmail.com';
const LOGIN_SENHA = '@1Bento396127';

// Cliente Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let cacheDados = new Map(); // Cache em memória para dados atuais
let cacheTimestamp = 0; // Timestamp do último cache válido
let shouldStopAutomation = false; // Flag para parar automação

// Sistema de Cache Inteligente
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
        log(`CACHE: OS ${chave} nova, será salva`);
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

    let mudou = false;
    for (const campo of camposComparar) {
        if (dadosAntigos[campo] !== dadosNovos[campo]) {
            log(`MUDANCA: OS ${chave} campo '${campo}' mudou: '${dadosAntigos[campo]}' → '${dadosNovos[campo]}'`);
            mudou = true;
        }
    }

    // Verificar data de abertura (comparar apenas a data, não hora)
    const dataAberturaAntiga = dadosAntigos.data_abertura ?
        (typeof dadosAntigos.data_abertura === 'string' ? dadosAntigos.data_abertura.split('T')[0] : dadosAntigos.data_abertura) : null;
    const dataAberturaNova = dadosNovos.data_abertura ?
        dadosNovos.data_abertura.toISOString().split('T')[0] : null;

    if (dataAberturaAntiga !== dataAberturaNova) {
        log(`MUDANCA: OS ${chave} data_abertura mudou: '${dataAberturaAntiga}' → '${dataAberturaNova}'`);
        mudou = true;
    }

    if (!mudou) {
        log(`CACHE: OS ${chave} não mudou, pulando`);
    }

    return mudou;
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

function log(message) {
    const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    fs.appendFileSync(LOG_FILE, logMessage + '\n');
}

function estaNoHorarioFuncionamento() {
    // REMOVIDO: Agora a automação roda sempre que for chamada (sem restrição de horário)
    return true;
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

async function sendTelegramAlert(message) {
    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await bot.sendMessage(TELEGRAM_CHAT_ID, message);
            return; // Sucesso, sair da função
        } catch (error) {
            lastError = error;
            log(`${attempt}/${maxRetries} - Erro ao enviar alerta Telegram: ${error.message}`);

            // Se é erro de DNS/conectividade, aguardar e tentar novamente
            if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNRESET') || error.message.includes('EFATAL')) {
                if (attempt < maxRetries) {
                    const waitTime = attempt * 5000; // 5s, 10s, 15s
                    log(`Tentando novamente em ${waitTime / 1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    continue;
                }
            } else {
                // Se não é erro de conectividade, não tentar novamente
                break;
            }
        }
    }

    // Se chegou aqui, todas as tentativas falharam
    log(`❌ Todas ${maxRetries} tentativas de Telegram falharam. Alerta não enviado: ${message}`);
}

// Função para início completo da automação
async function startAutomationInternally(autoStarted = false) {
    if (autoStarted) {
        log('Iniciando automação automática na inicialização do sistema.');
    } else {
        log('Iniciando automação via comando manual.');
    }

    sendTelegramAlert('▶️ Automação iniciada (modo integrado).');

    let browser;
    let page;
    let estavaEmPausa = false;

    try {
        // CARREGAR CACHE (apenas dados atuais da tela GETS - eficiência máxima)
        carregarCache();

        const conn = await conectarBanco();
        if (!conn) return;
        await verificarTabelas();

        // Se iniciou automaticamente, definir flags externas
        if (autoStarted) {
            isMonitorRunning = true;
            lastHeartbeat = Date.now();
            startHeartbeatMonitor();
            log('Flags externas configuradas para monitoramento automático.');
        }

        browser = await chromium.launch({ headless: true });
        page = await browser.newPage();

        const loginOk = await realizarLogin(page);
        if (!loginOk) throw new Error('Login falhou.');

        await page.goto('https://gets.ceb.unicamp.br/nec/view/pendencias/consulta.jsf', { waitUntil: 'networkidle' });

        while (true) {
            if (shouldStopAutomation) {
                log('Automação parada via comando.');
                shouldStopAutomation = false; // Reset flag
                return;
            }
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

                // Forçar atualização diária de todas as OS (uma vez por dia) para garantir sincronia
                const agora = new Date();
                const spTime = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
                const minutosDoDia = spTime.getHours() * 60 + spTime.getMinutes();

                // Forçar atualização às 8:00 SP (uma vez por dia)
                const forcarAtuailizacaoDiaria = minutosDoDia >= 480 && minutosDoDia < 490; // 8:00-8:09

                // Salvar cache em arquivo periodicamente (a cada 10 iterações ou quando houver mudanças)
                if (inseridos > 0 || Math.random() < 0.1 || forcarAtuailizacaoDiaria) { // 10% de chance ou quando houver inserções ou atualização diária
                    if (forcarAtuailizacaoDiaria) {
                        log('ATUALIZAÇÃO DIÁRIA: Forçando atualização de todas as OS para garantir sincronia.');
                        await salvarTudoDiretoNoBanco(validDados); // Forçar salvamento direto
                    }
                    salvarCache();
                }

                log(`Atualização concluída. Inseridos/atualizados: ${inseridos}, Cache hits: ${cacheHits}, Cache misses: ${cacheMisses}`);

                // Emite heartbeat para indicar atividade
                lastHeartbeat = Date.now();
                log('Heartbeat atualizado.');

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
        sendTelegramAlert('❌ Erro crítico na automação: ' + error.message);

        // Auto-restart após erro crítico
        setTimeout(() => {
            log('Tentando reiniciar automação após erro crítico.');
            startAutomationInternally(false); // Não é auto-started, é restart
        }, 30000); // Esperar 30 segundos antes de tentar
    } finally {
        try {
            if (browser) await browser.close();
        } catch {}

        // Salvar cache final antes de encerrar
        salvarCache();
        log('Finalizando automação.');
    }
}

// CARREGAR TODAS AS OS DO BANCO PARA RASTRAMENTO COMPLETO
async function carregarTodasOSDoBancoParaMonitoramento() {
    try {
        log('CARREGANDO todas as OS existentes no banco para monitoramento completo...');

        const { data: todasOS, error } = await supabase
            .from('ordens_servico')
            .select('*')
            .order('numero_os');

        if (error) {
            log(`ERRO ao carregar OS do banco: ${error.message}`);
            return false;
        }

        if (!todasOS || todasOS.length === 0) {
            log('BANCO vazio - nenhuma OS para rastrear ainda.');
            return true;
        }

        let carregadas = 0;
        for (const os of todasOS) {
            const chave = os.numero_os;

            // Verificar se já existe no cache
            if (!cacheDados.has(chave)) {
                // Adicionar ao cache com estrutura completa
                const dadosCache = {
                    origem: os.origem || '',
                    numero_os: os.numero_os,
                    codigo_equipamento: os.codigo_equipamento || '',
                    descricao_equipamento: os.descricao_equipamento || '',
                    criticidade: os.criticidade || 'Não',
                    status: os.status || '',
                    data_abertura: os.data_abertura,
                    dias_aberta: os.dias_aberta || 0,
                    nome_executor: os.nome_executor || '',
                    ultima_atualizacao: Date.now()
                };

                cacheDados.set(chave, dadosCache);
                carregadas++;
            }
        }

        log(`BANCO → CACHE: ${carregadas} OS carregadas do banco para monitoramento. Total no cache: ${cacheDados.size}`);
        return true;

    } catch (error) {
        log(`ERRO crítico ao carregar OS do banco: ${error.message}`);
        await sendTelegramAlert(`❌ **ERRO CRÍTICO** - Falha ao carregar histórico do banco!\n\n${error.message}`);
        return false;
    }
}

// Função para forçar atualização de todas as OS diretamente no banco
async function salvarTudoDiretoNoBanco(validDados) {
    let forçados = 0;
    for (const dados of validDados) {
        try {
            // Forçar update no banco independente do cache
            const mudou = await inserirAtualizarOrdemServico(dados);
            if (mudou) {
                forçados++;
            }
        } catch (error) {
            log(`Erro ao forçar salvamento da OS ${dados.numero_os}: ${error.message}`);
        }
    }
    log(`ATUALIZAÇÃO DIÁRIA: ${forçados} OS forçadamente atualizadas no banco.`);
}

// Função adicional: ATUALIZAR TODAS AS OS DO BANCO A CADA HORÁRIO
async function atualizarTodasOSExistentes() {
    try {
        const todasChaves = Array.from(cacheDados.keys());
        let atualizadas = 0;
        let erros = 0;

        log(`VERIFICANDO ${todasChaves.length} OS existentes no banco...`);

        for (const numeroOS of todasChaves) {
            try {
                // Buscar estado atual no banco
                const { data: estadoBanco, error } = await supabase
                    .from('ordens_servico')
                    .select('*')
                    .eq('numero_os', numeroOS)
                    .single();

                if (error || !estadoBanco) {
                    erros++;
                    continue;
                }

                // Se OS não aparece mais na tela principal, marcar como "fora da tela"
                if (estadoBanco && !estadoBanco.ultima_atualizacao_visual) {
                    // Log específico para OS que estão "adormecidas"
                    log(`MONITORAMENTO: OS ${numeroOS} continua sendo monitorada mesmo sem aparecer na tela principal.`);
                }

                atualizadas++;

            } catch (err) {
                erros++;
                // Silenciar erros individuais
            }
        }

        if (erros === 0) {
            log(`MONITORAMENTO: ${atualizadas} OS verificadas - todas bem rastreadas.`);
        } else {
            log(`MONITORAMENTO: ${atualizadas} verificadas, ${erros} com problemas.`);
        }

    } catch (error) {
        log(`Erro geral na verificação de OS existentes: ${error.message}`);
    }
}

function startMonitor() {
    if (isMonitorRunning) {
        return '⚠️ O monitor da automação já está em execução.';
    }

    try {
        // Iniciar a automação internamente
        startAutomationInternally(false);

        isMonitorRunning = true;
        lastHeartbeat = Date.now();

        startHeartbeatMonitor();

        return '✅ Monitor da automação iniciado com sucesso.';
    } catch (error) {
        return `❌ Erro ao iniciar o monitor: ${error.message}`;
    }
}

function stopMonitor() {
    if (!isMonitorRunning) {
        return 'ℹ️ O monitor da automação não está em execução no momento.';
    }

    try {
        shouldStopAutomation = true; //definir flag para parar
        stopHeartbeatMonitor();
        isMonitorRunning = false;
        log('Comando de parada enviado para automação.');
        return '🛑 Monitor da automação parado com sucesso.';
    } catch (error) {
        return `❌ Falha ao parar o monitor da automação: ${error.message}`;
    }
}

async function restartMonitor() {
    const stopResult = stopMonitor();
    if (stopResult.startsWith('❌')) {
        return `❌ Erro ao tentar parar o monitor: ${stopResult}`;
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
    return startMonitor();
}

function getStatus() {
    if (!isMonitorRunning) return '🔴 O monitor da automação está parado. Use o botão ▶️ para iniciar.';

    const sinceHeartbeat = Date.now() - lastHeartbeat;
    const heartbeatStatus = sinceHeartbeat < HEARTBEAT_TIMEOUT_MS
        ? '❤️ Monitor ativo e enviando heartbeat normalmente.'
        : `⚠️ Nenhum heartbeat recebido nos últimos ${Math.floor(sinceHeartbeat / 1000)} segundos. Verifique a automação.`;

    const lastBeatTime = new Date(lastHeartbeat).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    // Verificar horário de execução (24/7)
    const now = new Date();
    const spTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const hora = spTime.getHours();
    const minuto = spTime.getMinutes();
    const horarioAtual = `${hora.toString().padStart(2, '0')}:${minuto.toString().padStart(2, '0')}`;

    const modoOperacao = `⏰ Modo: 24 horas por dia (sempre ativo)`;

    return `🟢 Monitor da automação está rodando.\n\n` +
           `📅 Último heartbeat recebido: ${lastBeatTime}\n` +
           `�💓 Status do heartbeat: ${heartbeatStatus}\n\n` +
           `${modoOperacao} - Horário atual: ${horarioAtual} (SP)`;
}

function startHeartbeatMonitor() {
    if (heartbeatCheckInterval) clearInterval(heartbeatCheckInterval);

    heartbeatCheckInterval = setInterval(() => {
        if (!isMonitorRunning) {
            clearInterval(heartbeatCheckInterval);
            heartbeatCheckInterval = null;
            return;
        }
        const sinceHeartbeat = Date.now() - lastHeartbeat;
        if (sinceHeartbeat > HEARTBEAT_TIMEOUT_MS) {
            bot.sendMessage(TELEGRAM_CHAT_ID, `⚠️ *ALERTA*:\n\n` +
                `Nenhum heartbeat detectado nos últimos ${Math.floor(sinceHeartbeat / 1000)} segundos.\n` +
                `Por favor, verifique se a automação está em execução corretamente.`, { parse_mode: 'Markdown' });
        }
    }, HEARTBEAT_CHECK_INTERVAL);
}

function stopHeartbeatMonitor() {
    if (heartbeatCheckInterval) {
        clearInterval(heartbeatCheckInterval);
        heartbeatCheckInterval = null;
    }
}

function isAuthorized(msg) {
    return msg.chat.id.toString() === TELEGRAM_CHAT_ID;
}

// FUNÇÃO PARA OBTER ESTATÍSTICAS DA AUTOMAÇÃO
async function getEstatisticas() {
    try {
        // Contar OS por status
        const { data: statusCount, error: statusError } = await supabase
            .from('ordens_servico')
            .select('status, count');

        if (statusError) {
            log(`Erro ao buscar estatísticas: ${statusError.message}`);
            return `❌ Erro ao buscar estatísticas do banco de dados.`;
        }

        // Contar OS críticas
        const { data: criticas, error: critError } = await supabase
            .from('ordens_servico')
            .select('criticidade', { count: 'exact' })
            .eq('criticidade', 'Sim');

        // Calcular médias de tempo
        const { data: mediaTempo, error: timeError } = await supabase
            .from('ordens_servico')
            .select('dias_aberta, status')
            .neq('status', 'CO'); // Não contar OS encerradas

        let mediaDiasAberto = 0;
        let totalOSAtivas = mediaTempo?.length || 0;

        if (mediaTempo && mediaTempo.length > 0) {
            const somaDias = mediaTempo.reduce((acc, os) => acc + (os.dias_aberta || 0), 0);
            mediaDiasAberto = (somaDias / mediaTempo.length).toFixed(1);
        }

        const totalOS = statusCount?.[0]?.count || 0;
        const totalCriticas = criticas?.length || 0;

        return `📊 *ESTATÍSTICAS DA AUTOMAÇÃO*\n\n` +
               `🗂️ **OS Totais no Sistema:** ${totalOS}\n` +
               `🟠 **OS Ativas:** ${totalOSAtivas}\n` +
               `🔴 **OS Críticas:** ${totalCriticas}\n` +
               `📅 **Tempo Médio Aberto:** ${mediaDiasAberto} dias\n` +
               `📦 **OS no Cache Local:** ${cacheDados.size}\n\n` +
               `💡 **Sistema funcionando normalmente!**`;

    } catch (error) {
        log(`Erro ao gerar estatísticas: ${error.message}`);
        return `❌ Erro interno ao processar estatísticas.`;
    }
}

// FUNÇÃO PARA BUSCAR OS ESPECÍFICA
async function buscarOS(numeroOS) {
    try {
        // Primeiro tenta no cache local
        const dadosCache = cacheDados.get(numeroOS);

        if (dadosCache) {
            return `🔍 *OS ${numeroOS} - CACHE LOCAL*\n\n` +
                   `🏷️ **Código Equipamento:** ${dadosCache.codigo_equipamento}\n` +
                   `📝 **Descrição:** ${dadosCache.descricao_equipamento}\n` +
                   `🎯 **Status:** ${dadosCache.status}\n` +
                   `⚠️ **Crítica:** ${dadosCache.criticidade}\n` +
                   `👤 **Executor:** ${dadosCache.nome_executor}\n` +
                   `📅 **Dias Aberto:** ${dadosCache.dias_aberta}\n` +
                   `🔗 **Origem:** ${dadosCache.origem}\n\n` +
                   `(Informações do cache atual)`;
        }

        // Se não está no cache, busca no banco
        const { data: osBanco, error } = await supabase
            .from('ordens_servico')
            .select('*')
            .eq('numero_os', numeroOS)
            .single();

        if (error || !osBanco) {
            return `❌ *OS ${numeroOS} NÃO ENCONTRADA*\n\nA OS especificada não existe no sistema ou não foi monitorada ainda.`;
        }

        return `🔍 *OS ${numeroOS} - BANCO DE DADOS*\n\n` +
               `🏷️ **Código Equipamento:** ${osBanco.codigo_equipamento}\n` +
               `📝 **Descrição:** ${osBanco.descricao_equipamento}\n` +
               `🎯 **Status:** ${osBanco.status}\n` +
               `⚠️ **Crítica:** ${osBanco.criticidade}\n` +
               `👤 **Executor:** ${osBanco.nome_executor}\n` +
               `📅 **Dias Aberto:** ${osBanco.dias_aberta}\n` +
               `🔗 **Origem:** ${osBanco.origem}\n\n` +
               `(Informações do banco de dados)`;

    } catch (error) {
        log(`Erro ao buscar OS ${numeroOS}: ${error.message}`);
        return `❌ Erro ao buscar OS ${numeroOS}. Tente novamente.`;
    }
}

// FUNÇÃO PARA LIMPAR CACHE MANUALMENTE
async function limparCacheManual() {
    try {
        const registrosAntes = cacheDados.size;
        cacheDados.clear();

        // Salva cache vazio
        salvarCache();

        log(`CACHE LIMPO: ${registrosAntes} registros removidos manualmente via Telegram.`);

        return `🧹 *CACHE LIMPO COM SUCESSO*\n\n` +
               `🗂️ **Registros removidos:** ${registrosAntes}\n` +
               `📦 **Cache agora:** ${cacheDados.size} registros\n\n` +
               `O cache será reconstruído automaticamente na próxima execução da automação.`;

    } catch (error) {
        log(`Erro ao limpar cache manual: ${error.message}`);
        return `❌ Erro ao limpar cache. Tente novamente.`;
    }
}

const keyboard = {
    reply_markup: {
        inline_keyboard: [
            [{ text: '▶️ Iniciar Automação', callback_data: 'start' }, { text: '⏹ Parar Automação', callback_data: 'stop' }],
            [{ text: '🔄 Reiniciar Automação', callback_data: 'restart' }, { text: 'ℹ️ Status Atual', callback_data: 'status' }],
            [{ text: '📊 Estatísticas', callback_data: 'stats' }, { text: '🔍 Buscar OS', callback_data: 'search_os' }],
            [{ text: '🧹 Limpar Cache', callback_data: 'clear_cache' }, { text: '❌ Sair', callback_data: 'exit' }]
        ]
    }
};

function sendMenu(chatId) {
    bot.sendMessage(chatId, '📋 *Menu de Controle da Automação*\n\nSelecione uma das opções abaixo:', { reply_markup: keyboard.reply_markup, parse_mode: 'Markdown' });
}

bot.on('message', (msg) => {
    if (!isAuthorized(msg)) {
        bot.sendMessage(msg.chat.id, '🚫 *Acesso negado!* Você não está autorizado a usar este bot.', { parse_mode: 'Markdown' });
        return;
    }

    // Se está no modo de busca de OS, processar a entrada
    if (buscarOSMode && msg.text) {
        buscarOSMode = false; // Desativar modo de busca
        if (buscaTimeout) {
            clearTimeout(buscaTimeout);
            buscaTimeout = null;
        }

        const numeroOS = msg.text.trim();

        // Validar formato da OS (deve ter ponto)
        if (!numeroOS.includes('.') || numeroOS.length < 5) {
            bot.sendMessage(msg.chat.id, '❌ *Formato inválido!*\n\nUse o formato correto: `25.1234` (ano.mes)', { parse_mode: 'Markdown' });
            return;
        }

        // Processar busca assíncrona
        buscarOS(numeroOS).then(resultado => {
            bot.sendMessage(msg.chat.id, resultado, { parse_mode: 'Markdown' });
        }).catch(error => {
            log(`Erro na busca da OS ${numeroOS}: ${error.message}`);
            bot.sendMessage(msg.chat.id, '❌ Erro interno ao processar a busca.', { parse_mode: 'Markdown' });
        });

        return; // Não mostrar menu principal
    }

    // Menu principal para outras mensagens
    sendMenu(msg.chat.id);
});

bot.on('callback_query', async (callbackQuery) => {
    const action = callbackQuery.data;
    const msg = callbackQuery.message;

    if (!isAuthorized(msg)) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: '🚫 Acesso negado.', show_alert: true }).catch(() => {});
        return;
    }

    let response = '';

    if (action === 'start') {
        response = startMonitor();
    } else if (action === 'stop') {
        response = stopMonitor();
    } else if (action === 'restart') {
        response = await restartMonitor();
    } else if (action === 'status') {
        response = getStatus();
    } else if (action === 'stats') {
        response = await getEstatisticas();
    } else if (action === 'search_os') {
        response = 'Digite o número da OS que deseja buscar (ex: 25.1234):';
        // Aqui pediria para o usuário digitar a OS
        buscarOSMode = true;
        buscaTimeout = setTimeout(() => { buscarOSMode = false; }, 5 * 60 * 1000); // 5 minutos
    } else if (action === 'clear_cache') {
        response = await limparCacheManual();
    } else if (action === 'exit') {
        response = '❌ Menu fechado. Envie qualquer mensagem para reabrir o menu.';
    } else {
        response = '❌ Comando desconhecido.';
    }

    await bot.sendMessage(msg.chat.id, response, { parse_mode: 'Markdown' });
    await bot.answerCallbackQuery(callbackQuery.id).catch(() => {});
});

console.log('🤖 Bot Telegram para controle do Monitor GETS iniciado com interface profissional e suporte a Heartbeat.');
console.log('📩 Envie uma mensagem para o bot para abrir o menu de controle.');
console.log('⚙️ Iniciando automação automática...');

// Iniciar automação automaticamente na inicialização
startAutomationInternally(true);
