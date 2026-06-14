// ==========================================
// ROUTE POST: UPDATE / EDIT DATA BARANG
// ==========================================
app.post('/barang/edit/:id', requireLogin, async (req, res) => {
    try {
        const id_barang = req.params.id; // Menangkap ID "BRG-1781412566786" dari URL
        const { nama_barang, id_supplier, stok, harga } = req.body; // Menangkap data dari form input

        // Jalankan query update data barang ke database
        // Catatan: Pastikan nama kolom database kamu sesuai (misal: nama_barang, id_supplier, stok, harga)
        const query = `
            UPDATE barang 
            SET nama_barang = ?, id_supplier = ?, stok = ?, harga = ? 
            WHERE id_barang = ?
        `;
        
        await db.execute(query, [nama_barang, id_supplier, stok, harga, id_barang]);
        
        // Setelah sukses update, kembalikan user ke halaman kelola barang
        res.redirect('/barang');
    } catch (e) {
        console.error("Detail Error Edit Barang:", e);
        res.send("Error Update Data Barang: " + e.message);
    }
});
