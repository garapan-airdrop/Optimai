/**
 * Bot Node Lite Optimai
 * Bot ini memeriksa status online dari Optimai Lite Node
 * dan melakukan klaim harian/mingguan secara otomatis.
 */

const axios = require('axios');
const cron = require('node-cron');
const fs = require('fs');
require('dotenv').config();

// Konfigurasi proxy
let proxyList = [];
try {
    if (fs.existsSync('./proxy.txt')) {
        proxyList = fs.readFileSync('./proxy.txt', 'utf8').split('\n').filter(Boolean);
    }
} catch (error) {
    console.log('File proxy tidak ditemukan, melanjutkan tanpa proxy...');
}

// Konfigurasi akun
let accounts = [];
try {
    if (fs.existsSync('./accounts.json')) {
        accounts = JSON.parse(fs.readFileSync('./accounts.json', 'utf8'));
    } else {
        accounts = [{
            refreshToken: process.env.REFRESH_TOKEN || '',
            nodeToken: []
        }];
    }
} catch (error) {
    console.log('File akun tidak ditemukan, melanjutkan dengan .env...');
    accounts = [{
        refreshToken: process.env.REFRESH_TOKEN || '',
        nodeToken: []
    }];
}

// API dan Informasi Identitas
const API_URL = process.env.API_URL || 'https://api.optimai.network';

// Informasi saldo terakhir
const balances = new Map();

// Log transaksi
const logs = new Map();
const MAX_LOGS = 10;

function getProxy() {
    if (proxyList.length === 0) return null;
    return proxyList[Math.floor(Math.random() * proxyList.length)];
}

