const express = require('express');
const router = express.Router();
const db = require('../config/db'); // Sesuaikan dengan path file database Anda

// Middleware simulasi login (pastikan ini sesuai dengan project Anda)
function requireLogin(req, res, next) {
    if (req.session && req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
}

// ===================================================================
// OPTION A: JIKA BACKEND MEMBACA URL: /barang/edit/BRG-XXXXXX
// ===================================================================
router.post('/barang/edit/:id', requireLogin, async (req, res) => {
    try {
        const id_barang = req.params.id;
        const { nama_barang, id_supplier, stok, harga } = req.body;

        const query = `
            UPDATE barang 
            SET nama_barang = ?, id_supplier = ?, stok = ?, harga = ? 
            WHERE id_barang = ?
        `;
        await db.query(query, [nama_barang, id_supplier, stok, harga, id_barang]);
        res.redirect('/barang');
    } catch (e) {
        console.error("Error Edit Barang A:", e);
        res.send("Error Update Data Barang: " + e.message);
    }
});

// ===================================================================
// OPTION B: JIKA BACKEND MEMBACA URL LANGSUNG: /edit/BRG-XXXXXX
// ===================================================================
router.post('/edit/:id', requireLogin, async (req, res) => {
    try {
        const id_barang = req.params.id;
        const { nama_barang, id_supplier, stok, harga } = req.body;

        const query = `
            UPDATE barang 
            SET nama_barang = ?, id_supplier = ?, stok = ?, harga = ? 
            WHERE id_barang = ?
        `;
        await db.query(query, [nama_barang, id_supplier, stok, harga, id_barang]);
        res.redirect('/barang');
    } catch (e) {
        console.error("Error Edit Barang B:", e);
        res.send("Error Update Data Barang: " + e.message);
    }
}); 

// ===================================================================
// FIXED ROUTE: MENAMPILKAN HALAMAN BELI BARANG
// (Mendukung URL /beli-barang dan /barang/beli-barang)
// ===================================================================
const tampilkanHalamanBeli = async (req, res) => {
    try {
        const [barangList] = await db.query("SELECT * FROM barang WHERE stok > 0");
        res.render('user_beli', { 
            barangList: barangList, 
            user: req.session.user 
        });
    } catch (e) {
        console.error("Error memuat halaman beli-barang:", e);
        res.status(500).send("Internal Server Error: " + e.message);
    }
};

router.get('/beli-barang', requireLogin, tampilkanHalamanBeli);
router.get('/barang/beli-barang', requireLogin, tampilkanHalamanBeli);

// ===================================================================
// FIXED ROUTE: PROSES BELI MASSAL SEKALIGUS
// (Mendukung POST /beli-sekaligus dan /barang/beli-sekaligus)
// ===================================================================
const prosesBeliSekaligus = async (req, res) => {
    try {
        const keranjang = JSON.parse(req.body.keranjangData);
        const userId = req.session.user.id; 
        const tanggalSekarang = new Date().toISOString().split('T')[0];

        // Deteksi dinamis arah kembali URL asal pembuka halaman
        const urlAsal = req.originalUrl.includes('/barang/') ? '/barang/beli-barang' : '/beli-barang';

        if (!keranjang || keranjang.length === 0) {
            return res.send(`<script>alert('Keranjang belanja kosong!'); window.location='${urlAsal}';</script>`);
        }

        for (let item of keranjang) {
            const [rows] = await db.query("SELECT stok FROM barang WHERE id_barang = ?", [item.id_barang]);
            const barang = rows[0];
            
            if (!barang || barang.stok < item.jumlah) {
                return res.send(`<script>alert('Gagal! Stok untuk ${item.nama_barang} tidak mencukupi.'); window.location='${urlAsal}';</script>`);
            }

            // Potong stok master barang gudang
            await db.query("UPDATE barang SET stok = stok - ? WHERE id_barang = ?", [item.jumlah, item.id_barang]);

            // Catat ke log riwayat transaksi sirkulasi keluar
            await db.query(
                "INSERT INTO transaksi (id_barang, id_user, jumlah, jenis_transaksi, tanggal) VALUES (?, ?, ?, 'keluar', ?)",
                [item.id_barang, userId, item.jumlah, tanggalSekarang]
            );
        }

        res.send(`<script>alert('🎉 Pembelian sukses dikonfirmasi sekaligus!'); window.location='${urlAsal}';</script>`);

    } catch (error) {
        console.error("Error Beli Sekaligus:", error);
        res.status(500).send("Terjadi masalah internal sistem saat checkout: " + error.message);
    }
};

router.post('/beli-sekaligus', requireLogin, prosesBeliSekaligus);
router.post('/barang/beli-sekaligus', requireLogin, prosesBeliSekaligus);

module.exports = router;
