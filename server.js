const express = require('express');
const mysql = require('mysql2/promise');
const session = require('cookie-session'); // Menggunakan cookie-session stateless (Anti-Crash Vercel)
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
    if (req.url.includes('%20') || req.url.includes(' ')) {
        const cleanUrl = req.url.replace(/%20/g, '').replace(/\s+/g, '');
        return res.redirect(cleanUrl);
    }
    next();
});

// Konfigurasi cookie-session pengganti express-session
app.use(session({
    name: 'session_invenio',
    keys: ['invenioweb_secret_key_super_secret'], // Kunci enkripsi data session di cookie browser
    maxAge: 24 * 60 * 60 * 1000 // Sesi aktif selama 24 jam (1 hari)
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

        await db.execute(`
            CREATE TABLE IF NOT EXISTS user (
                id_user INT AUTO_INCREMENT PRIMARY KEY, 
                username VARCHAR(50) NOT NULL UNIQUE, 
                password VARCHAR(255) NOT NULL, 
                nama VARCHAR(100) NOT NULL,
                role ENUM('admin', 'gudang', 'pimpinan', 'user') DEFAULT 'user',
                status_aktif TINYINT DEFAULT 1
            )
        `);
        
        await db.execute(`CREATE TABLE IF NOT EXISTS supplier (id_supplier VARCHAR(50) NOT NULL PRIMARY KEY, nama_supplier VARCHAR(100) NOT NULL, alamat TEXT, no_telp VARCHAR(20))`);
        await db.execute(`CREATE TABLE IF NOT EXISTS petugas (id_petugas VARCHAR(50) NOT NULL PRIMARY KEY, nama_petugas VARCHAR(100) NOT NULL, username VARCHAR(50) NOT NULL UNIQUE, password VARCHAR(255) NOT NULL, level ENUM('Admin','Petugas Gudang','Pimpinan') NOT NULL)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS barang (id_barang VARCHAR(50) NOT NULL PRIMARY KEY, nama_barang VARCHAR(100) NOT NULL, stok INT NOT NULL DEFAULT 0, harga DECIMAL(10,2) NOT NULL, id_supplier VARCHAR(50) DEFAULT NULL)`);
        
        await db.execute(`
            CREATE TABLE IF NOT EXISTS transaksi (
                id_transaksi INT AUTO_INCREMENT PRIMARY KEY, 
                id_barang VARCHAR(50) NOT NULL, 
                jenis_transaksi ENUM('masuk','keluar') NOT NULL, 
                jumlah INT NOT NULL, 
                tanggal DATE NOT NULL, 
                masuk VARCHAR(50) DEFAULT 'masuk', 
                keluar VARCHAR(50) DEFAULT 'keluar',
                id_user INT DEFAULT NULL
            )
        `);
        
        await db.execute(`CREATE TABLE IF NOT EXISTS transaksi_keluar (id_keluar VARCHAR(50) NOT NULL PRIMARY KEY, id_barang VARCHAR(50) NOT NULL, tgl_keluar DATE NOT NULL, jumlah_keluar INT NOT NULL, id_petugas VARCHAR(50) NOT NULL)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS transaksi_masuk (id_masuk VARCHAR(50) NOT NULL PRIMARY KEY, id_barang VARCHAR(50) NOT NULL, tgl_masuk DATE NOT NULL, jumlah_masuk INT NOT NULL, id_petugas VARCHAR(50) NOT NULL)`);

        await db.execute(`REPLACE INTO user (id_user, username, password, nama, role, status_aktif) VALUES 
            (1, 'admin', 'admin123', 'Naufal', 'admin', 1),
            (2, 'gudang', 'gudang1102', 'Chou (Gudang)', 'gudang', 1),
            (3, 'pimpinan', 'pimpinan82686', 'Siti (Pimpinan)', 'pimpinan', 1)
        `);

        console.log("🚀 Selesai! Semua tabel fresh dan bersih!");
    } catch (error) {
        console.log("Status: " + error.message);
    }
}
buatTabelOtomatis();

// --- TRIK DARURAT MODIFIKASI TABEL JIKA SUDAH ADA ---
setTimeout(async () => {
    try {
        await db.execute(`ALTER TABLE user MODIFY COLUMN role ENUM('admin', 'gudang', 'pimpinan', 'user') DEFAULT 'user'`);
        await db.execute(`ALTER TABLE user ADD COLUMN IF NOT EXISTS status_aktif TINYINT DEFAULT 1`);
        await db.execute(`ALTER TABLE transaksi ADD COLUMN IF NOT EXISTS id_user INT DEFAULT NULL`);
        await db.execute(`UPDATE user SET role = 'admin', status_aktif = 1 WHERE id_user = 1 OR username = 'admin'`);
        console.log("🚀 Kolom role & status_aktif aman/berhasil diverifikasi!");
    } catch (e) {
        console.log("Modifikasi kolom user aman.");
    }
}, 5000);

// --- PROTECT ROUTE MIDDLEWARE ---
const requireLogin = (req, res, next) => {
    if (req.session && req.session.user) next(); else res.redirect('/login');
};

const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.session || !req.session.user) return res.redirect('/login');
        if (!roles.includes(req.session.user.role)) {
            return res.send("<script>alert('Hak akses ditolak! Akun Anda tidak diizinkan membuka halaman ini.'); window.location='/dashboard';</script>");
        }
        next();
    };
};

