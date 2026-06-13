const mysql = require('mysql2');

// Konfigurasi langsung dimasukkan ke sini agar terjamin bebas error pembacaan file
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '', // Kosongkan jika menggunakan XAMPP bawaan default
    database: 'invenioweb_db', // Pastikan nama database di phpMyAdmin sama persis
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool.promise();