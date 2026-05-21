require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const net = require('net');
const { initDB } = require('./lib/db');
const authRoutes = require('./routes/auth');
const banksRoutes = require('./routes/banks');
const sessionsRoutes = require('./routes/sessions');
const shareRoutes = require('./routes/share');

const app = express();
let tunnelProcess = null;
let tunnelUrl = null;
let serverInstance = null;

function getCloudflarePath() {
  const candidates = [
    path.join(__dirname, 'bin', 'cloudflared.exe'),
    path.join(process.cwd(), 'bin', 'cloudflared.exe'),
    path.join(process.cwd(), 'cloudflared.exe'),
    'cloudflared.exe'
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

function startTunnel(port) {
  return new Promise((resolve) => {
    const cfPath = getCloudflarePath();
    if (!cfPath) {
      console.log('  ⚠ cloudflared.exe no encontrado — sin tunnel público');
      resolve(null);
      return;
    }

    tunnelProcess = spawn(cfPath, ['tunnel', '--url', 'http://localhost:' + port], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    const timeout = setTimeout(() => {
      console.log('  ⚠ Tunnel timeout — sin tunnel público');
      resolve(null);
    }, 15000);

    tunnelProcess.stdout.on('data', (data) => {
      const text = data.toString();
      const m = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (m) {
        clearTimeout(timeout);
        tunnelUrl = m[0];
        console.log(`  🌐 Tunnel público: ${tunnelUrl}`);
        resolve(tunnelUrl);
      }
    });

    tunnelProcess.stderr.on('data', (data) => {
      const text = data.toString();
      const m = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (m) {
        clearTimeout(timeout);
        tunnelUrl = m[0];
        console.log(`  🌐 Tunnel público: ${tunnelUrl}`);
        resolve(tunnelUrl);
      }
    });

    tunnelProcess.on('error', () => {
      clearTimeout(timeout);
      console.log('  ⚠ Error al iniciar cloudflared');
      resolve(null);
    });

    tunnelProcess.on('exit', () => {
      clearTimeout(timeout);
      tunnelProcess = null;
      tunnelUrl = null;
    });
  });
}

function stopTunnel() {
  if (tunnelProcess) {
    try {
      const pid = tunnelProcess.pid;
      tunnelProcess.kill();
      if (process.platform === 'win32') {
        try { spawn('taskkill', ['/pid', String(pid), '/f', '/t']); } catch(e) {}
      }
    } catch(e) {}
    tunnelProcess = null;
    tunnelUrl = null;
  }
}

function killPortProcess(port) {
  if (process.platform !== 'win32') return;
  try {
    const execSync = require('child_process').execSync;
    const output = execSync('netstat -ano | findstr :' + port, { encoding: 'utf8', timeout: 3000 });
    const lines = output.split('\n').filter(l => l.includes('LISTENING') || l.includes('ESTABLISHED'));
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0') {
        try { execSync('taskkill /pid ' + pid + ' /f', { encoding: 'utf8', timeout: 2000 }); } catch(e) {}
      }
    }
  } catch(e) {}
}

function tryPort(desired, startPort, attempt) {
  return new Promise((resolve) => {
    const currentAttempt = attempt || 0;
    const maxAttempts = 5;
    const currentPort = desired || 3001;

    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        if (currentAttempt >= maxAttempts) {
          console.log(`  ⚠ No se pudo encontrar puerto libre después de ${maxAttempts} intentos`);
          resolve(currentPort);
          return;
        }
        const nextPort = currentPort + 1;
        console.log(`  ⚠ Puerto ${currentPort} ocupado, probando ${nextPort}...`);
        server.close(() => resolve(tryPort(nextPort, startPort || currentPort, currentAttempt + 1)));
      } else {
        resolve(currentPort);
      }
    });
    server.once('listening', () => {
      server.close(() => resolve(currentPort));
    });
    server.listen(currentPort);
  });
}

function cleanup() {
  stopTunnel();
  if (serverInstance) {
    serverInstance.close(() => process.exit(0));
  } else {
    process.exit(0);
  }
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.use('/api/auth', authRoutes);
app.use('/api/banks', banksRoutes);
app.use('/api/sessions', sessionsRoutes);
app.use('/api/share', shareRoutes);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function start() {
  await initDB();

  const DESIRED_PORT = parseInt(process.env.PORT) || 3001;
  killPortProcess(DESIRED_PORT);
  const finalPort = await tryPort(DESIRED_PORT);

  serverInstance = app.listen(finalPort, async () => {
    const localIP = getLocalIP();
    console.log('');
    console.log(`  🏥 NursingQuiz Cloud corriendo`);
    console.log(`  📍 Local:      http://localhost:${finalPort}`);
    if (localIP !== '127.0.0.1') {
      console.log(`  📍 Red local:  http://${localIP}:${finalPort}`);
    }
    console.log('');

    const url = await startTunnel(finalPort);
    if (url) {
      console.log(`  📱 Desde tu celular (cualquier internet): ${url}`);
      console.log('');
    }
  });
}

start();
