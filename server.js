const express = require('express');
const mysql = require('mysql2/promise');
const session = require('express-session');
const path = require('path');
const app = express();

// --- CONFIGURATION MIDDLEWARE ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ============================================================
// 🚨 MIDDLEWARE PENYELAMAT TYPO SPASI (ANTI-ERROR CANNOT GET)
// ============================================================
app.use((req, res, next) => {
    // Jika ada spasi terselubung di URL akibat salah ketik di href EJS
    if (req.url.includes('%20') || req.url.includes(' ')) {
        const cleanUrl = req.url.replace(/%20/g, '').replace(/\s+/g, '');
        return res.redirect(cleanUrl);
    }
    next();
});

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

        // Buat semua tabel utama
        await db.execute(`CREATE TABLE IF NOT EXISTS user (id_user INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(50) NOT NULL UNIQUE, password VARCHAR(255) NOT NULL, nama VARCHAR(100) NOT NULL)`);
        
        // FIX: Kolom nomor telepon disamakan menjadi 'no_telp' agar konsisten
        await db.execute(`CREATE TABLE IF NOT EXISTS supplier (id_supplier VARCHAR(50) NOT NULL PRIMARY KEY, nama_supplier VARCHAR(100) NOT NULL, alamat TEXT, no_telp VARCHAR(20))`);
        
        await db.execute(`CREATE TABLE IF NOT EXISTS petugas (id_petugas VARCHAR(50) NOT NULL PRIMARY KEY, nama_petugas VARCHAR(100) NOT NULL, username VARCHAR(50) NOT NULL UNIQUE, password VARCHAR(255) NOT NULL, level ENUM('Admin','Petugas Gudang','Pimpinan') NOT NULL)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS barang (id_barang VARCHAR(50) NOT NULL PRIMARY KEY, nama_barang VARCHAR(100) NOT NULL, stok INT NOT NULL DEFAULT 0, harga DECIMAL(10,2) NOT NULL, id_supplier VARCHAR(50) DEFAULT NULL)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS transaksi (id_transaksi INT AUTO_INCREMENT PRIMARY KEY, id_barang VARCHAR(50) NOT NULL, jenis_transaksi ENUM('masuk','keluar') NOT NULL, jumlah INT NOT NULL, tanggal DATE NOT NULL, masuk VARCHAR(50) DEFAULT 'masuk', keluar VARCHAR(50) DEFAULT 'keluar')`);
        await db.execute(`CREATE TABLE IF NOT EXISTS transaksi_keluar (id_keluar VARCHAR(50) NOT NULL PRIMARY KEY, id_barang VARCHAR(50) NOT NULL, tgl_keluar DATE NOT NULL, jumlah_keluar INT NOT NULL, id_petugas VARCHAR(50) NOT NULL)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS transaksi_masuk (id_masuk VARCHAR(50) NOT NULL PRIMARY KEY, id_barang VARCHAR(50) NOT NULL, tgl_masuk DATE NOT NULL, jumlah_masuk INT NOT NULL, id_petugas VARCHAR(50) NOT NULL)`);

        // Isi Data Login Default (PAKSA REFRESH)
        await db.execute(`REPLACE INTO user (username, password, nama) VALUES 
            ('admin', 'admin123', 'Naufal'),
            ('gudang', 'gudang1102', 'Chou (Gudang)'),
            ('pimpinan', 'pimpinan82686', 'Siti (Pimpinan)')
            `);

        console.log("🚀 Selesai! Semua tabel fresh dan bersih!");
    } catch (error) {
        console.log("Status: " + error.message);
    }
}
buatTabelOtomatis();

// --- TRIK DARURAT TAMBAH KOLOM MASUK KELUAR ---
setTimeout(async () => {
    try {
        await db.execute(`ALTER TABLE transaksi ADD COLUMN IF NOT EXISTS masuk VARCHAR(50) DEFAULT 'masuk'`);
        await db.execute(`ALTER TABLE transaksi ADD COLUMN IF NOT EXISTS keluar VARCHAR(50) DEFAULT 'keluar'`);
        console.log("🚀 Kolom penyelamat berhasil ditambahkan ke Aiven!");
    } catch (e) {
        console.log("Kolom sudah ada atau aman.");
    }
}, 5000);    

// --- PROTECT ROUTE MIDDLEWARE ---
const requireLogin = (req, res, next) => {
    if (req.session.user) next(); else res.redirect('/login');
};

// ==========================================
// 1. ROUTE AUTHENTICATION
// ==========================================
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

