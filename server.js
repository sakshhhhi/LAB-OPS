const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const db = require("./database");

// =====================================
// GLOBAL STATE
// =====================================

const app = express();
const connectedClients = new Map(); // socketId -> pcName
const clientStatus = new Map();     // pcName -> { status, lastSeen }
const lastHealthState = new Map();  // pcName -> last health status

app.use(cors());

app.get("/", (req, res) => {
    res.send("LAB-OPS SERVER RUNNING");
});

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

// =====================================
// HEALTH ENGINE
// =====================================

function getSystemHealth(cpu, ramPercent) {

    cpu = parseFloat(cpu);
    ramPercent = parseFloat(ramPercent);

    if (cpu > 90 || ramPercent > 95) {
        return {
            status: "CRITICAL",
            message: "Critical System Usage"
        };
    }

    if (cpu > 70 || ramPercent > 80) {
        return {
            status: "WARNING",
            message: "High Resource Usage"
        };
    }

    return {
        status: "HEALTHY",
        message: "System Healthy"
    };
}

// =====================================
// SOCKET SERVER
// =====================================

io.on("connection", (socket) => {

    console.log("Socket Connected:", socket.id);

    // Send current state to newly connected socket
    socket.emit("clients-update", Array.from(connectedClients.values()));

    // =========================
    // CLIENT REGISTRATION
    // =========================

    socket.on("register-client", (pcName) => {

        console.log("Client Agent Registered:", pcName, socket.id);

        connectedClients.set(socket.id, pcName);

        io.emit("clients-update", Array.from(connectedClients.values()));
    });

    // =========================
    // SYSTEM DATA
    // =========================

    socket.on("system-data", (data) => {

        console.log("SYSTEM DATA RECEIVED:", data.pcName);

        const ramPercent = (
            (parseFloat(data.usedRAM) / parseFloat(data.totalRAM)) * 100
        ).toFixed(1);

        const health = getSystemHealth(data.cpuUsage, ramPercent);
        console.log("RAM %:", ramPercent);
        console.log("HEALTH:", health);
        console.log(
        "PREVIOUS:",
         lastHealthState.get(data.pcName)
        );

        // =========================
        // ONLINE STATUS
        // =========================

        clientStatus.set(data.pcName, {
            status: "ONLINE",
            lastSeen: Date.now()
        });

        // =========================
        // DEVICE REGISTRY
        // =========================

        db.run(
            `INSERT INTO devices (pc_name, first_seen, last_seen, status)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(pc_name)
             DO UPDATE SET last_seen = excluded.last_seen, status = excluded.status`,
            [data.pcName, data.time, data.time, "ONLINE"]
        );

        // =========================
        // MONITORING LOGS
        // =========================

        db.run(
            `INSERT INTO monitoring_logs (pc_name, cpu_usage, total_ram, used_ram, free_ram, timestamp)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [data.pcName, data.cpuUsage, data.totalRAM, data.usedRAM, data.freeRAM, data.time]
        );

        // =========================
        // ALERT ENGINE
        // =========================

        const previousHealth = lastHealthState.get(data.pcName);

        if (previousHealth !== health.status) {

            lastHealthState.set(data.pcName, health.status);

            console.log(`HEALTH CHANGE: ${data.pcName} -> ${health.status}`);

            if (health.status === "WARNING" || health.status === "CRITICAL") {

                db.run(
                    `INSERT INTO alerts (pc_name, severity, message, timestamp)
                     VALUES (?, ?, ?, ?)`,
                    [data.pcName, health.status, health.message, data.time]
                );

                io.emit("new-alert", {
                    pcName: data.pcName,
                    severity: health.status,
                    message: health.message
                });

                console.log("ALERT GENERATED:", data.pcName, health.status);
            }
        }

        // =========================
        // LIVE EVENTS
        // =========================

        io.emit("client-status-update", {
            pcName: data.pcName,
            status: "ONLINE"
        });

        io.emit("system-data-update", data);
    });

    // =========================
    // DISCONNECT
    // =========================

    socket.on("disconnect", () => {

        console.log("Socket Disconnected:", socket.id);

        if (connectedClients.has(socket.id)) {

            const pcName = connectedClients.get(socket.id);

            console.log("Client Agent Left:", pcName);

            connectedClients.delete(socket.id);

            // Immediately mark OFFLINE on disconnect
            if (clientStatus.has(pcName)) {
                clientStatus.get(pcName).status = "OFFLINE";
                clientStatus.get(pcName).lastSeen = 0;
            }

            db.run(
                `UPDATE devices SET status = ?, last_seen = ? WHERE pc_name = ?`,
                ["OFFLINE", new Date().toISOString(), pcName]
            );

            io.emit("clients-update", Array.from(connectedClients.values()));
            io.emit("client-status-update", { pcName, status: "OFFLINE" });
        }
    });
});

// =====================================
// OFFLINE DETECTION ENGINE
// =====================================

setInterval(() => {

    const now = Date.now();

    clientStatus.forEach((value, pcName) => {

        const difference = now - value.lastSeen;

        if (difference > 15000 && value.status !== "OFFLINE") {

            value.status = "OFFLINE";

            lastHealthState.set(pcName, "OFFLINE");

            db.run(
                `UPDATE devices SET status = ?, last_seen = ? WHERE pc_name = ?`,
                ["OFFLINE", new Date().toISOString(), pcName]
            );

            io.emit("client-status-update", {
                pcName,
                status: "OFFLINE"
            });

            console.log(pcName, "is OFFLINE");
        }
    });

}, 5000);

// =====================================
// START SERVER
// =====================================

server.listen(5000, () => {
    console.log("LAB-OPS Server Running On Port 5000");
});