// ==========================================
// 1. ROUTE AUTHENTICATION & SECURITY MULTI-ROLE
// ==========================================
app.get('/', (req, res) => res.redirect('/login'));
app.get('/login', (req, res) => res.render('login', { error: null }));

app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.render('login', { error: 'Username dan Password wajib diisi!' });
        }

        const [users] = await db.execute('SELECT * FROM user WHERE username = ? AND password = ?', [username, password]);
        
        if (users.length > 0) { 
            const akun = users[0];
            if (akun.status_aktif === 0) {
                return res.send("<script>alert('Akun Anda dinonaktifkan. Mohon hubungi pihak administrator.'); window.location='/login';</script>");
            }

            req.session.user = {
                id_user: akun.id_user,
                username: akun.username,
                nama: akun.nama || 'User Baru',
                role: akun.role || 'user'
            }; 
            
            if (akun.role === 'user') {
                return res.redirect('/beli-barang'); 
            } else {
                return res.redirect('/dashboard'); 
            }
        } else { 
            return res.render('login', { error: 'Username atau Password salah!' }); 
        }
    } catch (e) { 
        console.error("🚨 TERJADI ERROR PADA PROSES LOGIN:", e); 
        return res.status(500).send("Internal Server Error: " + e.message); 
    }
});

app.get('/logout', (req, res) => {
    req.session = null;
    res.redirect('/login');
});

app.get('/register', (req, res) => {
    res.render('register');
});

app.post('/register', async (req, res) => {
    try {
        const { username, nama, password } = req.body;
        const defaultRole = 'user';

        if (!username || !nama || !password) {
            return res.send("<script>alert('Semua formulir pendaftaran wajib diisi!'); window.location='/register';</script>");
        }

        try {
            await db.execute(`ALTER TABLE user MODIFY COLUMN role ENUM('admin', 'gudang', 'pimpinan', 'user') DEFAULT 'user'`);
            await db.execute(`ALTER TABLE user ADD COLUMN IF NOT EXISTS status_aktif TINYINT DEFAULT 1`);
        } catch (errCol) {}

        const [cek] = await db.execute('SELECT * FROM user WHERE username = ?', [username]);
        if (cek.length > 0) {
            return res.send("<script>alert('Username sudah terdaftar! Gunakan nama lain.'); window.location='/register';</script>");
        }

        await db.execute(
            'INSERT INTO user (username, nama, password, role, status_aktif) VALUES (?, ?, ?, ?, 1)',
            [username, nama, password, defaultRole]
        );
        
        res.send("<script>alert('Akun berhasil dibuat! Status akun AKTIF, kamu bisa langsung login.'); window.location='/login';</script>");
    } catch (e) {
        res.status(500).send("Error Register Akun: " + e.message);
    }
});

app.get('/admin/users', requireLogin, requireRole(['admin']), async (req, res) => {
    try {
        const [listUsers] = await db.execute('SELECT * FROM user WHERE id_user != ?', [req.session.user.id_user]);
        res.render('admin_users', { user: req.session.user, users: listUsers });
    } catch (e) {
        res.status(500).send("Error Admin Panel: " + e.message);
    }
});

app.get('/admin/users/aktifkan/:id', requireLogin, requireRole(['admin']), async (req, res) => {
    try {
        await db.execute('UPDATE user SET status_aktif = 1 WHERE id_user = ?', [req.params.id]);
        res.redirect('/admin/users');
    } catch (e) { res.status(500).send(e.message); }
});