// ==========================================
// 2. ROUTE DASHBOARD
// ==========================================
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

// ==========================================
// 3. ROUTE KELOLA BARANG
// ==========================================
app.get('/barang', requireLogin, async (req, res) => {
    try {
        const [barang] = await db.execute('SELECT b.*, s.nama_supplier FROM barang b LEFT JOIN supplier s ON b.id_supplier = s.id_supplier');
        const [supplier] = await db.execute('SELECT * FROM supplier');
        res.render('barang', { user: req.session.user, barang, supplier });
    } catch (e) { res.send("Error Menu Barang: " + e.message); }
});

app.post('/barang/tambah', requireLogin, async (req, res) => {
    try {
        let { nama_barang, id_supplier, stok, harga } = req.body;
        const id_barang = 'BRG-' + Date.now(); 
        const supplierValue = (id_supplier === 'null' || id_supplier === '') ? null : id_supplier;

        await db.execute(
            'INSERT INTO barang (id_barang, nama_barang, id_supplier, stok, harga) VALUES (?, ?, ?, ?, ?)', 
            [id_barang, nama_barang, supplierValue, stok, harga]
        );
        res.redirect('/barang');
    } catch (e) { res.send("Error Simpan Barang: " + e.message); }
});

app.get('/barang/hapus/:id', requireLogin, async (req, res) => {
    try {
        await db.execute('DELETE FROM transaksi WHERE id_barang = ?', [req.params.id]);
        await db.execute('DELETE FROM barang WHERE id_barang = ?', [req.params.id]);
        res.redirect('/barang');
    } catch (e) { res.send("Error Hapus Barang: " + e.message); }
});

app.post('/barang/edit/:id', requireLogin, async (req, res) => {
    try {
        const id_barang = req.params.id;
        let { nama_barang, id_supplier, stok, harga } = req.body;

        if (!id_supplier || id_supplier === '' || id_supplier === 'null' || id_supplier === 'undefined') {
            id_supplier = null;
        }

        const query = `
            UPDATE barang 
            SET nama_barang = ?, id_supplier = ?, stok = ?, harga = ? 
            WHERE id_barang = ?
        `;
        await db.execute(query, [nama_barang, id_supplier, stok, harga, id_barang]);
        res.redirect('/barang');
    } catch (e) {
        res.send("Error Update Data Barang Pusat: " + e.message);
    }
});

// ==========================================
// 4. ROUTE KELOLA SUPPLIER (SUDAH DI-FIX)
// ==========================================
app.get('/supplier', requireLogin, async (req, res) => {
    try {
        const [supplier] = await db.execute('SELECT * FROM supplier');
        res.render('supplier', { user: req.session.user, supplier });
    } catch (e) {
        res.send("Error Menu Supplier: " + e.message);
    }
});

app.post('/supplier/tambah', requireLogin, async (req, res) => {
    try {
        const { id_supplier, nama_supplier, telepon, alamat } = req.body;
        const paramTelepon = (telepon && telepon.trim() !== '') ? telepon : null;
        const paramAlamat = (alamat && alamat.trim() !== '') ? alamat : null;

        // FIX: Menggunakan kolom 'no_telp' sesuai struktur awal database Aiven
        const query = 'INSERT INTO supplier (id_supplier, nama_supplier, no_telp, alamat) VALUES (?, ?, ?, ?)';
        await db.execute(query, [id_supplier, nama_supplier, paramTelepon, paramAlamat]);
        res.redirect('/supplier');
    } catch (e) {
        res.send("Error Simpan Supplier: " + e.message);
    }
});

app.post('/supplier/edit/:id', requireLogin, async (req, res) => {
    try {
        const id_supplier = req.params.id;
        const { nama_supplier, telepon, alamat } = req.body;

        const paramNama    = nama_supplier !== undefined ? nama_supplier : null;
        const paramTelepon = telepon !== undefined ? telepon : null;
        const paramAlamat  = alamat !== undefined ? alamat : null;

        // FIX: Menggunakan kolom 'no_telp' dan menyertakan 'alamat' agar tidak terhapus saat diedit
        const query = 'UPDATE supplier SET nama_supplier = ?, no_telp = ?, alamat = ? WHERE id_supplier = ?';
        await db.execute(query, [paramNama, paramTelepon, paramAlamat, id_supplier]);

        res.redirect('/supplier');
    } catch (e) {
        res.send("Error Edit Supplier: " + e.message);
    }
});

