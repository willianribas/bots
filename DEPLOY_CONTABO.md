# 🚀 DEPLOY COMPLETO - CONTABO VPS

**Guia definitivo para hospedar o InControl na sua VPS Contabo sem dor de cabeça**

## 🎯 **PRÉ-REQUISITOS**

### **O que você PRECISA ter:**
- ✅ **VPS Contabo** (recomendo VPS S - €5/mês)
- ✅ **Sistema Ubuntu 22.04** (padrão Contabo)
- ✅ **Acesso root via SSH/PuTTY**
- ✅ **Todos os arquivos do InControl**
- ✅ **Conta Supabase** (mesmo da automação GETS)

### **Arquivos necessários:**
- `controle-automatizado.js`
- `painel-backend.js`
- `painel-admin.html`
- `painel-admin.js`
- `login.html`
- `package.json`
- Todo o diretório `node_modules/` (gerado)

---

## 🔄 **PASSO A PASSO COMPLETO**

---

### **🔥 PASSO 1: CONECTAR NA VPS**

```bash
# Via SSH (Linux/Mac):
ssh root@SEU-IP-CONTABO

# Ou via PuTTY (Windows):
# Host Name: SEU-IP-CONTABO
# Port: 22
# Connection type: SSH
```

**Primeiro login como root.**

---

### **📦 PASSO 2: ATUALIZAR SISTEMA**

```bash
# Atualizar Ubuntu:
sudo apt update && sudo apt upgrade -y

# Instalar ferramentas básicas:
sudo apt install curl wget ufw htop nano git -y

# Verificar distribuição:
lsb_release -a
# Deve mostrar Ubuntu 22.04.x LTS
```

---

### **🟢 PASSO 3: INSTALAR NODE.JS**

```bash
# Instalar Node.js LTS (recomendado):
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# VERIFICAR instalação:
node --version  # Deve mostrar v20.x.x
npm --version   # Deve mostrar 10.x.x

# Instalar PM2 (gerenciador de processos):
sudo npm install -g pm2
pm2 --version  # Deve mostrar 5.x.x
```

---

### **💾 PASSO 4: SUBIR ARQUIVOS PARA VPS**

**Opção A: Via SCP (Linha de comando)**
```bash
# No seu computador Windows (PowerShell):
cd c:\Users\Usuario\Desktop\Projeto\automacao

# Compactar tudo:
tar -czf incontrol-deploy.tar.gz *

# Subir para VPS via SCP:
scp incontrol-deploy.tar.gz root@SEU-VPS-IP:/home/
# (digite senha do root quando solicitado)
```

**Opção B: Via WinSCP/FileZilla**
1. Conectar com usuário `root` na porta 22
2. Fazer upload de todos os arquivos para `/home/`

---

### **🛠️ PASSO 5: EXTRAIR E CONFIGURAR NA VPS**

```bash
# SSH na VPS:
ssh root@SEU-VPS-IP

# Navegar e extrair:
cd /home
tar -xzf incontrol-deploy.tar.gz
cd automacao  # ou o nome da pasta extraída

# Listar arquivos (verificar se tudo subiu):
ls -la
```

---

### **📚 PASSO 6: INSTALAR DEPENDÊNCIAS**

```bash
# Instalar todas as dependências Node.js:
npm install

# Instalar dependências extras para autenticação:
npm install jsonwebtoken bcryptjs @supabase/supabase-js

# Instalar browsers do Playwright:
npx playwright install --with-deps

# Verificar se tudo instalou:
ls -la node_modules
```

---

### **🔑 PASSO 7: CONFIGURAR CREDENCIAIS**