app.get('/admin/users/nonaktifkan/:id', requireLogin, requireRole(['admin']), async (req, res) => {
    try {
        await db.execute('UPDATE user SET status_aktif = 0 WHERE id_user = ?', [req.params.id]);
        res.redirect('/admin/users');
    } catch (e) { res.status(500).send(e.message); }
});

app.get('/admin/users/hapus/:id', requireLogin, requireRole(['admin']), async (req, res) => {
    try {
        await db.execute('DELETE FROM user WHERE id_user = ?', [req.params.id]);
        res.redirect('/admin/users');
    } catch (e) { res.status(500).send("Error saat menghapus user: " + e.message); }
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
    } catch (e) { res.status(500).send("Error Dashboard: " + e.message); }
});

// ==========================================
// 3. ROUTE KELOLA BARANG
// ==========================================
app.get('/barang', requireLogin, requireRole(['admin', 'gudang', 'pimpinan']), async (req, res) => {
    try {
        const [barang] = await db.execute('SELECT b.*, s.nama_supplier FROM barang b LEFT JOIN supplier s ON b.id_supplier = s.id_supplier');
        const [supplier] = await db.execute('SELECT * FROM supplier');
        res.render('barang', { user: req.session.user, barang, supplier });
    } catch (e) { res.status(500).send("Error Menu Barang: " + e.message); }
});

app.post('/barang/tambah', requireLogin, requireRole(['admin', 'gudang', 'pimpinan']), async (req, res) => {
    try {
        let { nama_barang, id_supplier, stok, harga } = req.body;
        const id_barang = 'BRG-' + Date.now(); 
        const supplierValue = (id_supplier === 'null' || id_supplier === '') ? null : id_supplier;

        await db.execute(
            'INSERT INTO barang (id_barang, nama_barang, id_supplier, stok, harga) VALUES (?, ?, ?, ?, ?)', 
            [id_barang, nama_barang, supplierValue, stok, harga]
        );
        res.redirect('/barang');
    } catch (e) { res.status(500).send("Error Simpan Barang: " + e.message); }
});

app.get('/barang/hapus/:id', requireLogin, requireRole(['admin', 'gudang', 'pimpinan']), async (req, res) => {
    try {
        await db.execute('DELETE FROM transaksi WHERE id_barang = ?', [req.params.id]);
        await db.execute('DELETE FROM barang WHERE id_barang = ?', [req.params.id]);
        res.redirect('/barang');
    } catch (e) { res.status(500).send("Error Hapus Barang: " + e.message); }
});

app.post('/barang/edit/:id', requireLogin, requireRole(['admin', 'gudang', 'pimpinan']), async (req, res) => {
    try {
        const id_barang = req.params.id;
        let { nama_barang, id_supplier, stok, harga } = req.body;
        if (!id_supplier || id_supplier === '' || id_supplier === 'null' || id_supplier === 'undefined') id_supplier = null;

        const query = `UPDATE barang SET nama_barang = ?, id_supplier = ?, stok = ?, harga = ? WHERE id_barang = ?`;
        await db.execute(query, [nama_barang, id_supplier, stok, harga, id_barang]);
        res.redirect('/barang');
    } catch (e) { res.status(500).send("Error Update Data Barang Pusat: " + e.message); }
});

// ==========================================
// 4. ROUTE KELOLA SUPPLIER
// ==========================================
app.get('/supplier', requireLogin, requireRole(['admin', 'gudang', 'pimpinan']), async (req, res) => {
    try {
        const [supplier] = await db.execute('SELECT * FROM supplier');
        res.render('supplier', { user: req.session.user, supplier });
    } catch (e) { res.status(500).send("Error Menu Supplier: " + e.message); }
});

app.post('/supplier/tambah', requireLogin, requireRole(['admin', 'gudang', 'pimpinan']), async (req, res) => {
    try {
        const { nama_supplier, telepon, alamat } = req.body;
        const inputTelepon = telepon || req.body.kontak || req.body.no_telp;
        const id_supplier = 'SPL-' + Date.now(); 
        const paramNama = (nama_supplier && nama_supplier.trim() !== '') ? nama_supplier : null;
        const paramKontak = (inputTelepon && inputTelepon.trim() !== '') ? inputTelepon : null;
        const paramAlamat = (alamat && alamat.trim() !== '') ? alamat : null;

        await db.execute('INSERT INTO supplier (id_supplier, nama_supplier, no_telp, alamat) VALUES (?, ?, ?, ?)', [id_supplier, paramNama, paramKontak, paramAlamat]);
        res.redirect('/supplier');
    } catch (e) { res.status(500).send("Error Simpan Supplier: " + e.message); }
});