app.get('/supplier/hapus/:id', requireLogin, async (req, res) => {
    try {
        await db.execute('UPDATE barang SET id_supplier = NULL WHERE id_supplier = ?', [req.params.id]);
        await db.execute('DELETE FROM supplier WHERE id_supplier = ?', [req.params.id]);
        res.redirect('/supplier');
    } catch (e) {
        res.send("Error Hapus Supplier: " + e.message);
    }
});

// ==========================================
// 5. ROUTE TRANSAKSI (MASUK, KELUAR, HAPUS)
// ==========================================
app.get('/transaksi', requireLogin, async (req, res) => {
    try {
        const [barang] = await db.execute('SELECT * FROM barang');
        const [transaksi] = await db.execute('SELECT t.*, b.nama_barang FROM transaksi t JOIN barang b ON t.id_barang = b.id_barang ORDER BY t.tanggal DESC, t.id_transaksi DESC');
        res.render('transaksi', { user: req.session.user, barang, transaksi });
    } catch (e) { res.send("Error Menu Transaksi: " + e.message); }
});

// ROUTE PENYELAMAT: Mengarahkan jika form di EJS mengarah ke /transaksi/tambah
app.post('/transaksi/tambah', requireLogin, async (req, res) => {
    try {
        const { id_barang, jumlah, jenis_transaksi, tanggal } = req.body;
        
        // Cek tipe transaksi dari form
        const tipe = jenis_transaksi || 'masuk'; 
        const op = (tipe === 'masuk') ? '+' : '-';

        await db.execute('INSERT INTO transaksi (id_barang, jenis_transaksi, jumlah, tanggal) VALUES (?, ?, ?, ?)', [id_barang, tipe, jumlah, tanggal]);
        await db.execute(`UPDATE barang SET stok = stok ${op} ? WHERE id_barang = ?`, [jumlah, id_barang]);
        
        res.redirect('/transaksi');
    } catch (e) { 
        res.send("Error Transaksi Tambah: " + e.message); 
    }
});

app.post('/transaksi/masuk', requireLogin, async (req, res) => {
    try {
        const { id_barang, jumlah, tanggal } = req.body;
        await db.execute('INSERT INTO transaksi (id_barang, jenis_transaksi, jumlah, tanggal) VALUES (?, "masuk", ?, ?)', [id_barang, jumlah, tanggal]);
        await db.execute('UPDATE barang SET stok = stok + ? WHERE id_barang = ?', [jumlah, id_barang]);
        res.redirect('/transaksi');
    } catch (e) { res.send("Error Transaksi Masuk: " + e.message); }
});

app.post('/transaksi/keluar', requireLogin, async (req, res) => {
    try {
        const { id_barang, jumlah, tanggal } = req.body;
        await db.execute('INSERT INTO transaksi (id_barang, jenis_transaksi, jumlah, tanggal) VALUES (?, "keluar", ?, ?)', [id_barang, jumlah, tanggal]);
        await db.execute('UPDATE barang SET stok = stok - ? WHERE id_barang = ?', [jumlah, id_barang]);
        res.redirect('/transaksi');
    } catch (e) { res.send("Error Transaksi Keluar: " + e.message); }
});

app.get('/transaksi/hapus/:id', requireLogin, async (req, res) => {
    try {
        const [t] = await db.execute('SELECT * FROM transaksi WHERE id_transaksi = ?', [req.params.id]);
        if (t.length > 0) {
            const { id_barang, jenis_transaksi, jumlah } = t[0];
            const op = (jenis_transaksi === 'masuk') ? '-' : '+';
            await db.execute(`UPDATE barang SET stok = stok ${op} ? WHERE id_barang = ?`, [jumlah, id_barang]);
            await db.execute('DELETE FROM transaksi WHERE id_transaksi = ?', [req.params.id]);
        }
        res.redirect('/transaksi');
    } catch (e) { res.send("Error Hapus Transaksi: " + e.message); }
});

// ==========================================
// 6. ROUTE CETAK LAPORAN
// ==========================================
app.get('/laporan', requireLogin, async (req, res) => {
    try {
        const [transaksi] = await db.execute('SELECT t.*, b.nama_barang FROM transaksi t JOIN barang b ON t.id_barang = b.id_barang ORDER BY t.tanggal DESC');
        const [barang] = await db.execute('SELECT * FROM barang');
        res.render('laporan', { user: req.session.user, transaksi, barang });
    } catch (error) { res.send("Error menu laporan: " + error.message); }
});

// --- SERVER INSTANCE (WAJIB DI PALING BAWAH) ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running smoothly on port ${PORT}`));
