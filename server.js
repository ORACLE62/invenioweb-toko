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
app.use(session({ 
    secret: 'invenioweb_single_secret_key', 
    resave: false, 
    saveUninitialized: true 
}));

// --- DATABASE CONNECTION TO CLOUD AIVEN ---
// --- DATABASE CONNECTION TO CLOUD AIVEN (PAKAI URI) ---
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
        await db.execute(`CREATE TABLE IF NOT EXISTS supplier (id_supplier VARCHAR(50) NOT NULL PRIMARY KEY, nama_supplier VARCHAR(100) NOT NULL, alamat TEXT, no_telp VARCHAR(20))`);
        await db.execute(`CREATE TABLE IF NOT EXISTS petugas (id_petugas VARCHAR(50) NOT NULL PRIMARY KEY, nama_petugas VARCHAR(100) NOT NULL, username VARCHAR(50) NOT NULL UNIQUE, password VARCHAR(255) NOT NULL, level ENUM('Admin','Petugas Gudang','Pimpinan') NOT NULL)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS barang (id_barang VARCHAR(50) NOT NULL PRIMARY KEY, nama_barang VARCHAR(100) NOT NULL, stok INT NOT NULL DEFAULT 0, harga DECIMAL(10,2) NOT NULL, id_supplier VARCHAR(50) DEFAULT NULL)`);
        
        // 🚀 KUNCI UTAMA: Membuat tabel transaksi utuh dengan kolom masuk dan keluar langsung dari awal
        await db.execute(`CREATE TABLE IF NOT EXISTS transaksi (id_transaksi INT AUTO_INCREMENT PRIMARY KEY, id_barang VARCHAR(50) NOT NULL, jenis_transaksi ENUM('masuk','keluar') NOT NULL, jumlah INT NOT NULL, tanggal DATE NOT NULL, masuk VARCHAR(50) DEFAULT 'masuk', keluar VARCHAR(50) DEFAULT 'keluar')`);
        
        await db.execute(`CREATE TABLE IF NOT EXISTS transaksi_keluar (id_keluar VARCHAR(50) NOT NULL PRIMARY KEY, id_barang VARCHAR(50) NOT NULL, tgl_keluar DATE NOT NULL, jumlah_keluar INT NOT NULL, id_petugas VARCHAR(50) NOT NULL)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS transaksi_masuk (id_masuk VARCHAR(50) NOT NULL PRIMARY KEY, id_barang VARCHAR(50) NOT NULL, tgl_masuk DATE NOT NULL, jumlah_masuk INT NOT NULL, id_petugas VARCHAR(50) NOT NULL)`);

        // Isi Data Login Default
        await db.execute(`INSERT IGNORE INTO user (username, password, nama) VALUES ('admin', 'admin826', 'Naufal')`);
        await db.execute(`INSERT IGNORE INTO petugas VALUES ('USR001', 'Naufal (Admin)', 'admin', 'admin826', 'Admin'), ('USR002', 'Chou (Gudang)', 'gudang', 'gudang1102', 'Petugas Gudang'), ('USR003', 'Siti (Pimpinan)', 'pimpinan', 'pimpinan82686', 'Pimpinan')`);

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
// 3. ROUTE KELOLA BARANG (DENGAN FITUR HAPUS)
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

// ==========================================
// 4. ROUTE KELOLA SUPPLIER (DENGAN KOLOM ALAMAT AKTIF)
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
        // Ambil nama_supplier, telepon, dan alamat dari form HTML
        const { nama_supplier, telepon, alamat } = req.body;

        // Generate ID otomatis dari Detik Timestamp
        const id_supplier_otomatis = Math.floor(Date.now() / 1000); 

        const paramId      = id_supplier_otomatis;
        const paramNama    = nama_supplier !== undefined ? nama_supplier : null;
        const paramTelepon = telepon !== undefined ? telepon : null;
        const paramAlamat  = alamat !== undefined ? alamat : null;

        // Kita masukkan paramAlamat ke kolom alamat di database kamu
        const query = 'INSERT INTO supplier (id_supplier, nama_supplier, kontak, alamat) VALUES (?, ?, ?, ?)';
        await db.execute(query, [paramId, paramNama, paramTelepon, paramAlamat]);
        
        res.redirect('/supplier');
    } catch (e) {
        console.error("Detail Error:", e);
        res.send("Error Simpan Supplier: " + e.message);
    }
});

