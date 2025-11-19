import sqlite3
import json
import time
import random
from datetime import datetime
from pathlib import Path
from flask import Flask, jsonify, request, render_template, Response
from flask_socketio import SocketIO, emit

DB_PATH = "starlaunch.db"

app = Flask(__name__)
app.config["SECRET_KEY"] = "clave-secreta-starlaunch"
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    path = Path(DB_PATH)
    first_time = not path.exists()
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS missions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            status TEXT NOT NULL,
            flight_plan TEXT NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS telemetry_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            mission_id INTEGER NOT NULL,
            altitude REAL NOT NULL,
            velocity REAL NOT NULL,
            fuel REAL NOT NULL,
            status TEXT NOT NULL
        )
        """
    )
    if first_time:
        cur.execute(
            """
            INSERT INTO missions (name, status, flight_plan)
            VALUES (?, ?, ?)
            """,
            (
                "Odyssey One",
                "Preparación",
                "Lanzamiento desde plataforma A, órbita baja terrestre, fase de prueba de sistemas."
            ),
        )
        conn.commit()
    conn.close()

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json(silent=True) or {}
    username = data.get("username", "operador")
    token = "token-" + username
    return jsonify({"operator": username, "token": token})

@app.route("/api/missions", methods=["GET"])
def api_list_missions():
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT id, name, status FROM missions ORDER BY id")
    rows = cur.fetchall()
    missions = []
    for row in rows:
        missions.append(
            {
                "id": row["id"],
                "name": row["name"],
                "status": row["status"],
            }
        )
    conn.close()
    return jsonify(missions)

@app.route("/api/missions/<int:mission_id>", methods=["GET"])
def api_mission_detail(mission_id):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT id, name, status, flight_plan FROM missions WHERE id = ?",
        (mission_id,),
    )
    row = cur.fetchone()
    conn.close()
    if row is None:
        return jsonify({"error": "Mission not found"}), 404
    mission = {
        "id": row["id"],
        "name": row["name"],
        "status": row["status"],
        "flight_plan": row["flight_plan"],
    }
    return jsonify(mission)

@app.route("/api/missions", methods=["POST"])
def api_create_mission():
    data = request.get_json(silent=True) or {}
    name = data.get("name", "").strip()
    status = data.get("status", "Planeada").strip() or "Planeada"
    flight_plan = data.get("flight_plan", "").strip()
    if not name or not flight_plan:
        return jsonify({"error": "Missing name or flight_plan"}), 400
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO missions (name, status, flight_plan)
        VALUES (?, ?, ?)
        """,
        (name, status, flight_plan),
    )
    conn.commit()
    mission_id = cur.lastrowid
    conn.close()
    return jsonify(
        {
            "id": mission_id,
            "name": name,
            "status": status,
            "flight_plan": flight_plan,
        }
    ), 201

@app.route("/api/telemetry/stream")
def telemetry_stream():
    def generate():
        altitude = 0.0
        velocity = 0.0
        fuel = 100.0
        status = "Cuenta regresiva"
        mission_id = 1
        while True:
            altitude += random.uniform(80.0, 200.0)
            velocity += random.uniform(30.0, 80.0)
            fuel -= random.uniform(0.1, 0.5)
            if fuel < 0:
                fuel = 0.0
            if altitude > 100000 and status != "En órbita":
                status = "En órbita"
            timestamp = datetime.utcnow().isoformat() + "Z"
            conn = get_connection()
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO telemetry_logs (timestamp, mission_id, altitude, velocity, fuel, status)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (timestamp, mission_id, altitude, velocity, fuel, status),
            )
            conn.commit()
            conn.close()
            payload = {
                "timestamp": timestamp,
                "altitude": altitude,
                "velocity": velocity,
                "fuel": fuel,
                "status": status,
            }
            text = "data: " + json.dumps(payload) + "\n\n"
            yield text
            time.sleep(1.0)
    return Response(generate(), mimetype="text/event-stream")

@socketio.on("connect")
def ws_connect():
    emit(
        "broadcast_message",
        {"username": "Sistema", "message": "Nuevo operador conectado"}
    )

@socketio.on("new_message")
def ws_new_message(data):
    username = data.get("username", "Operador")
    message = data.get("message", "").strip()
    if not message:
        return
    emit(
        "broadcast_message",
        {"username": username, "message": message},
        broadcast=True,
    )

if __name__ == "__main__":
    init_db()
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)