app.post('/supplier/edit/:id', requireLogin, requireRole(['admin', 'gudang', 'pimpinan']), async (req, res) => {
    try {
        const id_supplier = req.params.id;
        const { nama_supplier, telepon, alamat } = req.body;
        const inputTelepon = telepon || req.body.kontak || req.body.no_telp;

        await db.execute('UPDATE supplier SET nama_supplier = ?, no_telp = ?, alamat = ? WHERE id_supplier = ?', [nama_supplier, inputTelepon, alamat, id_supplier]);
        res.redirect('/supplier');
    } catch (e) { res.status(500).send("Error Edit Supplier: " + e.message); }
});

app.get('/supplier/hapus/:id', requireLogin, requireRole(['admin', 'gudang', 'pimpinan']), async (req, res) => {
    try {
        await db.execute('UPDATE barang SET id_supplier = NULL WHERE id_supplier = ?', [req.params.id]);
        await db.execute('DELETE FROM supplier WHERE id_supplier = ?', [req.params.id]);
        res.redirect('/supplier');
    } catch (e) { res.status(500).send("Error Hapus Supplier: " + e.message); }
});

// ==========================================
// 5. ROUTE TRANSAKSI
// ==========================================
app.get('/transaksi', requireLogin, requireRole(['admin', 'gudang', 'pimpinan']), async (req, res) => {
    try {
        const [barang] = await db.execute('SELECT * FROM barang');
        const [transaksi] = await db.execute('SELECT t.*, b.nama_barang FROM transaksi t JOIN barang b ON t.id_barang = b.id_barang ORDER BY t.tanggal DESC, t.id_transaksi DESC');
        res.render('transaksi', { user: req.session.user, barang, transaksi });
    } catch (e) { res.status(500).send("Error Menu Transaksi: " + e.message); }
});

app.post('/transaksi/masuk', requireLogin, requireRole(['admin', 'gudang', 'pimpinan']), async (req, res) => {
    try {
        const { id_barang, jumlah, tanggal } = req.body;
        await db.execute('INSERT INTO transaksi (id_barang, jenis_transaksi, jumlah, tanggal) VALUES (?, "masuk", ?, ?)', [id_barang, jumlah, tanggal]);
        await db.execute('UPDATE barang SET stok = stok + ? WHERE id_barang = ?', [jumlah, id_barang]);
        res.redirect('/transaksi');
    } catch (e) { res.status(500).send("Error Transaksi Masuk: " + e.message); }
});

app.post('/transaksi/keluar', requireLogin, requireRole(['admin', 'gudang', 'pimpinan']), async (req, res) => {
    try {
        const { id_barang, jumlah, tanggal } = req.body;
        await db.execute('INSERT INTO transaksi (id_barang, jenis_transaksi, jumlah, tanggal) VALUES (?, "keluar", ?, ?)', [id_barang, jumlah, tanggal]);
        await db.execute('UPDATE barang SET stok = stok - ? WHERE id_barang = ?', [jumlah, id_barang]);
        res.redirect('/transaksi');
    } catch (e) { res.status(500).send("Error Transaksi Keluar: " + e.message); }
});

app.get('/transaksi/hapus/:id', requireLogin, requireRole(['admin', 'gudang', 'pimpinan']), async (req, res) => {
    try {
        const [t] = await db.execute('SELECT * FROM transaksi WHERE id_transaksi = ?', [req.params.id]);
        if (t.length > 0) {
            const { id_barang, jenis_transaksi, jumlah } = t[0];
            const op = (jenis_transaksi === 'masuk') ? '-' : '+';
            await db.execute(`UPDATE barang SET stok = stok ${op} ? WHERE id_barang = ?`, [jumlah, id_barang]);
            await db.execute('DELETE FROM transaksi WHERE id_transaksi = ?', [req.params.id]);
        }
        res.redirect('/transaksi');
    } catch (e) { res.status(500).send("Error Hapus Transaksi: " + e.message); }
});

// ==========================================
// ✨ NEW FEATURE: ROUTE BARANG TERJUAL 
// ==========================================
app.get('/barang-terjual', requireLogin, requireRole(['admin', 'gudang', 'pimpinan']), async (req, res) => {
    try {
        const [terjual] = await db.execute(`
            SELECT t.*, b.nama_barang, b.harga, u.nama as nama_pembeli 
            FROM transaksi t 
            JOIN barang b ON t.id_barang = b.id_barang 
            JOIN user u ON t.id_user = u.id_user 
            WHERE t.jenis_transaksi = 'keluar' AND t.id_user IS NOT NULL
            ORDER BY t.tanggal DESC, t.id_transaksi DESC
        `);
        res.render('barang_terjual', { user: req.session.user, terjual });
    } catch (e) { res.status(500).send("Error Halaman Barang Terjual: " + e.message); }
});