```bash
# Editar controle-automatizado.js:
nano controle-automatizado.js

# Localizar e alterar essas linhas:
const SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';
const SUPABASE_ANON_KEY = 'SUA-CHAVE-ANONIMA-AQUI';

const LOGIN_EMAIL = 'seu-email@unicamp.br';
const LOGIN_SENHA = 'SUA-SENHA-GETS-SEGURA';

# Telegram (opcional):
const TELEGRAM_TOKEN = 'TOKEN-DO-SEU-BOT';
const TELEGRAM_CHAT_ID = 'SEU-CHAT-ID';

# Salvar: Ctrl+X, depois Y, Enter
```

---

### **🧪 PASSO 8: TESTAR SISTEMA**

```bash
# Testar automação GETS:
node controle-automatizado.js

# Deve mostrar:
# 🔗 Conectado ao Supabase existente (automação GETS)
# ✅ Usuário admin já configurado
# 🔄 Iniciando monitoramento contínuo...

# Pressione Ctrl+C após alguns segundos

# Testar painel backend:
node painel-backend.js

# Deve mostrar:
# 🔒 InControl Pro - Backend Seguro iniciado!
# 🌐 Acesso: http://localhost:3001
# 🔑 Login: admin / admin123 (ALTERE EM PRODUÇÃO!)
```

---

### **🏗️ PASSO 9: PRODUÇÃO COM PM2**

```bash
# Iniciar serviços em produção:
pm2 start controle-automatizado.js --name="incontrol-automacao"
pm2 start painel-backend.js --name="incontrol-painel"

# Verificar se está funcionando:
pm2 status
# Deve mostrar:
# ┌─────┬────────────────────┬─────────────┬──────┬───────┬────────┬─────┬────────┬───────┐
# │ id  │ name               │ namespace   │ version │ mode │ pid    │ uptime │ status    │ restart │
# ├─────┼────────────────────┼─────────────┼─────────┼──────┼────────┼───────┼────────────┼─────────┤
# │ 0   │ incontrol-automacao│ default     │ N/A     │ fork │ 1234   │ 1m     │ online     │ 0       │
# │ 1   │ incontrol-painel   │ default     │ N/A     │ fork │ 5678   │ 1m     │ online     │ 0       │
```

---

### **🚀 PASSO 10: CONFIGURAR AUTO-RESTART**

```bash
# Configurar PM2 para iniciar na reboot:
pm2 startup
# Execute o comando que aparecer (normalmente copiar e colar)

# Salvar configuração atual:
pm2 save
```

---

### **🔥 PASSO 11: FIREWALL (SEGURANÇA)**

```bash
# Instalar e configurar UFW:
sudo apt install ufw -y

# Permitir SSH (porta 22):
sudo ufw allow ssh

# Permitir painel (porta 3001):
sudo ufw allow 3001/tcp

# Ativar firewall:
sudo ufw --force enable

# Verificar configuração:
sudo ufw status
# Deve mostrar:
# Status: active
# To                         Action      From
# --                         ------      ----
# 22                         ALLOW       Anywhere
# 3001                       ALLOW       Anywhere
```

---

### **🌐 PASSO 12: ACESSO WEB (APACHE OPCIONAL)**

```bash
# Para acessar na porta 80 (profissional):
sudo apt install apache2 -y

# Ativar módulos necessários:
sudo a2enmod proxy proxy_http

# Criar configuração do site:
sudo nano /etc/apache2/sites-available/incontrol.conf

# Adicionar conteúdo:
<VirtualHost *:80>
    ServerName SEU-VPS-IP-OU-DOMINIO

    ProxyPass / http://localhost:3001/
    ProxyPassReverse / http://localhost:3001/

    ErrorLog /var/log/apache2/incontrol_error.log
    CustomLog /var/log/apache2/incontrol_access.log combined
</VirtualHost>

# Salvar e sair (Ctrl+X, Y, Enter)

# Ativar site:
sudo a2ensite incontrol.conf
sudo systemctl reload apache2

# Testar: http://SEU-VPS-IP/
```

---

### **✅ PASSO 13: TESTE FINAL**

