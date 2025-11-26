// InControl Pro - Painel Administrativo Seguro
// Sistema com autenticação JWT e controle completo

class PainelAdmin {
    constructor() {
        this.apiBase = 'http://localhost:3001/api'; // API backend
        this.refreshInterval = 30000; // 30 segundos
        this.charts = {};
        this.token = null;
        this.currentUser = null;

    // Verificar autenticação antes de tudo
        this.checkAuthentication();
    }

    // ===== AUTENTICAÇÃO JWT =====
    checkAuthentication() {
        // Verificar se há token válido no localStorage
        this.token = localStorage.getItem('incontrol_token');
        this.currentUser = JSON.parse(localStorage.getItem('incontrol_user') || 'null');

        if (!this.token || !this.currentUser) {
            console.log('🔒 Usuário não autenticado - redirecionar para login');
            this.redirectToLogin();
            return;
        }

        // Verificar se token ainda é válido
        try {
            const decoded = this.parseJwt(this.token);
            const currentTime = Date.now() / 1000;

            if (decoded.exp < currentTime) {
                console.log('📅 Token expirado - redirecionar para login');
                this.logoutUser();
                this.redirectToLogin();
                return;
            }

            console.log(`✅ Usuário autenticado: ${this.currentUser.username}`);
            // Se passou por todas as verificações, inicializar o painel
            this.init();

        } catch (error) {
            console.log('❌ Token inválido - redirecionar para login');
            this.logoutUser();
            this.redirectToLogin();
        }
    }

    parseJwt(token) {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(atob(base64));
    }

    redirectToLogin() {
        if (window.location.pathname !== '/login') {
            window.location.href = 'login.html';
        }
    }

    logoutUser() {
        // Limpar dados de autenticação
        localStorage.removeItem('incontrol_token');
        localStorage.removeItem('incontrol_user');
        this.token = null;
        this.currentUser = null;
    }

