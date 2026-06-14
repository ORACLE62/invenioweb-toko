// ==========================================
// ROUTE POST: UPDATE / EDIT DATA BARANG
// ==========================================
router.post('/barang/edit/:id', requireLogin, async (req, res) => {
    try {
        const id_barang = req.params.id; // Menangkap ID "BRG-1781414680587"
        const { nama_barang, id_supplier, stok, harga } = req.body; // Menangkap data dari form input

        // Menjalankan query update data barang ke database
        const query = `
            UPDATE barang 
            SET nama_barang = ?, id_supplier = ?, stok = ?, harga = ? 
            WHERE id_barang = ?
        `;
        
        await db.execute(query, [nama_barang, id_supplier, stok, harga, id_barang]);
        
        // Setelah berhasil, kembalikan tampilan ke halaman kelola barang
        res.redirect('/barang');
    } catch (e) {
        console.error("Detail Error Edit Barang:", e);
        res.send("Error Update Data Barang: " + e.message);
    }
});
