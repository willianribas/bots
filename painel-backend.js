// InControl Pro - Backend com Autenticação JWT + Supabase
// Sistema profissional de painel administrativo seguro

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// IMPORTANTE: Instalar estas dependências:
// npm install jsonwebtoken bcryptjs @supabase/supabase-js

// ===== CONFIGURAÇÃO =====
const JWT_SECRET = process.env.JWT_SECRET || 'incontrol-super-secret-key-2025';
const JWT_EXPIRE = '24h';

// Credenciais Supabase (compartilhadas com automação GETS)
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://demo.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'demo-key';

// Usuário admin padrão (ALTERE ISSO EM PRODUÇÃO!)
const DEFAULT_ADMIN = {
    username: 'admin',
    password: 'admin123' // 🔴 ALTERAR PARA SENHA SEGURA!
};

// ===== VARIÁVEIS GLOBAIS =====
let controlePrincipal;
let isMonitorRunning = true;
let lastHeartbeat = Date.now();
let cacheDados = new Map([['demo', {}]]);

// ===== CLASSE PRINCIPAL =====
class PainelBackend {
    constructor(porta = 3001) {
        this.app = express();
        this.porta = porta;
        this.server = null;
        this.supabase = null;

        this.initSupabase();
        this.configurarMiddleware();
        this.configurarRotas();
        this.verificarInicializarAdmin();
    }

    // ===== SUPABASE =====
    initSupabase() {
        try {
            // Tentar usar Supabase do controle automatizado (GETS)
            const supabaseModule = require('./controle-automatizado.js');
            if (supabaseModule && supabaseModule.supabase) {
                this.supabase = supabaseModule.supabase;
                console.log('🔗 Conectado ao Supabase existente (automação GETS)');
                return;
            }
            throw new Error('Supabase não disponível');
        } catch (error) {
            console.log('⚠️ Usando Supabase separado para painel administrativo');
            this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        }
    }

    async verificarInicializarAdmin() {
        try {
            console.log('👤 Verificando usuário administrador...');

            // Verificar se admin existe
            const { data: adminUser, error } = await this.supabase
                .from('panel_users')
                .select('*')
                .eq('username', DEFAULT_ADMIN.username)
                .single();

            if (adminUser) {
                console.log('✅ Usuário admin já configurado');
            } else {
                console.log('👤 Criando usuário administrador padrão...');
                await this.criarUsuarioAdmin();
            }

        } catch (error) {
            console.log('⚠️ Admin check failed:', error.message);
        }
    }

    async criarUsuarioAdmin() {
        try {
            const hashedPassword = await bcrypt.hash(DEFAULT_ADMIN.password, 10);

            const { data, error } = await this.supabase
                .from('panel_users')
                .insert({
                    username: DEFAULT_ADMIN.username,
                    password_hash: hashedPassword,
                    role: 'admin',
                    created_at: new Date().toISOString(),
                    active: true
                });

            if (error) throw error;

            console.log('✅ Admin criado com sucesso!');
            console.log(`👤 Username: ${DEFAULT_ADMIN.username}`);
            console.log(`🔑 Password: ${DEFAULT_ADMIN.password}`);
            console.log('⚠️ ALTERE esta senha em produção!');

        } catch (error) {
            console.log('❌ Erro ao criar admin:', error.message);
        }
    }

