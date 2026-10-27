const { app, BrowserWindow } = require("electron");
const path = require("path");

function createWindow() {

    const win = new BrowserWindow({

        width: 1200,
        height: 800,

        webPreferences: {

            preload: path.join(__dirname, "preload.js"),

            nodeIntegration: false,

            contextIsolation: true,

            sandbox: false        // ← ADD THIS LINE
        }
    });

    win.webContents.openDevTools();

    win.loadFile(path.join(__dirname, "index.html"))
        .then(() => console.log("LAB-OPS Loaded Successfully"))
        .catch((err) => console.error("Failed To Load:", err));
}

app.whenReady().then(() => {
    createWindow();
});