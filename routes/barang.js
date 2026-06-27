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
        await db.execute(query, [nama_barang, id_supplier, stok, harga, id_barang]);
        res.redirect('/barang');
    } catch (e) {
        console.error("Error Edit Barang B:", e);
        res.send("Error Update Data Barang: " + e.message);
    }
}); 

// ===================================================================
// GABUNGKAN ENDPOINT BARU DI SINI (SEBELUM MODULE EXPORTS)
// ===================================================================

// Rute GET untuk menampilkan halaman beli barang
router.get('/beli-barang', requireLogin, async (req, res) => {
    try {
        const [barangList] = await db.execute("SELECT * FROM barang WHERE stok > 0");
        res.render('user_beli', { 
            barangList: barangList, 
            user: req.session.user 
        });
    } catch (e) {
        console.error("Error memuat halaman beli-barang:", e);
        res.status(500).send("Internal Server Error: " + e.message);
    }
});

// Rute POST untuk mengeksekusi aksi beli massal sekaligus
router.post('/beli-sekaligus', requireLogin, async (req, res) => {
    try {
        const keranjang = JSON.parse(req.body.keranjangData);
        const userId = req.session.user.id; 
        const tanggalSekarang = new Date().toISOString().split('T')[0];

        if (!keranjang || keranjang.length === 0) {
            return res.send("<script>alert('Keranjang belanja kosong!'); window.location='/barang/beli-barang';</script>");
        }

        for (let item of keranjang) {
            const [rows] = await db.execute("SELECT stok FROM barang WHERE id_barang = ?", [item.id_barang]);
            const barang = rows[0];
            
            if (!barang || barang.stok < item.jumlah) {
                return res.send(`<script>alert('Gagal! Stok untuk ${item.nama_barang} tidak mencukupi.'); window.location='/barang/beli-barang';</script>`);
            }

            // Potong stok master barang
            await db.execute("UPDATE barang SET stok = stok - ? WHERE id_barang = ?", [item.jumlah, item.id_barang]);

            // Catat ke riwayat mutasi keluar
            await db.execute(
                "INSERT INTO transaksi (id_barang, id_user, jumlah, jenis_transaksi, tanggal) VALUES (?, ?, ?, 'keluar', ?)",
                [item.id_barang, userId, item.jumlah, tanggalSekarang]
            );
        }

        res.send("<script>alert('🎉 Pembelian sukses dikonfirmasi sekaligus!'); window.location='/barang/beli-barang';</script>");

    } catch (error) {
        console.error("Error Beli Sekaligus:", error);
        res.status(500).send("Terjadi masalah internal sistem saat checkout: " + error.message);
    }
});

// ===================================================================
// PASTIKAN BARIS INI TETAP PALING BAWAH
// ===================================================================
module.exports = router;