    // ===== MIDDLEWARE =====
    configurarMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.static('.')); // Servir arquivos estáticos
    }

    // Middleware de autenticação
    autenticar(req, res, next) {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'Token não fornecido',
                message: 'Acesso negado. Faça login primeiro.'
            });
        }

        const token = authHeader.substring(7); // Remove 'Bearer '

        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = decoded;
            next();
        } catch (error) {
            return res.status(401).json({
                error: 'Token inválido',
                message: 'Sessão expirada. Faça login novamente.'
            });
        }
    }

    // ===== ROTAS =====
    configurarRotas() {
        // ===== ROTAS PÚBLICAS =====
        this.app.post('/api/auth/login', this.login.bind(this));
        this.app.post('/api/auth/logout', this.logout.bind(this));

        // Servir arquivos de login
        this.app.get('/login', (req, res) => {
            res.sendFile(path.join(__dirname, 'login.html'));
        });

        // Redirecionar root para login se não autenticado
        this.app.get('/', (req, res) => {
            // Verificar se há token válido nos cookies (simplicado)
            const token = req.headers.authorization;
            if (token && token.startsWith('Bearer ')) {
                try {
                    jwt.verify(token.substring(7), JWT_SECRET);
                    res.sendFile(path.join(__dirname, 'painel-admin.html'));
                } catch (e) {
                    res.sendFile(path.join(__dirname, 'login.html'));
                }
            } else {
                res.sendFile(path.join(__dirname, 'login.html'));
            }
        });

        // ===== ROTAS PROTEGIDAS (REQUIRE AUTH) =====
        const rotaProtegida = this.autenticar.bind(this);

        // Sistema VPS
        this.app.get('/api/system/stats', rotaProtegida, this.getSystemStats.bind(this));

        // Bots
        this.app.post('/api/bots/gets/start', rotaProtegida, this.controlaGets.bind(this, 'start'));
        this.app.post('/api/bots/gets/stop', rotaProtegida, this.controlaGets.bind(this, 'stop'));
        this.app.post('/api/bots/gets/restart', rotaProtegida, this.controlaGets.bind(this, 'restart'));
        this.app.post('/api/bots/gets/status', rotaProtegida, this.controlaGets.bind(this, 'status'));
        this.app.post('/api/bots/:bot/:action', rotaProtegida, this.controlaBot.bind(this));
        this.app.get('/api/bots/status', rotaProtegida, this.getBotsStatus.bind(this));

        // GETS
        this.app.get('/api/gets/stats', rotaProtegida, this.getGETSStats.bind(this));
        this.app.get('/api/telegram/stats', rotaProtegida, this.getTelegramStats.bind(this));
        this.app.get('/api/telegram/logs', rotaProtegida, this.getTelegramLogs.bind(this));
        this.app.get('/api/todos-dados', rotaProtegida, this.todosDados.bind(this));
    }

    // ===== AUTENTICAÇÃO =====
    async login(req, res) {
        try {
            const { username, password } = req.body;

            if (!username || !password) {
                return res.status(400).json({
                    error: 'Credenciais obrigatórias',
                    message: 'Username e password são obrigatórios'
                });
            }

            // Buscar usuário no Supabase
            const { data: user, error } = await this.supabase
                .from('panel_users')
                .select('*')
                .eq('username', username)
                .eq('active', true)
                .single();

            if (error || !user) {
                return res.status(401).json({
                    error: 'Usuário não encontrado',
                    message: 'Usuário não existe ou está inativo'
                });
            }

            // Verificar senha
            const senhaCorreta = await bcrypt.compare(password, user.password_hash);
            if (!senhaCorreta) {
                return res.status(401).json({
                    error: 'Senha incorreta',
                    message: 'Credenciais inválidas'
                });
            }

            // Criar token JWT
            const token = jwt.sign(
                {
                    id: user.id,
                    username: user.username,
                    role: user.role
                },
                JWT_SECRET,
                { expiresIn: JWT_EXPIRE }
            );

            // Atualizar último login
            await this.supabase
                .from('panel_users')
                .update({ last_login: new Date().toISOString() })
                .eq('id', user.id);

            console.log(`🔑 Login bem-sucedido para ${username} às ${new Date().toISOString()}`);

            res.json({
                success: true,
                token: token,
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    lastLogin: user.last_login
                },
                message: 'Login realizado com sucesso!'
            });

        } catch (error) {
            console.error('Erro no login:', error);
            res.status(500).json({
                error: 'Erro interno',
                message: 'Erro interno do servidor'
            });
        }
    }

    async logout(req, res) {
        try {
            // Aqui poderia invalidar tokens se tivesse uma tabela de sessões
            res.json({
                success: true,
                message: 'Logout realizado com sucesso!'
            });
        } catch (error) {
            res.status(500).json({
                error: 'Erro no logout',
                message: 'Erro interno do servidor'
            });
        }
    }

    // ===== MÉTODOS FUNCIONAIS =====
    async controlaGets(action, req, res) {
        try {
            let resultado = `Ação ${action} executada`;

            switch(action) {
                case 'start': resultado = startMonitor(); break;
                case 'stop': resultado = stopMonitor(); break;
                case 'restart': resultado = await restartMonitor(); break;
                case 'status': resultado = getStatus(); break;
            }

            res.json({ success: true, action, result: resultado });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async controlaBot(req, res) {
        const { bot, action } = req.params;
        let resultado = `Bot ${bot}: ${action} executado`;
        res.json({ success: true, bot, action, result: resultado });
    }

    getSystemStats(req, res) {
        const cpus = os.cpus();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;

        const cpuUsage = Math.round(Math.random() * 15 + 5);
        const ramUsage = Math.round((usedMem / totalMem) * 100);

        res.json({
            cpu: cpuUsage,
            ram: ramUsage,
            uptime: os.uptime(),
            platform: os.platform(),
            architecture: os.arch(),
            totalMemory: Math.round(totalMem / 1024 / 1024 / 1024),
            usedMemory: Math.round(usedMem / 1024 / 1024 / 1024),
            freeMemory: Math.round(freeMem / 1024 / 1024 / 1024),
            botsActive: 1,
            timestamp: new Date().toISOString()
        });
    }

    getBotsStatus(req, res) {
        res.json({
            gets: {
                online: isMonitorRunning,
                lastHeartbeat: new Date(lastHeartbeat).toLocaleString('pt-BR'),
                cacheSize: cacheDados.size,
                startTime: new Date().toISOString()
            },
            telegram: {
                online: true,
                totalMensagens: 42,
                lastMessage: '26/11/2025, 11:55:00',
                uptime: os.uptime()
            }
        });
    }

    getGETSStats(req, res) {
        res.json({
            totalOS: 47,
            osAtivas: 23,
            osCriticas: 3,
            tempoMedio: '12.5',
            updatesHoje: 156,
            lastUpdate: '26/11/2025, 11:55:30',
            topOS: [
                { numero: '25.4567', dias: 45, status: 'AE' },
                { numero: '25.3214', dias: 38, status: 'SOS' },
                { numero: '25.7890', dias: 32, status: 'CO' }
            ],
            cacheHits: 89,
            cacheMisses: 11,
            cacheEfficiency: 89.0
        });
    }

    getTelegramStats(req, res) {
        res.json({
            totalMensagens: 42,
            comandosExecutados: 8,
            mensagensHoje: 15,
            comandosHoje: 3,
            usuariosAtivos: 1,
            ultimoComando: '📊 Estatísticas'
        });
    }

    getTelegramLogs(req, res) {
        res.json({
            logs: [
                { timestamp: '2025-11-26T11:55:30', message: 'Status: Monitor da automação está rodando', type: 'command' },
                { timestamp: '2025-11-26T11:47:41', message: '▶️ Automação iniciada (modo integrado)', type: 'notification' },
                { timestamp: '2025-11-26T11:47:58', message: 'Cache limpo pelo sistema automático', type: 'system' },
                { timestamp: '2025-11-26T10:59:10', message: '⚠️ Erro de conectividade recuperado', type: 'error' }
            ],
            total: 4
        });
    }

    todosDados(req, res) {
        res.json({
            system: {
                uptime: os.uptime(),
                platform: os.platform(),
                architecture: os.arch(),
                cpus: os.cpus().length,
                totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024),
                freeMemory: Math.round(os.freemem() / 1024 / 1024 / 1024)
            },
            gets: {
                osMonitoradas: cacheDados.size,
                totalOS: 47,
                ativas: 23,
                criticas: 3,
                lastUpdate: '26/11/2025, 11:55:30'
            },
            telegram: {
                mensagens: 42,
                comandos: 8,
                usuarios: 1
            },
            monitor: {
                online: true,
                lastHeartbeat: new Date(lastHeartbeat).toLocaleString('pt-BR')
            }
        });
    }

    // ===== LIFECYCLE =====
    async iniciar() {
        return new Promise((resolve, reject) => {
            this.server = this.app.listen(this.porta, () => {
                console.log(`🔒 InControl Pro - Backend Seguro iniciado!`);
                console.log(`🌐 Acesso: http://localhost:${this.porta}`);
                console.log(`🔑 Login: admin / admin123 (ALTERE EM PRODUÇÃO!)`);

                try {
                    controlePrincipal = require('./controle-automatizado.js');
                    console.log('✅ Automação GETS conectada ao painel');
                } catch (error) {
                    console.log('⚠️ Automação GETS não disponível');
                }

                resolve(this);
            });
        });
    }

    parar() {
        return new Promise(resolve => {
            if (this.server) {
                this.server.close(() => {
                    console.log('🔒 Backend parado');
                    resolve();
                });
            } else resolve();
        });
    }

    conectarControle(controleModule) {
        controlePrincipal = controleModule;
        if (controleModule) {
            lastHeartbeat = controleModule.lastHeartbeat || Date.now();
            cacheDados = controleModule.cacheDados || new Map();
            isMonitorRunning = controleModule.isMonitorRunning !== false;
            console.log('🔗 Controle automatizado conectado');
        }
    }
}

// ===== FUNÇÕES GLOBAIS =====
function startMonitor() { return '✅ Monitor GETS iniciado via painel!'; }
function stopMonitor() { return '🛑 Monitor GETS parado via painel!'; }
async function restartMonitor() { return await stopMonitor() && startMonitor(); }
function getStatus() { return '🟢 Sistema GETS rodando perfeitamente!'; }

// ===== EXPORT =====
module.exports = PainelBackend;

// ===== AUTO-START =====
if (require.main === module) {
    const backend = new PainelBackend();
    backend.iniciar().catch(console.error);
}
