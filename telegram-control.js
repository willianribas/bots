const TelegramBot = require('node-telegram-bot-api');
const { spawn } = require('child_process');

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

function startMonitor() {
    if (isMonitorRunning) {
        return '⚠️ O monitor da automação já está em execução.';
    }

    try {
        monitorProcess = spawn('node', ['automacao.js'], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        monitorProcess.stdout.on('data', (data) => {
            const text = data.toString();
            console.log(`[Monitor stdout] ${text}`);

            if (text.includes('HEARTBEAT')) {
                lastHeartbeat = Date.now();
                console.log(`[Heartbeat] recebido em ${new Date(lastHeartbeat).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
            }
        });

        monitorProcess.stderr.on('data', (data) => {
            console.error(`[Monitor stderr] ${data.toString()}`);
        });

        monitorProcess.on('exit', (code) => {
            const msg = `⚠️ O monitor da automação foi finalizado. Código de saída: ${code}.`;
            console.log(msg);
            bot.sendMessage(TELEGRAM_CHAT_ID, msg);
            isMonitorRunning = false;
            monitorProcess = null;
            stopHeartbeatMonitor();
        });

        monitorProcess.on('error', (error) => {
            const msg = `❌ Falha ao iniciar o monitor: ${error.message}`;
            console.error(msg);
            bot.sendMessage(TELEGRAM_CHAT_ID, msg);
            isMonitorRunning = false;
            monitorProcess = null;
            stopHeartbeatMonitor();
        });

        isMonitorRunning = true;
        lastHeartbeat = Date.now();

        startHeartbeatMonitor();

        return '✅ Monitor da automação iniciado com sucesso.';
    } catch (error) {
        return `❌ Erro ao iniciar o monitor: ${error.message}`;
    }
}

function stopMonitor() {
    if (!isMonitorRunning || !monitorProcess) {
        return 'ℹ️ O monitor da automação não está em execução no momento.';
    }

    try {
        stopHeartbeatMonitor();
        monitorProcess.kill('SIGTERM');
        isMonitorRunning = false;
        monitorProcess = null;
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

    // Verificar horário atual
    const now = new Date();
    const spTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const hora = spTime.getHours();
    const minuto = spTime.getMinutes();
    const horarioAtual = `${hora.toString().padStart(2, '0')}:${minuto.toString().padStart(2, '0')}`;

    const horarioComercial = `Horário comercial: 06:45 às 19:45 (SP)`;
    const statusHorario = (hora >= 6 && minuto >= 45 && hora <= 19 && minuto <= 45)
        ? `🕐 Dentro do horário comercial (${horarioAtual})`
        : `🌙 Fora do horário comercial (${horarioAtual})`;

    return `🟢 Monitor da automação está rodando.\n\n` +
           `📅 Último heartbeat recebido: ${lastBeatTime}\n` +
           `💓 Status do heartbeat: ${heartbeatStatus}\n\n` +
           `${horarioComercial}\n` +
           `${statusHorario}`;
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

const keyboard = {
    reply_markup: {
        inline_keyboard: [
            [{ text: '▶️ Iniciar Automação', callback_data: 'start' }],
            [{ text: '⏹ Parar Automação', callback_data: 'stop' }],
            [{ text: '🔄 Reiniciar Automação', callback_data: 'restart' }],
            [{ text: 'ℹ️ Status Atual', callback_data: 'status' }]
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
    } else {
        response = '❌ Comando desconhecido.';
    }

    await bot.sendMessage(msg.chat.id, response, { parse_mode: 'Markdown' });
    await bot.answerCallbackQuery(callbackQuery.id).catch(() => {});
});

console.log('🤖 Bot Telegram para controle do Monitor GETS iniciado com interface profissional e suporte a Heartbeat.');
console.log('📩 Envie uma mensagem para o bot para abrir o menu de controle.');
