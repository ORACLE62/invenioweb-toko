const express = require('express');
const router = express.Router();
const db = require('../config/db'); // Pastikan path koneksi database Anda sudah benar

// =========================================================================
// 1. [GET] ROUTE: MENAMPILKAN HALAMAN UTAMA BELI BARANG (USER VIEW)
// =========================================================================
router.get('/beli-barang', async (req, res) => {
    try {
        // Hanya mengambil barang yang stoknya masih tersedia di pasar
        const [rows] = await db.query('SELECT * FROM barang WHERE stok > 0 ORDER BY id_barang DESC');
        
        res.render('user_beli', {
            barang: rows,
            user: req.session.user || null
        });
    } catch (error) {
        console.error('Error saat memuat halaman beli barang:', error);
        res.status(500).send('Sistem gagal memuat daftar produk.');
    }
});

// =========================================================================
// 2. [POST] ROUTE: PROSES PEMBELIAN MASSAL / CHECKOUT (BELI SEKALIGUS)
// =========================================================================
router.post('/beli-sekaligus', async (req, res) => {
    const { keranjangData } = req.body;
    
    if (!keranjangData) {
        return res.status(400).send('Keranjang belanja Anda kosong.');
    }

    try {
        const items = JSON.parse(keranjangData);
        // Mengambil nama pembeli aktif, gunakan 'oracle' atau 'Pelanggan' jika session kosong
        const namaPembeli = req.session.user ? req.session.user.username : 'oracle';

        for (let item of items) {
            const jumlahBeli = parseInt(item.jumlah);
            const hargaSatuan = parseFloat(item.harga);
            const totalNominal = jumlahBeli * hargaSatuan;

            if (jumlahBeli <= 0) continue; // Skip jika kuantitas 0

            // A. UPDATE: Kurangi stok produk utama di gudang data
            await db.query(
                'UPDATE barang SET stok = stok - ? WHERE id_barang = ?',
                [jumlahBeli, item.id_barang]
            );

            // B. INSERT INTERNAL: Masukkan data ke tabel 'transaksi' komersial
            // Ini agar datanya terbaca langsung di halaman /barang-terjual (Laporan Realisasi Penjualan)
            await db.query(
                `INSERT INTO transaksi 
                (tanggal_transaksi, nama_pembeli, komoditas_barang, volume_beli, total_nominal) 
                VALUES (NOW(), ?, ?, ?, ?)`,
                [namaPembeli, item.nama_barang, jumlahBeli, totalNominal]
            );
            
            // Catatan: KODE UNTUK INSERT KE TABEL BARANG_KELUAR / OUTBOUND 
            // SUDAH DIHAPUS DARI SINI AGAR TIDAK MASUK KE HALAMAN CETAK LAPORAN LAGI!
        }

        // Alihkan navigasi langsung ke halaman realisasi penjualan barang terjual
        res.redirect('/barang-terjual');

    } catch (error) {
        console.error('Error saat memproses transaksi checkout massal:', error);
        res.status(500).send('Sistem gagal memproses transaksi belanja.');
    }
});

// =========================================================================
// 3. [GET] ROUTE: MENAMPILKAN HALAMAN REALISASI BARANG TERJUAL & PENDAPATAN
// =========================================================================
router.get('/barang-terjual', async (req, res) => {
    try {
        // Ambil riwayat pembelian dari tabel transaksi komersial pelanggan
        const [rows] = await db.query(
            'SELECT tanggal_transaksi, nama_pembeli, komoditas_barang, volume_beli, total_nominal FROM transaksi ORDER BY tanggal_transaksi DESC'
        );

        // Akumulasi total pendapatan uang masuk dari konsumen secara real-time
        const totalPendapatan = rows.reduce((acc, current) => {
            return acc + parseFloat(current.total_nominal || 0);
        }, 0);

        // Render file views/barang_terjual.ejs dengan parameter bersih
        res.render('barang_terjual', {
            transaksi: rows,
            totalPendapatan: totalPendapatan,
            user: req.session.user || null
        });

    } catch (error) {
        console.error('Error saat memuat rekap barang terjual:', error);
        res.status(500).send('Gagal menarik rekap data realisasi penjualan.');
    }
});

module.exports = router;