    logout() {
        this.logoutUser();
        this.showToast('Logout realizado com sucesso!', 'success');

        // Pequeno delay para mostrar a mensagem
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 1000);
    }

    init() {
        this.bindEvents();
        this.loadInitialData();
        this.startAutoRefresh();
        this.initTerminal();

        // Inicializar dados simulados para demonstração
        this.simulateLiveData();
        this.startRealtimeUpdates();
        this.initFileManager();
    }

    initTerminal() {
        // Terminal integrado para comandos VPS
        this.terminal = {
            history: [],
            currentHistoryIndex: -1,
            connected: false
        };

        const terminalInput = document.getElementById('terminalInput');
        if (terminalInput) {
            terminalInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.executeTerminalCommand(terminalInput.value);
                    terminalInput.value = '';
                }
            });
        }
    }

    bindEvents() {
        // Sistema de Abas
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.switchTab(e.currentTarget.dataset.tab));
        });

        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(atob(base64));
    }

    redirectToLogin() {
        if (window.location.pathname !== '/login') {
            window.location.href = 'login.html';
        }
    }

    logoutUser() {
        // Limpar dados de autenticação
        localStorage.removeItem('incontrol_token');
        // Botão configurações
        document.getElementById('settingsBtn').addEventListener('click', () => this.openSettings());
    }

    switchTab(tabName) {
        // Atualizar navegação
        document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Esconder todas as abas de conteúdo
        document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));

        // Mostrar aba selecionada
        const selectedContent = document.getElementById(`tab-${tabName}`);
        if (selectedContent) {
            selectedContent.classList.remove('hidden');
        }

        // Atualizar conteúdo específico da aba
        switch(tabName) {
            case 'system':
                this.loadSystemDetails();
                break;
            case 'terminal':
                this.initTerminalContent();
                break;
            case 'files':
                this.loadFiles();
                break;
            case 'logs':
                this.loadLogs();
                break;
            case 'alerts':
                this.loadAlerts();
                break;
        }
    }

    openSettings() {
        // Modal de configurações
        const settingsModal = document.createElement('div');
        settingsModal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        settingsModal.innerHTML = `
            <div class="bg-gray-800 p-6 rounded-lg w-full max-w-md">
                <h3 class="text-lg font-semibold mb-4">Configurações</h3>
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium mb-2">Auto-refresh (segundos)</label>
                        <input type="number" id="refreshRate" value="30" class="w-full bg-gray-700 p-2 rounded">
                    </div>
                    <div class="flex items-center">
                        <input type="checkbox" id="notificationsEnabled" checked class="mr-2">
                        <label class="text-sm">Notificações do Telegram</label>
                    </div>
                </div>
                <div class="mt-6 flex justify-end space-x-2">
                    <button id="closeSettings" class="px-4 py-2 bg-gray-600 rounded">Cancelar</button>
                    <button id="saveSettings" class="px-4 py-2 bg-blue-600 rounded">Salvar</button>
                </div>
            </div>
        `;

        document.body.appendChild(settingsModal);

        document.getElementById('closeSettings').addEventListener('click', () => {
            document.body.removeChild(settingsModal);
        });

        document.getElementById('saveSettings').addEventListener('click', () => {
            const refreshRate = parseInt(document.getElementById('refreshRate').value);
            this.refreshInterval = refreshRate * 1000;
            this.restartAutoRefresh();
            document.body.removeChild(settingsModal);
            this.showToast('Configurações salvas!', 'success');
        });
    }

    restartAutoRefresh() {
        if (this.autoRefreshTimer) clearInterval(this.autoRefreshTimer);
        this.startAutoRefresh();
    }

    loadSystemDetails() {
        // Implementar carregamento de detalhes do sistema
        console.log('Carregando detalhes do sistema...');
    }

    initTerminalContent() {
        // Verificar se terminal já foi inicializado
        if (!this.terminal.connected) {
            this.connectTerminal();
        }
    }

    connectTerminal() {
        try {
            // Simular conexão com terminal do servidor
            this.showToast('Terminal conectado via WebSocket SSH', 'success');
            this.terminal.connected = true;

            const terminal = document.getElementById('terminalContent');
            if (terminal) {
                terminal.innerHTML = '<div class="text-green-400">[Conectado ao servidor Ubuntu]</div>';
            }
        } catch (error) {
            this.showToast('Erro ao conectar terminal', 'error');
        }
    }

    loadFiles() {
        // Simular lista de arquivos
        console.log('Carregando gerenciador de arquivos...');
        this.showToast('Gerenciador de arquivos carregado!', 'success');
    }

    loadLogs() {
        // Carregar logs de todos os sistemas
        console.log('Carregando logs do sistema...');
        this.showToast('Logs carregados!', 'info');
    }

    loadAlerts() {
        // Carregar alertas do sistema
        console.log('Carregando alertas do sistema...');
        this.showToast('Alertas verificados!', 'warning');
    }

    async loadInitialData() {
        try {
            // Carregar dados do sistema
            await Promise.all([
                this.loadSystemStats(),
                this.loadBotsStatus(),
                this.loadGETSStats(),
                this.todosDados()
            ]);

            this.initCharts();
        } catch (error) {
            console.error('Erro ao carregar dados iniciais:', error);
            this.showToast('Erro ao carregar dados', 'error');
        }
    }

    async controlBot(bot, action) {
        try {
            this.showLoading(`Executando ${action} no bot ${bot}...`);

            const response = await fetch(`${this.apiBase}/bots/${bot}/${action}`, {
                method: 'POST'
            });

            if (!response.ok) throw new Error(`Erro na resposta: ${response.status}`);

            const result = await response.json();

            this.showToast(`Bot ${bot} ${action} executado com sucesso`, 'success');

            // Recarregar status após ação
            await this.loadBotsStatus();

        } catch (error) {
            console.error(`Erro ao controlar bot ${bot}:`, error);
            this.showToast(`Erro ao executar ${action} no bot ${bot}`, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async getTelegramStats() {
        try {
            this.showLoading('Carregando estatísticas do Telegram...');

            const response = await fetch(`${this.apiBase}/telegram/stats`);
            if (!response.ok) throw new Error('Erro na resposta da API');

            const stats = await response.json();

            this.displayTelegramStats(stats);

        } catch (error) {
            console.error('Erro ao buscar estatísticas do Telegram:', error);
            this.showToast('Erro ao carregar estatísticas do Telegram', 'error');
        } finally {
            this.hideLoading();
        }
    }

    async getTelegramLogs() {
        try {
            this.showLoading('Carregando logs do Telegram...');

            const response = await fetch(`${this.apiBase}/telegram/logs`);
            if (!response.ok) throw new Error('Erro na resposta da API');

            const logs = await response.json();

            this.displayTelegramLogs(logs);

        } catch (error) {
            console.error('Erro ao buscar logs do Telegram:', error);
            this.showToast('Erro ao carregar logs do Telegram', 'error');
        } finally {
            this.hideLoading();
        }
    }

    async loadSystemStats() {
        try {
            const response = await fetch(`${this.apiBase}/system/stats`);
            if (!response.ok) throw new Error('Erro na API do sistema');

            const stats = await response.json();

            // Atualizar elementos da DOM
            document.getElementById('cpuUsage').textContent = `${stats.cpu}%`;
            document.getElementById('cpuBar').style.width = `${stats.cpu}%`;

            document.getElementById('ramUsage').textContent = `${stats.ram}%`;
            document.getElementById('ramBar').style.width = `${stats.ram}%`;

            document.getElementById('botsActive').textContent = stats.botsActive;

        } catch (error) {
            console.error('Erro ao carregar estatísticas do sistema:', error);
        }
    }

    async loadBotsStatus() {
        try {
            const response = await fetch(`${this.apiBase}/bots/status`);
            if (!response.ok) throw new Error('Erro na API dos bots');

            const status = await response.json();

            // Atualizar status GETS
            const getsStatus = document.getElementById('getsStatus');
            const getsDetails = document.getElementById('getsDetails');

            getsStatus.className = status.gets.online ?
                'px-3 py-1 rounded-full text-sm bg-green-500 bg-opacity-20 text-green-400' :
                'px-3 py-1 rounded-full text-sm bg-red-500 bg-opacity-20 text-red-400';

            getsStatus.innerHTML = `<i class="fas fa-circle mr-1"></i>${status.gets.online ? 'Online' : 'Offline'}`;

            document.getElementById('getsLastHeartbeat').textContent = status.gets.lastHeartbeat;
            document.getElementById('getsCacheSize').textContent = status.gets.cacheSize;

        } catch (error) {
            console.error('Erro ao carregar status dos bots:', error);
        }
    }

    async loadGETSStats() {
        try {
            const response = await fetch(`${this.apiBase}/gets/stats`);
            if (!response.ok) throw new Error('Erro na API GETS');

            const stats = await response.json();

            // Atualizar valores dos cards
            document.getElementById('totalOS').textContent = stats.totalOS;
            document.getElementById('osAtivas').textContent = stats.osAtivas;
            document.getElementById('osCriticas').textContent = stats.osCriticas;
            document.getElementById('tempoMedio').textContent = stats.tempoMedio;

            // Atualizar gráficos
            this.updateCharts(stats);

        } catch (error) {
            console.error('Erro ao carregar estatísticas GETS:', error);
        }
    }

    async todosDados() {
        try {
            const response = await fetch(`${this.apiBase}/todos-dados`);
            if (!response.ok) throw new Error('Erro na API de dados completos');

            const dados = await response.json();

            console.log('Dados carregados com sucesso:', dados);

        } catch (error) {
            console.error('Erro ao carregar dados completos:', error);
        }
    }

    initCharts() {
        // Gráfico de performance da VPS
        const ctxPerformance = document.getElementById('performanceChart').getContext('2d');
        this.charts.performance = new Chart(ctxPerformance, {
            type: 'line',
            data: {
                labels: ['10:00', '10:05', '10:10', '10:15', '10:20', '10:25'],
                datasets: [
                    {
                        label: 'CPU (%)',
                        data: [5, 8, 12, 7, 9, 8.5],
                        borderColor: 'rgb(59, 130, 246)',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        tension: 0.4
                    },
                    {
                        label: 'RAM (%)',
                        data: [25, 28, 35, 22, 31, 32],
                        borderColor: 'rgb(16, 185, 129)',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        }
                    },
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        labels: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        }
                    }
                }
            }
        });

        // Gráfico de estatísticas OS
        const ctxOS = document.getElementById('osChart').getContext('2d');
        this.charts.osStats = new Chart(ctxOS, {
            type: 'pie',
            data: {
                labels: ['OS Ativas', 'OS Encerradas', 'OS Críticas'],
                datasets: [{
                    data: [35, 12, 3],
                    backgroundColor: [
                        'rgba(16, 185, 129, 0.8)',  // Verde para ativas
                        'rgba(107, 114, 128, 0.8)', // Cinza para encerradas
                        'rgba(239, 68, 68, 0.8)'    // Vermelho para críticas
                    ],
                    borderColor: [
                        'rgb(16, 185, 129)',
                        'rgb(107, 114, 128)',
                        'rgb(239, 68, 68)'
                    ],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: 'rgba(255, 255, 255, 0.7)',
                            padding: 20,
                            usePointStyle: true
                        }
                    }
                }
            }
        });
    }

    updateCharts(stats) {
        if (this.charts.osStats) {
            // Atualizar gráfico circular de OS
            const ativas = stats.osAtivas;
            const encerradas = stats.totalOS - stats.osAtivas - stats.osCriticas;
            const criticas = stats.osCriticas;

            this.charts.osStats.data.datasets[0].data = [ativas, encerradas, criticas];
            this.charts.osStats.update();
        }

        // Simular atualização do gráfico de performance com novos dados
        if (this.charts.performance) {
            const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            // Adicionar novo valor e remover o antigo
            this.charts.performance.data.labels.shift();
            this.charts.performance.data.labels.push(now);

            // Adicionar novos valores simulados
            this.charts.performance.data.datasets[0].data.shift();
            this.charts.performance.data.datasets[0].data.push(Math.random() * 20 + 5);

            this.charts.performance.data.datasets[1].data.shift();
            this.charts.performance.data.datasets[1].data.push(Math.random() * 30 + 20);

            this.charts.performance.update();
        }
    }

    startAutoRefresh() {
        setInterval(() => {
            this.refreshAll();
        }, this.refreshInterval);
    }

    async refreshAll() {
        await Promise.all([
            this.loadSystemStats(),
            this.loadBotsStatus(),
            this.loadGETSStats()
        ]);
    }

    simulateLiveData() {
        // Simular dados vivos para demonstração
        setInterval(() => {
            // Simular variações pequenas nos recursos
            const cpuElement = document.getElementById('cpuUsage');
            const ramElement = document.getElementById('ramUsage');

            if (cpuElement && ramElement) {
                const cpuAtual = parseFloat(cpuElement.textContent);
                const ramAtual = parseFloat(ramElement.textContent);

                const cpuNovo = Math.max(2, Math.min(20, cpuAtual + (Math.random() - 0.5) * 2));
                const ramNovo = Math.max(20, Math.min(80, ramAtual + (Math.random() - 0.5) * 5));

                cpuElement.textContent = `${cpuNovo.toFixed(1)}%`;
                document.getElementById('cpuBar').style.width = `${cpuNovo.toFixed(1)}%`;

                ramElement.textContent = `${Math.round(ramNovo)}%`;
                document.getElementById('ramBar').style.width = `${Math.round(ramNovo)}%`;
            }
        }, 5000); // Atualiza a cada 5 segundos
    }

    displayTelegramStats(stats) {
        // Modal ou atualização da UI para mostrar estatísticas
        this.showToast(`Estatísticas do Telegram carregadas: ${stats.totalMensagens} mensagens, ${stats.comandosExecutados} comandos`, 'success');
    }

    displayTelegramLogs(logs) {
        // Modal ou atualização da UI para mostrar logs
        console.log('Logs do Telegram:', logs);
        this.showToast('Logs do Telegram carregados no console', 'info');
    }

    showLoading(message = 'Carregando...') {
        let loadingElement = document.getElementById('loading-overlay');
        if (!loadingElement) {
            loadingElement = document.createElement('div');
            loadingElement.id = 'loading-overlay';
            loadingElement.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
            loadingElement.innerHTML = `
                <div class="bg-gray-800 p-6 rounded-lg text-center">
                    <div class="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                    <p class="text-white" id="loading-text">${message}</p>
                </div>
            `;
            document.body.appendChild(loadingElement);
        }
        document.getElementById('loading-text').textContent = message;
        loadingElement.style.display = 'flex';
    }

    hideLoading() {
        const loadingElement = document.getElementById('loading-overlay');
        if (loadingElement) {
            loadingElement.style.display = 'none';
        }
    }

    showToast(message, type = 'info') {
        const toastElement = document.createElement('div');
        toastElement.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg text-white font-medium shadow-lg z-50 transition-all duration-300 transform translate-x-full`;

        // Definir cores baseado no tipo
        const colors = {
            success: 'bg-green-500',
            error: 'bg-red-500',
            warning: 'bg-yellow-500',
            info: 'bg-blue-500'
        };

        toastElement.className += ` ${colors[type] || colors.info}`;
        toastElement.textContent = message;

        document.body.appendChild(toastElement);

        // Animação de entrada
        setTimeout(() => {
            toastElement.classList.remove('translate-x-full');
        }, 100);

        // Auto-remover após 5 segundos
        setTimeout(() => {
            toastElement.classList.add('translate-x-full');
            setTimeout(() => {
                if (toastElement.parentNode) {
                    toastElement.parentNode.removeChild(toastElement);
                }
            }, 300);
            }, 5000);
    }

    executeTerminalCommand(command) {
        if (!command.trim()) return;

        const terminal = document.getElementById('terminalContent');
        if (!terminal) return;

        // Adicionar comando ao histórico
        this.terminal.history.push(command);

        // Simular resposta do comando
        const output = this.simulateCommand(command);

        // Atualizar terminal
        this.updateTerminalOutput(command, output);
    }

    simulateCommand(command) {
        const cmd = command.toLowerCase().trim();

        // Simulações de comandos básicos
        if (cmd === 'ls' || cmd === 'ls -la') {
            return `drwxr-xr-x  2 root root 4096 Nov 26 12:00 ./
drwxr-xr-x 23 root root 4096 Nov 25 08:00 ../
-rw-r--r--  1 root root  1024 Nov 26 11:50 controle-automatizado.js
-rw-r--r--  1 root root   512 Nov 26 11:45 painel-backend.js
-rw-r--r--  1 root root  2048 Nov 26 11:40 automacao_cache.json
-rw-r--r--  1 root root  1024 Nov 26 11:30 automacao_gets.log
-rw-------  1 root root    64 Nov 26 11:00 config.env`;
        }

        if (cmd === 'pwd') {
            return '/home/incontrol';
        }

        if (cmd === 'whoami') {
            return 'incontrol';
        }

        if (cmd === 'uptime') {
            return ' 12:00:15 up 5 days, 18:30, 1 user, load average: 0.08, 0.12, 0.13';
        }

        if (cmd === 'ps aux | grep node' || cmd.startsWith('ps aux')) {
            return `root      1234  2.1  8.2 1123456 876543 ?   Ssl  Nov25  18:30 node controle-automatizado.js
root      1245  0.5 12.3  934567 654123 ?   Sl   08:00   2:15 node painel-backend.js`;
        }

        if (cmd === 'htop' || cmd === 'top') {
            return `[Terminal interativo - Digite 'q' para sair]
Top 5 processos:
 1. [40%]  node controle-automatizado.js
 2. [12%]  node painel-backend.js
 3. [8.5%] sshd
 4. [3.2%] systemd`;
        }

        if (cmd === 'free -h') {
            return `              total        used        free      shared  buff/cache   available
Mem:           3.8G        1.2G        1.8G         84M        800M        2.4G
Swap:          2.0G         50M        1.9G`;
        }

        if (cmd === 'df -h') {
            return `Filesystem      Size  Used Avail Use% Mounted on
/dev/sda1        40G   15G   23G  40% /
tmpfs           1.9G     0  1.9G   0% /tmp
/dev/sda2       100G   25G   70G  26% /home`;
        }

        if (cmd === 'pm2 list' || cmd === 'pm2 ls') {
            return `┌─────┬────────────────────┬─────────────┬──────┬───────┬────────┬─────┬────────┬───────┐
│ id  │ name               │ namespace   │ version │ mode │ pid    │ uptime │ status    │ restart │
├─────┼────────────────────┼─────────────┼─────────┼──────┼────────┼───────┼────────────┼─────────┤
│ 0   │ gets-monitor       │ default     │ N/A     │ fork │ 1234   │ 5d     │ online     │ 0       │
│ 1   │ painel-admin       │ default     │ N/A     │ fork │ 1245   │ 1d     │ online     │ 1       │
└─────┴────────────────────┴─────────────┴─────────┴──────┴────────┴───────┴────────────┴─────────┘`;
        }

        if (cmd.startsWith('pm2 logs') || cmd === 'logs') {
            return `[PM2 Logs - últimos 10]
[TAILING] Tailing last 15 lines for [all] processes
gets-monitor-0  - Bot GETS iniciado com sucesso
gets-monitor-0  - Monitorando OS ativas...
painel-admin-1  - Servidor HTTP iniciado na porta 3001
gets-monitor-0  - Cache atualizado: 42 OS
gets-monitor-0  - Heartbeat válido`;
        }

        // Comando não reconhecido
        return `bash: ${command.split(' ')[0]}: command not found`;
    }

    updateTerminalOutput(command, output) {
        const terminal = document.getElementById('terminalContent');
        if (!terminal) return;

        const prompt = '<span class="text-green-400">root@ubuntu:~# </span>';
        let newContent = terminal.innerHTML;

        // Adicionar comando executado
        newContent += `<br>${prompt}${command}`;

        // Adicionar output linha por linha
        const lines = output.split('\n');
        lines.forEach(line => {
            if (line.trim()) {
                newContent += `<br>${line}`;
            }
        });

        // Novo prompt
        newContent += `<br>${prompt}`;

        terminal.innerHTML = newContent;

        // Scroll automático
        terminal.scrollTop = terminal.scrollHeight;
    }

    initFileManager() {
        // Simular carregamento de arquivos na aba Files
        this.mockFiles = [
            { name: 'controle-automatizado.js', type: 'file', size: '12.5KB', permissoes: '644', modified: '2025-11-26 11:47' },
            { name: 'painel-backend.js', type: 'file', size: '8.2KB', permissoes: '644', modified: '2025-11-26 11:45' },
            { name: 'automacao_cache.json', type: 'file', size: '43.6KB', permissoes: '644', modified: '2025-11-26 11:50' },
            { name: 'automacao_gets.log', type: 'file', size: '1.8MB', permissoes: '644', modified: '2025-11-26 11:55' },
            { name: 'node_modules', type: 'folder', size: '185MB', permissoes: '755', modified: '2025-11-25 08:00' },
            { name: 'logs', type: 'folder', size: '5.2MB', permissoes: '755', modified: '2025-11-26 10:30' }
        ];
    }

    startRealtimeUpdates() {
        // Simular alertas em tempo real
        setInterval(() => {
            // Chance pequena de gerar alerta
            if (Math.random() < 0.1) {
                this.addNewAlert();
            }
        }, 30000); // A cada 30 segundos, pequena chance de alerta
    }

    addNewAlert() {
        const alerts = [
            { type: 'critical', message: 'OS crítica ultrapassou 30 dias', details: 'Intervenção imediata necessária' },
            { type: 'warning', message: 'Uso de CPU alto detectado', details: 'CPU em 85%, monitorar processo' },
            { type: 'info', message: 'Backup automático concluído', details: 'Backup diário executado com sucesso' }
        ];

        const alert = alerts[Math.floor(Math.random() * alerts.length)];
        this.showToast(`🎯 ${alert.message}`, alert.type);

        // Atualizar badge do menu
        const badge = document.getElementById('alertBadge');
        if (badge) {
            const currentCount = parseInt(badge.textContent) || 0;
            badge.textContent = currentCount + 1;
            badge.classList.remove('hidden');
        }
    }
}

// Inicializar o painel quando DOM carregar
document.addEventListener('DOMContentLoaded', () => {
    window.painelAdmin = new PainelAdmin();
});

// Funções globais para debug e testes
window.painelControl = {
    refresh: () => window.painelAdmin.refreshAll(),
    startGets: () => window.painelAdmin.controlBot('gets', 'start'),
    stopGets: () => window.painelAdmin.controlBot('gets', 'stop'),
    restartGets: () => window.painelAdmin.controlBot('gets', 'restart'),
    getStatus: () => window.painelAdmin.controlBot('gets', 'status'),
    getStats: () => window.painelAdmin.getTelegramStats(),
    getLogs: () => window.painelAdmin.getTelegramLogs()
};
