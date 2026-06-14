// ==========================================
// ROUTE POST: UPDATE / EDIT DATA BARANG (FIXED JALUR DOBEL)
// ==========================================
// Hapus kata '/barang' di depan '/edit/:id' karena sudah dicover oleh router utama
router.post('/edit/:id', requireLogin, async (req, res) => {
    try {
        const id_barang = req.params.id; // Menangkap ID "BRG-1781415828670"
        const { nama_barang, id_supplier, stok, harga } = req.body; // Menangkap data dari form input

        // Eksekusi query update data ke database MySQL online kamu
        const query = `
            UPDATE barang 
            SET nama_barang = ?, id_supplier = ?, stok = ?, harga = ? 
            WHERE id_barang = ?
        `;
        
        await db.execute(query, [nama_barang, id_supplier, stok, harga, id_barang]);
        
        // Sukses, kembalikan user ke halaman kelola barang
        res.redirect('/barang');
    } catch (e) {
        console.error("Detail Error Edit Barang:", e);
        res.send("Error Update Data Barang: " + e.message);
    }
});