// ==========================================
// 6. ROUTE LAPORAN
// ==========================================
app.get('/laporan', requireLogin, requireRole(['admin', 'gudang', 'pimpinan']), async (req, res) => {
    try {
        const [stokGudang] = await db.execute(`SELECT b.*, COALESCE(s.nama_supplier, 'Tanpa Supplier') as nama_supplier FROM barang b LEFT JOIN supplier s ON b.id_supplier = s.id_supplier`);
        const [allTransaksi] = await db.execute(`SELECT t.*, b.nama_barang, COALESCE(s.nama_supplier, 'Tanpa Supplier') as nama_supplier FROM transaksi t JOIN barang b ON t.id_barang = b.id_barang LEFT JOIN supplier s ON b.id_supplier = s.id_supplier ORDER BY t.tanggal DESC, t.id_transaksi DESC`);

        const laporanPerHari = {};
        allTransaksi.forEach(t => {
            if (t.tanggal) {
                const tglKey = new Date(t.tanggal).toISOString().split('T')[0];
                if (!laporanPerHari[tglKey]) laporanPerHari[tglKey] = { masuk: [], keluar: [] };
                if (t.jenis_transaksi === 'masuk') laporanPerHari[tglKey].masuk.push(t); else laporanPerHari[tglKey].keluar.push(t);
            }
        });
        res.render('laporan', { user: req.session.user, stokGudang, laporanPerHari });
    } catch (e) { res.status(500).send("Error Laporan: " + e.message); }
});

app.post('/laporan/barang/edit/:id', requireLogin, requireRole(['admin', 'gudang', 'pimpinan']), async (req, res) => {
    try {
        const { nama_barang, stok, harga } = req.body;
        await db.execute('UPDATE barang SET nama_barang = ?, stok = ?, harga = ? WHERE id_barang = ?', [nama_barang, stok, harga, req.params.id]);
        res.redirect('/laporan');
    } catch (e) { res.status(500).send(e.message); }
});

