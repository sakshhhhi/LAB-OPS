const sqlite3 = require("sqlite3").verbose();

const fs = require("fs");

const path = require("path");

const dbFolder = path.join(__dirname, "database");

if (!fs.existsSync(dbFolder)) {

    fs.mkdirSync(dbFolder);

    console.log("Database folder created");
}

const dbPath = path.join(dbFolder, "labops.db");

const db = new sqlite3.Database(dbPath, (err) => {

    if (err) {

        console.error("Database Connection Error:", err.message);

    } else {

        console.log("Connected To LAB-OPS Database");
    }
});

db.serialize(() => {

    db.run(`

        CREATE TABLE IF NOT EXISTS devices (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            pc_name TEXT UNIQUE,

            first_seen TEXT,

            last_seen TEXT,

            status TEXT DEFAULT 'OFFLINE'
        )
    `);

    db.run(`

        CREATE TABLE IF NOT EXISTS monitoring_logs (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            pc_name TEXT,

            cpu_usage REAL,

            total_ram REAL,

            used_ram REAL,

            free_ram REAL,

            timestamp TEXT
        )
    `);
    db.run(`

    CREATE TABLE IF NOT EXISTS alerts (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        pc_name TEXT,

        severity TEXT,

        message TEXT,

        timestamp TEXT
    )
`);
});

module.exports = db;