function createAxiosInstance(refreshToken, proxy = null) {
    const config = {
        baseURL: API_URL,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${refreshToken}`
        }
    };

    if (proxy) {
        config.proxy = {
            host: proxy.split('@')[1].split(':')[0],
            port: parseInt(proxy.split('@')[1].split(':')[1]),
            auth: {
                username: proxy.split('@')[0].split('//')[1].split(':')[0],
                password: proxy.split('@')[0].split(':')[1]
            }
        };
    }

    return axios.create(config);
}

// Fungsi untuk membersihkan layar
function clearScreen() {
    process.stdout.write('\x1Bc');
}

// Fungsi untuk menambahkan log
function addLog(accountIndex, message) {
    const timestamp = new Date().toISOString().substring(11, 19);
    if (!logs.has(accountIndex)) {
        logs.set(accountIndex, []);
    }
    const accountLogs = logs.get(accountIndex);
    accountLogs.unshift(`[${timestamp}] ${message}`);
    if (accountLogs.length > MAX_LOGS) {
        accountLogs.pop();
    }
    printInfo();
}

// Banner ASCII Art
const banner = `

░██████╗░░█████╗░██████╗░░█████╗░██████╗░░█████╗░███╗░░██╗  ░█████╗░██╗██████╗░██████╗░██████╗░░█████╗░██████╗░
██╔════╝░██╔══██╗██╔══██╗██╔══██╗██╔══██╗██╔══██╗████╗░██║  ██╔══██╗██║██╔══██╗██╔══██╗██╔══██╗██╔══██╗██╔══██╗
██║░░██╗░███████║██████╔╝███████║██████╔╝███████║██╔██╗██║  ███████║██║██████╔╝██║░░██║██████╔╝██║░░██║██████╔╝
██║░░╚██╗██╔══██║██╔══██╗██╔══██║██╔═══╝░██╔══██║██║╚████║  ██╔══██║██║██╔══██╗██║░░██║██╔══██╗██║░░██║██╔═══╝░
╚██████╔╝██║░░██║██║░░██║██║░░██║██║░░░░░██║░░██║██║░╚███║  ██║░░██║██║██║░░██║██████╔╝██║░░██║╚█████╔╝██║░░░░░
░╚═════╝░╚═╝░░╚═╝╚═╝░░╚═╝╚═╝░░╚═╝╚═╝░░░░░╚═╝░░╚═╝╚═╝░░╚══╝  ╚═╝░░╚═╝╚═╝╚═╝░░╚═╝╚═════╝░╚═╝░░╚═╝░╚════╝░╚═╝░░░░░
       JOIN CHANNEL - https://t.me/garapanairdrop_indonesia
`;

// Fungsi untuk mencetak informasi
function printInfo() {
    clearScreen();
    console.log(banner);
    
    accounts.forEach((account, index) => {
        console.log(`\nAkun ${index + 1}:`);
        console.log(`Saldo: ${balances.get(index) || 0}`);
        console.log('Transaksi Terakhir:');
        const accountLogs = logs.get(index) || [];
        accountLogs.forEach(log => console.log(log));
        console.log('===============================');
    });
}

// Fungsi untuk memperbarui token akses
async function refreshAccessToken(accountIndex) {
    const account = accounts[accountIndex];
    try {
        addLog(accountIndex, 'Memperbarui token...');
        
        const proxy = getProxy();
        const axiosInstance = createAxiosInstance(account.refreshToken, proxy);
        
        const response = await axiosInstance.post('/auth/refresh-token', {
            refreshToken: account.refreshToken
        });
        
        if (response.data && response.data.accessToken) {
            account.nodeToken = response.data.accessToken;
            if (response.data.refreshToken) {
                account.refreshToken = response.data.refreshToken;
                // Simpan informasi akun
                fs.writeFileSync('./accounts.json', JSON.stringify(accounts, null, 2));
            }
            addLog(accountIndex, 'Token berhasil diperbarui!');
            return true;
        }
        
        addLog(accountIndex, 'Gagal memperbarui token: Respon tidak dalam format yang diharapkan.');
        return false;
    } catch (error) {
        addLog(accountIndex, `Kesalahan memperbarui token: ${error.message}`);
        return false;
    }
}

// Fungsi untuk mengirim ping
async function pingNode(accountIndex) {
    const account = accounts[accountIndex];
    try {
        const proxy = getProxy();
        const axiosInstance = createAxiosInstance(account.nodeToken, proxy);
        
        addLog(accountIndex, 'Mengirim ping ke node...');
        
        const statusResponse = await axiosInstance.get('/node-avail/reward-schedule');
        addLog(accountIndex, `Ping berhasil! Hadiah berikutnya: ${new Date(statusResponse.data.next_execution).toLocaleTimeString()}`);
        
        const ipResponse = await axiosInstance.get('/ips?limit=20&order=asc');
        if (ipResponse.data.items && ipResponse.data.items.length > 0) {
            const ipInfo = ipResponse.data.items[0];
            addLog(accountIndex, `IP: ${ipInfo.ip_address}, Status: ${ipInfo.status}, Uptime: ${ipInfo.uptime}`);
        }
        
        await checkBalance(accountIndex);
        return true;
    } catch (error) {
        if (error.response && error.response.status === 401) {
            await refreshAccessToken(accountIndex);
            return await pingNode(accountIndex);
        }
        addLog(accountIndex, `Kesalahan ping: ${error.message}`);
        return false;
    }
}

// Fungsi untuk check-in harian
async function performDailyCheckin(accountIndex) {
    const account = accounts[accountIndex];
    try {
        const proxy = getProxy();
        const axiosInstance = createAxiosInstance(account.nodeToken, proxy);
        
        addLog(accountIndex, 'Melakukan check-in harian...');
        
        const response = await axiosInstance.post('/daily-tasks/check-in');
        
        if (response.data.already_checked_in) {
            addLog(accountIndex, 'Sudah melakukan check-in hari ini.');
        } else {
            addLog(accountIndex, 'Check-in harian berhasil!');
        }
        
        await checkBalance(accountIndex);
        return true;
    } catch (error) {
        if (error.response && error.response.status === 401) {
            await refreshAccessToken(accountIndex);
            return await performDailyCheckin(accountIndex);
        }
        if (error.response && error.response.status === 400) {
            addLog(accountIndex, 'Gagal melakukan check-in harian: Mungkin sudah dilakukan untuk hari ini.');
        } else {
            addLog(accountIndex, `Kesalahan check-in harian: ${error.message}`);
        }
        return false;
    }
}

// Fungsi untuk klaim hadiah mingguan
async function claimWeeklyReward(accountIndex) {
    const account = accounts[accountIndex];
    try {
        const proxy = getProxy();
        const axiosInstance = createAxiosInstance(account.nodeToken, proxy);
        
        addLog(accountIndex, 'Memeriksa hadiah mingguan...');
        
        const checkResponse = await axiosInstance.get('/daily-tasks/has-claimed-weekly-reward');
        
        if (checkResponse.data.has_claimed) {
            addLog(accountIndex, 'Hadiah untuk minggu ini sudah diambil.');
            return true;
        }
        
        addLog(accountIndex, 'Mengklaim hadiah mingguan...');
        await axiosInstance.post('/daily-tasks/claim-weekly-reward');
        
        addLog(accountIndex, 'Hadiah mingguan berhasil diambil!');
        await checkBalance(accountIndex);
        return true;
    } catch (error) {
        if (error.response && error.response.status === 401) {
            await refreshAccessToken(accountIndex);
            return await claimWeeklyReward(accountIndex);
        }
        if (error.response && error.response.status === 400) {
            addLog(accountIndex, 'Gagal mengklaim hadiah mingguan: Mungkin belum ada aktivitas yang cukup atau sudah diambil.');
        } else {
            addLog(accountIndex, `Kesalahan mengklaim hadiah mingguan: ${error.message}`);
        }
        return false;
    }
}

// Fungsi untuk memeriksa saldo
async function checkBalance(accountIndex) {
    const account = accounts[accountIndex];
    try {
        const proxy = getProxy();
        const axiosInstance = createAxiosInstance(account.nodeToken, proxy);
        
        const response = await axiosInstance.get('/users/balance');
        balances.set(accountIndex, response.data.balance);
        printInfo();
        return response.data.balance;
    } catch (error) {
        if (error.response && error.response.status === 401) {
            await refreshAccessToken(accountIndex);
            return await checkBalance(accountIndex);
        }
        addLog(accountIndex, `Kesalahan memeriksa saldo: ${error.message}`);
        return null;
    }
}

// Fungsi untuk menghasilkan waktu acak
function getRandomTime() {
    const hour = Math.floor(Math.random() * 24); // 0-23
    const minute = Math.floor(Math.random() * 60); // 0-59
    return { hour, minute };
}

// Fungsi untuk menghasilkan hari acak (0-6, 0=Hari Minggu)
function getRandomDay() {
    return Math.floor(Math.random() * 7);
}

// Memulai bot
(async () => {
    clearScreen();
    console.log(banner);
    console.log('MEMULAI BOT NODE LITE OPTIMAI...\n');
    
    if (accounts.length === 0) {
        console.error('ERROR: Informasi akun tidak ditemukan. Silakan periksa file accounts.json Anda.');
        process.exit(1);
    }
    
    // Proses awal untuk setiap akun
    for (let i = 0; i < accounts.length; i++) {
        addLog(i, 'Bot sedang dimulai...');
        await refreshAccessToken(i);
        await pingNode(i);
        await performDailyCheckin(i);
        await claimWeeklyReward(i);
    }
    
    // Tugas terjadwal
    const pingSchedule = process.env.PING_CRON || '*/5 * * * *';
    cron.schedule(pingSchedule, async () => {
        for (let i = 0; i < accounts.length; i++) {
            await pingNode(i);
        }
    });
    
    // Klaim harian pada waktu acak untuk setiap akun
    for (let i = 0; i < accounts.length; i++) {
        const dailyTime = getRandomTime();
        const dailySchedule = process.env.DAILY_CLAIM_CRON || `${dailyTime.minute} ${dailyTime.hour} * * *`;
        cron.schedule(dailySchedule, async () => {
            await performDailyCheckin(i);
        });
        addLog(i, `Waktu klaim harian diatur: ${dailyTime.hour}:${dailyTime.minute.toString().padStart(2, '0')}`);
    }
    
    // Klaim mingguan pada hari acak untuk setiap akun
    for (let i = 0; i < accounts.length; i++) {
        const weeklyTime = getRandomTime();
        const weeklyDay = getRandomDay();
        const weeklySchedule = process.env.WEEKLY_CLAIM_CRON || `${weeklyTime.minute} ${weeklyTime.hour} * * ${weeklyDay}`;
        cron.schedule(weeklySchedule, async () => {
            await claimWeeklyReward(i);
        });
        const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        addLog(i, `Waktu klaim mingguan diatur: ${days[weeklyDay]} ${weeklyTime.hour}:${weeklyTime.minute.toString().padStart(2, '0')}`);
    }
    
    // Memperbarui token setiap 12 jam
    cron.schedule('0 */12 * * *', async () => {
        for (let i = 0; i < accounts.length; i++) {
            await refreshAccessToken(i);
        }
    });
})();