app.post('/supplier/edit/:id', requireLogin, async (req, res) => {
    try {
        const id_supplier = req.params.id;
        const { nama_supplier, telepon, alamat } = req.body;

        const paramId      = id_supplier !== undefined ? id_supplier : null;
        const paramNama    = nama_supplier !== undefined ? nama_supplier : null;
        const paramTelepon = telepon !== undefined ? telepon : null;
        const paramAlamat  = alamat !== undefined ? alamat : null;

        // Update juga kolom alamatnya di database
        const query = 'UPDATE supplier SET nama_supplier = ?, kontak = ?, alamat = ? WHERE id_supplier = ?';
        await db.execute(query, [paramNama, paramTelepon, paramAlamat, paramId]);

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
// ROUTE POST: TAMBAH TRANSAKSI MASUK
// ==========================================
app.post('/transaksi/masuk', requireLogin, async (req, res) => {
    try {
        const { id_barang, jumlah_masuk, tanggal_masuk } = req.body;
        
        // 1. Masukkan data ke tabel riwayat transaksi (sesuaikan nama kolom database kamu)
        const queryTransaksi = 'INSERT INTO transaksi (id_barang, tipe, jumlah, tanggal) VALUES (?, ?, ?, ?)';
        await db.execute(queryTransaksi, [id_barang, 'masuk', jumlah_masuk, tanggal_masuk]);
        
        // 2. Update tambah stok barang otomatis
        const queryBarang = 'UPDATE barang SET stok = stok + ? WHERE id_barang = ?';
        await db.execute(queryBarang, [jumlah_masuk, id_barang]);

        res.redirect('/transaksi');
    } catch (e) {
        res.send("Error Transaksi Masuk: " + e.message);
    }
});

// ==========================================
// ROUTE POST: TAMBAH TRANSAKSI KELUAR
// ==========================================
app.post('/transaksi/keluar', requireLogin, async (req, res) => {
    try {
        const { id_barang, jumlah_keluar, tanggal_keluar } = req.body;
        
        // 1. Masukkan data ke tabel riwayat transaksi
        const queryTransaksi = 'INSERT INTO transaksi (id_barang, tipe, jumlah, tanggal) VALUES (?, ?, ?, ?)';
        await db.execute(queryTransaksi, [id_barang, 'keluar', jumlah_keluar, tanggal_keluar]);
        
        // 2. Update kurangi stok barang otomatis
        const queryBarang = 'UPDATE barang SET stok = stok - ? WHERE id_barang = ?';
        await db.execute(queryBarang, [jumlah_keluar, id_barang]);

        res.redirect('/transaksi');
    } catch (e) {
        res.send("Error Transaksi Keluar: " + e.message);
    }
});

// ==========================================
// 6. ROUTE CETAK LAPORAN (DENGAN TANGGAL)
// ==========================================
app.get('/laporan', requireLogin, async (req, res) => {
    try {
        const [transaksi] = await db.execute('SELECT t.*, b.nama_barang FROM transaksi t JOIN barang b ON t.id_barang = b.id_barang ORDER BY t.tanggal DESC');
        const [barang] = await db.execute('SELECT * FROM barang');
        res.render('laporan', { user: req.session.user, transaksi, barang });
    } catch (error) { res.send("Error menu laporan: " + error.message); }
});

// --- SERVER INSTANCE ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running smoothly on port ${PORT}`));