app.get('/laporan/barang/hapus/:id', requireLogin, requireRole(['admin', 'gudang', 'pimpinan']), async (req, res) => {
    try {
        await db.execute('DELETE FROM transaksi WHERE id_barang = ?', [req.params.id]);
        await db.execute('DELETE FROM barang WHERE id_barang = ?', [req.params.id]);
        res.redirect('/laporan');
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/laporan/edit/:id', requireLogin, requireRole(['admin', 'gudang', 'pimpinan']), async (req, res) => {
    try {
        const { jumlah_baru, tanggal_baru } = req.body;
        const [old] = await db.execute('SELECT * FROM transaksi WHERE id_transaksi = ?', [req.params.id]);
        if (old.length === 0) return res.redirect('/laporan');
        
        const { id_barang, jenis_transaksi, jumlah: jumlah_lama } = old[0];
        const selisih = parseInt(jumlah_baru) - parseInt(jumlah_lama);

        await db.execute('UPDATE transaksi SET jumlah = ?, tanggal = ? WHERE id_transaksi = ?', [jumlah_baru, tanggal_baru, req.params.id]);
        const op = (jenis_transaksi === 'masuk') ? '+' : '-';
        await db.execute(`UPDATE barang SET stok = stok ${op} ? WHERE id_barang = ?`, [selisih, id_barang]);
        res.redirect('/laporan');
    } catch (e) { res.status(500).send(e.message); }
});

app.get('/laporan/hapus/:id', requireLogin, requireRole(['admin', 'gudang', 'pimpinan']), async (req, res) => {
    try {
        const [t] = await db.execute('SELECT * FROM transaksi WHERE id_transaksi = ?', [req.params.id]);
        if (t.length > 0) {
            const { id_barang, jenis_transaksi, jumlah } = t[0];
            const op = (jenis_transaksi === 'masuk') ? '-' : '+';
            await db.execute(`UPDATE barang SET stok = stok ${op} ? WHERE id_barang = ?`, [jumlah, id_barang]);
            await db.execute('DELETE FROM transaksi WHERE id_transaksi = ?', [req.params.id]);
        }
        res.redirect('/laporan');
    } catch (e) { res.status(500).send(e.message); }
});

// ===================================================================
// 7. ROUTE KHUSUS USER BIASA (BELI BARANG ECERAN & SEKALIGUS)
// ===================================================================

// GET Halaman Utama Beli Barang (Dicocokkan dengan variabel 'barang')
app.get('/beli-barang', requireLogin, requireRole(['user']), async (req, res) => {
    try {
        const [barangTersedia] = await db.execute('SELECT * FROM barang WHERE stok > 0');
        res.render('user_beli', { 
            user: req.session.user, 
            barang: barangTersedia || [] 
        });
    } catch (e) {
        console.error("Crash di GET /beli-barang:", e);
        res.status(500).send("Error Halaman Beli Barang: " + e.message);
    }
});

// POST Beli Barang Eceran Bawaan Anda
app.post('/beli-barang/proses', requireLogin, requireRole(['user']), async (req, res) => {
    try {
        const { id_barang, jumlah_beli } = req.body;
        const jumlah = parseInt(jumlah_beli);
        const tanggalHariIni = new Date().toISOString().split('T')[0];

        const [cekBarang] = await db.execute('SELECT stok, nama_barang FROM barang WHERE id_barang = ?', [id_barang]);
        if (cekBarang.length === 0) return res.send("<script>alert('Barang tidak ditemukan!'); window.location='/beli-barang';</script>");

        const stokSekarang = cekBarang[0].stok;
        if (stokSekarang < jumlah) {
            return res.send(`<script>alert('Stok tidak mencukupi! Sisa stok ${cekBarang[0].nama_barang} adalah ${stokSekarang}'); window.location='/beli-barang';</script>`);
        }

        await db.execute('UPDATE barang SET stok = stok - ? WHERE id_barang = ?', [jumlah, id_barang]);
        await db.execute(
            'INSERT INTO transaksi (id_barang, jenis_transaksi, jumlah, tanggal, keluar, id_user) VALUES (?, "keluar", ?, ?, ?, ?)',
            [id_barang, jumlah, tanggalHariIni, `Dibeli oleh ${req.session.user.nama}`, req.session.user.id_user]
        );

        res.send("<script>alert('Pembelian berhasil! Stok otomatis terpotong.'); window.location='/beli-barang';</script>");
    } catch (e) {
        res.status(500).send("Error Process Pembelian: " + e.message);
    }
});

// 🔥 NEW: POST PROSES BELI MASSAL SEKALIGUS (Daftar Sempurna Tanpa Crash)
app.post('/beli-sekaligus', requireLogin, requireRole(['user']), async (req, res) => {
    try {
        if (!req.body.keranjangData) return res.status(400).send("Data keranjang kosong.");

        const keranjang = JSON.parse(req.body.keranjangData);
        const userId = req.session.user.id_user; // Menggunakan properti id_user bawaan server.js Anda
        const tanggalSekarang = new Date().toISOString().split('T')[0];

        if (!keranjang || keranjang.length === 0) {
            return res.send("<script>alert('Keranjang belanja kosong!'); window.location='/beli-barang';</script>");
        }

        // Loop verifikasi stok & pemotongan massal
        for (let item of keranjang) {
            const [rows] = await db.execute("SELECT stok FROM barang WHERE id_barang = ?", [item.id_barang]);
            const itemBarang = rows[0];
            
            if (!itemBarang || itemBarang.stok < item.jumlah) {
                return res.send(`<script>alert('Gagal! Stok untuk ${item.nama_barang} tidak mencukupi.'); window.location='/beli-barang';</script>`);
            }

            // Potong stok produk gudang
            await db.execute("UPDATE barang SET stok = stok - ? WHERE id_barang = ?", [item.jumlah, item.id_barang]);

            // Simpan log riwayat pembeli
            await db.execute(
                "INSERT INTO transaksi (id_barang, jenis_transaksi, jumlah, tanggal, keluar, id_user) VALUES (?, 'keluar', ?, ?, ?, ?)",
                [item.id_barang, item.jumlah, tanggalSekarang, `Dibeli Sekaligus oleh ${req.session.user.nama}`, userId]
            );
        }

        res.send("<script>alert('🎉 Pembelian sukses dikonfirmasi sekaligus!'); window.location='/beli-barang';</script>");
    } catch (error) {
        console.error("Error Beli Sekaligus Massal:", error);
        res.status(500).send("Terjadi masalah internal sistem saat checkout massal: " + error.message);
    }
});

// --- SERVER INSTANCE (WAJIB DI PALING BAWAH) ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running smoothly on port ${PORT}`));
