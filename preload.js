const { contextBridge } = require("electron");
const path = require("path");

const io = require(path.join(__dirname, "node_modules", "socket.io-client"));

// Create the socket connection here in preload, not in the renderer
const socket = io("http://localhost:5000");

contextBridge.exposeInMainWorld("labops", {

    app: {
        name: "LAB-OPS",
        version: "1.0.0"
    },

    // Expose only what the renderer needs from the socket
    on: (event, callback) => socket.on(event, callback),
    emit: (event, data) => socket.emit(event, data)
});