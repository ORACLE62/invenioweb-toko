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
        await db.execute(query, [nama_barang, id_supplier, stok, harga, id_barang]);
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
        await db.execute(query, [nama_barang, id_supplier, stok, harga, id_barang]);
        res.redirect('/barang');
    } catch (e) {
        console.error("Error Edit Barang B:", e);
        res.send("Error Update Data Barang: " + e.message);
    }
});
