const express = require('express');
const router = express.Router();
const db = require('../config/db'); // Menyesuaikan dengan file koneksi db.js Anda

// =========================================================================
// [GET] ROUTE: MENAMPILKAN HALAMAN UTAMA BELI BARANG (USER VIEW)
// =========================================================================
router.get('/beli-barang', async (req, res) => {
    try {
        // Mengambil semua daftar komoditas barang yang stoknya masih ada
        const [rows] = await db.query('SELECT * FROM barang WHERE stok > 0 ORDER BY id_barang DESC');
        
        // Render halaman user_beli.ejs di dalam folder views
        res.render('user_beli', {
            barang: rows,
            user: req.session.user || null // Menyesuaikan session user login Anda
        });
    } catch (error) {
        console.error('Error saat memuat halaman beli barang:', error);
        res.status(500).send('Gagal memuat daftar barang.');
    }
});

// =========================================================================
// [POST] ROUTE: PROSES PEMBELIAN MASSAL / CHECKOUT (BELI SEKALIGUS)
// =========================================================================
router.post('/beli-sekaligus', async (req, res) => {
    const { keranjangData } = req.body;
    
    if (!keranjangData) {
        return res.status(400).send('Keranjang belanja kosong atau tidak valid.');
    }

    try {
        const items = JSON.parse(keranjangData);
        // Mengambil nama pembeli dari session aktif akun, default 'Pelanggan' jika session kosong
        const namaPembeli = req.session.user ? req.session.user.username : 'Pelanggan';

        // Lakukan looping transaksi menggunakan Promise.all atau for-loop agar sinkron ke database
        for (let item of items) {
            const jumlahBeli = parseInt(item.jumlah);
            const hargaSatuan = parseFloat(item.harga);
            const totalNominal = jumlahBeli * hargaSatuan;

            // 1. UPDATE: Mengurangi jumlah stok real-time di tabel barang utama
            await db.query(
                'UPDATE barang SET stok = stok - ? WHERE id_barang = ?',
                [jumlahBeli, item.id_barang]
            );

            // 2. INSERT: Memasukkan data ke tabel transaksi pembeli agar terbaca di halaman 'Barang Terjual'
            // Menggunakan struktur kolom: tanggal_transaksi, nama_pembeli, komoditas_barang, volume_beli, total_nominal
            await db.query(
                `INSERT INTO transaksi 
                (tanggal_transaksi, nama_pembeli, komoditas_barang, volume_beli, total_nominal) 
                VALUES (NOW(), ?, ?, ?, ?)`,
                [namaPembeli, item.nama_barang, jumlahBeli, totalNominal]
            );
        }

        // SELESAI: Setelah sukses, lempar navigasi langsung ke halaman barang-terjual
        res.redirect('/barang-terjual');

    } catch (error) {
        console.error('Error saat mengeksekusi pembelian sekaligus:', error);
        res.status(500).send('Sistem gagal memproses transaksi belanja massal Anda.');
    }
});

// =========================================================================
// [GET] ROUTE: MENAMPILKAN HALAMAN REALISASI BARANG TERJUAL & PENDAPATAN
// =========================================================================
router.get('/barang-terjual', async (req, res) => {
    try {
        // Ambil data transaksi yang baru saja dimasukkan secara real-time terurut dari yang terbaru
        const [rows] = await db.query(
            'SELECT tanggal_transaksi, nama_pembeli, komoditas_barang, volume_beli, total_nominal FROM transaksi ORDER BY tanggal_transaksi DESC'
        );

        // Menghitung akumulasi total pendapatan terbuku dari kolom total_nominal seluruh transaksi
        const totalPendapatan = rows.reduce((accumulator, currentItem) => {
            return accumulator + parseFloat(currentItem.total_nominal || 0);
        }, 0);

        // Render file views/barang_terjual.ejs dengan membawa data array transaksi dan total pendapatan
        res.render('barang_terjual', {
            transaksi: rows,
            totalPendapatan: totalPendapatan,
            user: req.session.user || null
        });

    } catch (error) {
        console.error('Error saat menarik data halaman barang terjual:', error);
        res.status(500).send('Gagal memuat rekap data realisasi barang terjual.');
    }
});

module.exports = router;
