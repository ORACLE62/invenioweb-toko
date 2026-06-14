const express = require('express');
const mysql = require('mysql2/promise');
const session = require('express-session');
const path = require('path');
const app = express();

// --- CONFIGURATION MIDDLEWARE ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');

// Perbaikan Jalur Folder Views Spesifik Serverless Vercel
app.set('views', path.resolve(__dirname, 'views'));

app.use(session({ 
    secret: 'invenioweb_single_secret_key', 
    resave: false, 
    saveUninitialized: true 
}));

// --- DATABASE CONNECTION TO CLOUD AIVEN ---
const db = mysql.createPool({ 
    uri: 'mysql://avnadmin:AVNS_Qz7KYFav9bEb6eGGu9N@mysql-3cd9e1e3-naufalfadhilah553-f9de.e.aivencloud.com:11057/defaultdb?ssl-mode=REQUIRED', 
    ssl: {
        rejectUnauthorized: false
    }
});

// --- PEMBUATAN TABEL OTOMATIS KE CLOUD AIVEN ---
async function buatTabelOtomatis() {
    try {
        console.log("Sedang menghubungkan dan membuat tabel di Cloud Aiven...");
        await db.execute(`CREATE TABLE IF NOT EXISTS user (id_user INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(50) NOT NULL UNIQUE, password VARCHAR(255) NOT NULL, nama VARCHAR(100) NOT NULL)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS supplier (id_supplier VARCHAR(50) NOT NULL PRIMARY KEY, nama_supplier VARCHAR(100) NOT NULL, alamat TEXT, no_telp VARCHAR(20))`);
        await db.execute(`CREATE TABLE IF NOT EXISTS petugas (id_petugas VARCHAR(50) NOT NULL PRIMARY KEY, nama_petugas VARCHAR(100) NOT NULL, username VARCHAR(50) NOT NULL UNIQUE, password VARCHAR(255) NOT NULL, level ENUM('Admin','Petugas Gudang','Pimpinan') NOT NULL)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS barang (id_barang VARCHAR(50) NOT NULL PRIMARY KEY, nama_barang VARCHAR(100) NOT NULL, stok INT NOT NULL DEFAULT 0, harga DECIMAL(10,2) NOT NULL, id_supplier VARCHAR(50) DEFAULT NULL)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS transaksi (id_transaksi INT AUTO_INCREMENT PRIMARY KEY, id_barang VARCHAR(50) NOT NULL, jenis_transaksi ENUM('masuk','keluar') NOT NULL, jumlah INT NOT NULL, tanggal DATE NOT NULL, masuk VARCHAR(50) DEFAULT 'masuk', keluar VARCHAR(50) DEFAULT 'keluar')`);
        
        await db.execute(`INSERT IGNORE INTO user (username, password, nama) VALUES ('admin', 'admin826', 'Naufal')`);
        console.log("🚀 Selesai! Semua tabel fresh dan bersih!");
    } catch (error) {
        console.log("Status: " + error.message);
    }
}
buatTabelOtomatis();

const requireLogin = (req, res, next) => {
    if (req.session.user) next(); else res.redirect('/login');
};

// --- ROUTE UTAMA ---
app.get('/', (req, res) => res.redirect('/login'));
app.get('/login', (req, res) => res.render('login', { error: null }));
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const [users] = await db.execute('SELECT * FROM user WHERE username = ? AND password = ?', [username, password]);
        if (users.length > 0) { 
            req.session.user = users[0]; 
            res.redirect('/dashboard'); 
        } else { 
            res.render('login', { error: 'Username atau Password salah!' }); 
        }
    } catch (e) { res.send("Error Login: " + e.message); }
});
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.get('/dashboard', requireLogin, async (req, res) => {
    try {
        const [b] = await db.execute('SELECT COUNT(*) as t FROM barang');
        const [s] = await db.execute('SELECT COUNT(*) as t FROM supplier');
        const [m] = await db.execute('SELECT SUM(jumlah) as t FROM transaksi WHERE jenis_transaksi="masuk"');
        const [k] = await db.execute('SELECT SUM(jumlah) as t FROM transaksi WHERE jenis_transaksi="keluar"');
        res.render('dashboard', { 
            user: req.session.user, 
            totalBarang: b[0].t, 
            totalSupplier: s[0].t || 0, 
            totalMasuk: m[0].t || 0, 
            totalKeluar: k[0].t || 0 
        });
    } catch (e) { res.send("Error Dashboard: " + e.message); }
});

// --- KELOLA BARANG ---
app.get('/barang', requireLogin, async (req, res) => {
    try {
        const [barang] = await db.execute('SELECT b.*, s.nama_supplier FROM barang b LEFT JOIN supplier s ON b.id_supplier = s.id_supplier');
        const [supplier] = await db.execute('SELECT * FROM supplier');
        res.render('barang', { user: req.session.user, barang, supplier });
    } catch (e) { res.send("Error Menu Barang: " + e.message); }
});

// --- KELOLA SUPPLIER ---
app.get('/supplier', requireLogin, async (req, res) => {
    try {
        const [supplier] = await db.execute('SELECT * FROM supplier');
        res.render('supplier', { user: req.session.user, supplier });
    } catch (e) { res.send("Error Menu Supplier: " + e.message); }
});

app.post('/supplier/tambah', requireLogin, async (req, res) => {
    try {
        const { id_supplier, nama_supplier, telepon, alamat } = req.body;
        await db.execute('INSERT INTO supplier (id_supplier, nama_supplier, no_telp, alamat) VALUES (?, ?, ?, ?)', [id_supplier, nama_supplier, telepon || null, alamat || null]);
        res.redirect('/supplier');
    } catch (e) { res.send("Error Simpan Supplier: " + e.message); }
});

// --- TRANSAKSI ---
app.get('/transaksi', requireLogin, async (req, res) => {
    try {
        const [barang] = await db.execute('SELECT * FROM barang');
        const [transaksi] = await db.execute('SELECT t.*, b.nama_barang FROM transaksi t JOIN barang b ON t.id_barang = b.id_barang ORDER BY t.tanggal DESC, t.id_transaksi DESC');
        res.render('transaksi', { user: req.session.user, barang, transaksi });
    } catch (e) { res.send("Error Menu Transaksi: " + e.message); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running smoothly on port ${PORT}`));
