const express = require('express');
const router = express.Router();
const db = require('../config/db'); // Pastikan path config/db.js Anda benar

// Middleware cek login
function requireLogin(req, res, next) {
    if (req.session && req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
}

// ===================================================================
// OPTION A & B: FITUR EDIT DATA BARANG (DIBUAT AMAN)
// ===================================================================
router.post('/barang/edit/:id', requireLogin, async (req, res) => {
    try {
        const id_barang = req.params.id;
        const { nama_barang, id_supplier, stok, harga } = req.body;
        const query = `UPDATE barang SET nama_barang = ?, id_supplier = ?, stok = ?, harga = ? WHERE id_barang = ?`;
        await db.query(query, [nama_barang, id_supplier, stok, harga, id_barang]);
        res.redirect('/barang');
    } catch (e) {
        console.error(e);
        res.status(500).send("Error Update Data Barang: " + e.message);
    }
});

router.post('/edit/:id', requireLogin, async (req, res) => {
    try {
        const id_barang = req.params.id;
        const { nama_barang, id_supplier, stok, harga } = req.body;
        const query = `UPDATE barang SET nama_barang = ?, id_supplier = ?, stok = ?, harga = ? WHERE id_barang = ?`;
        await db.query(query, [nama_barang, id_supplier, stok, harga, id_barang]);
        res.redirect('/barang');
    } catch (e) {
        console.error(e);
        res.status(500).send("Error Update Data Barang: " + e.message);
    }
}); 

// ===================================================================
// FIX DEFINITIF: ROUTE GET /beli-barang 
// ===================================================================
router.get('/beli-barang', requireLogin, async (req, res) => {
    try {
        // Menggunakan query dasar agar kompatibel dengan library mysql2/promise
        const [barangList] = await db.query("SELECT * FROM barang WHERE stok > 0");
        
        res.render('user_beli', { 
            barangList: barangList, 
            user: req.session.user || { nama: 'Pelanggan' }
        });
    } catch (e) {
        console.error("Crash di GET /beli-barang:", e);
        res.status(500).send("Internal Server Error di Backend: " + e.message);
    }
});

// ===================================================================
// FIX DEFINITIF: ROUTE POST /beli-sekaligus
// ===================================================================
router.post('/beli-sekaligus', requireLogin, async (req, res) => {
    try {
        if (!req.body.keranjangData) {
            return res.status(400).send("Data keranjang tidak terkirim");
        }

        const keranjang = JSON.parse(req.body.keranjangData);
        const userId = req.session.user ? req.session.user.id : null; 
        const tanggalSekarang = new Date().toISOString().split('T')[0];

        if (!keranjang || keranjang.length === 0) {
            return res.send("<script>alert('Keranjang kosong!'); window.location.reload();</script>");
        }

        for (let item of keranjang) {
            const [rows] = await db.query("SELECT stok FROM barang WHERE id_barang = ?", [item.id_barang]);
            const barang = rows[0];
            
            if (!barang || barang.stok < item.jumlah) {
                return res.send(`<script>alert('Gagal! Stok ${item.nama_barang} habis atau tidak cukup.'); window.location.reload();</script>`);
            }

            // Potong Stok
            await db.query("UPDATE barang SET stok = stok - ? WHERE id_barang = ?", [item.jumlah, item.id_barang]);

            // Catat Transaksi Keluar
            await db.query(
                "INSERT INTO transaksi (id_barang, id_user, jumlah, jenis_transaksi, tanggal) VALUES (?, ?, ?, 'keluar', ?)",
                [item.id_barang, userId, item.jumlah, tanggalSekarang]
            );
        }

        res.send("<script>alert('🎉 Pembelian sukses dikonfirmasi sekaligus!'); window.location.reload();</script>");

    } catch (error) {
        console.error("Crash di POST /beli-sekaligus:", error);
        res.status(500).send("Gagal memproses pembelian: " + error.message);
    }
});

// ===================================================================
// PENAMBAHAN BARU: ROUTE GET /barang-terjual (UNTUK HALAMAN ADMIN)
// ===================================================================
router.get('/barang-terjual', requireLogin, async (req, res) => {
    try {
        // Ambil data transaksi keluar dengan join ke tabel user dan barang
        // Alias kolom (AS) disesuaikan dengan variabel di file barang_terjual.ejs Anda
        const [rows] = await db.query(`
            SELECT 
                DATE_FORMAT(t.tanggal, '%d/%m/%Y') AS tanggal_format,
                t.tanggal AS tanggal,
                u.username AS nama_user,
                b.nama_barang AS nama_barang,
                t.jumlah AS jumlah_beli,
                b.harga AS harga_satuan
            FROM transaksi t
            JOIN user u ON t.id_user = u.id_user
            JOIN barang b ON t.id_barang = b.id_barang
            WHERE t.jenis_transaksi = 'keluar'
            ORDER BY t.tanggal DESC, t.id_transaksi DESC
        `);

        // Hitung total nominal pendapatan secara dinamis dari seluruh baris transaksi
        let totalPendapatan = 0;
        rows.forEach(trx => {
            totalPendapatan += (trx.jumlah_beli * trx.harga_satuan);
        });

        // Merender view barang_terjual.ejs dengan data asli dari database
        res.render('barang_terjual', {
            riwayatPenjualan: rows,
            totalPendapatan: totalPendapatan,
            user: req.session.user
        });

    } catch (e) {
        console.error("Gagal memuat halaman barang terjual:", e);
        res.status(500).send("Error Laporan Penjualan: " + e.message);
    }
});

module.exports = router;