```bash
# Verificar tudo funcionando:
pm2 status
free -h
htop

# Testar acesso web:
# http://SEU-VPS-IP/         (se Apache)
# http://SEU-VPS-IP:3001/    (se Node direto)

# Login: admin / admin123
# ⚠️ ALTERAR SENHA IMEDIATAMENTE!
```

---

## 📊 **MONITORAMENTO DIÁRIO**

### **Status Rápido:**
```bash
# SSH na VPS:
pm2 status          # Serviços ativos
pm2 logs incontrol-automacao --lines 5  # Últimos logs
free -h             # Memória
df -h              # Disco
```

### **Reiniciar se necessário:**
```bash
pm2 restart incontrol-automacao
pm2 restart incontrol-painel
```

### **Acesso ao painel:**
```
🌐 http://SEU-VPS-IP/
👤 admin / admin123
```

---

## 🔧 **BACKUP E MANUTENÇÃO**

### **Backup Automático:**
```bash
# Criar script backup semanal:
sudo nano /usr/local/bin/backup-incontrol.sh

# Conteúdo:
#!/bin/bash
DATE=$(date +%Y%m%d)
BACKUP_DIR="/home/backups"
mkdir -p $BACKUP_DIR

cd /home
tar -czf $BACKUP_DIR/incontrol-$DATE.tar.gz automacao/

echo "Backup criado: $BACKUP_DIR/incontrol-$DATE.tar.gz"

# Tornar executável:
chmod +x /usr/local/bin/backup-incontrol.sh

# Agendar crontab semanal (domingo às 2h):
sudo crontab -e
# Adicionar: 0 2 * * 0 /usr/local/bin/backup-incontrol.sh
```

### **Atualizações:**
```bash
# Parar serviços:
pm2 stop all

# Backup atual:
cp -r automacao automacao.backup

# Subir novos arquivos via SCP...

# Reiniciar:
npm install  # se novas dependências
pm2 restart all
```

---

## 🚨 **TROUBLESHOOTING**

### **Painel não carrega:**
```bash
# Verificar se PM2 está rodando:
pm2 status

# Ver logs do painel:
pm2 logs incontrol-painel

# Restart painel:
pm2 restart incontrol-painel
```

### **Automação não funciona:**
```bash
# Ver logs da automação:
pm2 logs incontrol-automacao

# Restart automação:
pm2 restart incontrol-automacao

# Teste manual:
node controle-automatizado.js
```

### **Firewall bloqueando:**
```bash
sudo ufw status
sudo ufw allow 3001/tcp  # se necessário
```

### **Memória cheia:**
```bash
# Ver quem está consumindo:
htop

# Restart serviços:
pm2 restart all
```

---

## 🎉 **DEPLOY CONCLUÍDO!**

### **Seu InControl agora está:**

✅ **Produtivo 24/7** (PM2 + auto-restart) \
✅ **Protegido** (JWT + firewall) \
✅ **Acessível na internet** (porta 80/3001) \
✅ **Monitorando GETS automaticamente** \
✅ **Painel web funcional** com login \
✅ **Sistema robusto** (backup automático) \

### **Resumo de URLs:**
```
🔒 Painel Admin: http://SEU-VPS-IP/
👤 Login: admin / admin123
🤖 Telegram Bot: Já configurado se definiu token
📊 Supabase: Mesmo banco da automação
```

### **🎯 PRÓXIMOS PASSOS:**
1. **🔑 ALTERAR SENHA** do admin imediatamente
2. **🧪 Testar todas funcionalidades** do painel
3. **📱 Configurar notificações Telegram**
4. **📧 Verificar se OS estão sendo monitoradas**
5. **🔄 Agroar backups** e monitorar espaço em disco

---

**🚀 PARABÉNS! Seu sistema profissional está em produção na Contabo!** 🎊

Toda a documentação está atualizada e o sistema está **completamente operacional**!

Toda a documentação está atualizada e o sistema está **completamente operacional**!

*(Dúvidas? Verifique logs via: `pm2 logs`)*
