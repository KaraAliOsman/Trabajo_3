let currentOperator = null
let currentMissionId = 1
let telemetrySource = null
let socketInstance = null

function apiLogin(username) {
    return fetch("/api/login", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({username: username})
    }).then(r => r.json())
}

function loadMissions() {
    return fetch("/api/missions")
        .then(r => r.json())
        .then(missions => {
            const list = document.getElementById("missions-list")
            list.innerHTML = ""
            missions.forEach(m => {
                const btn = document.createElement("button")
                btn.textContent = m.id + " - " + m.name + " (" + m.status + ")"
                btn.dataset.missionId = m.id
                if (m.id === currentMissionId) {
                    btn.classList.add("active")
                }
                btn.addEventListener("click", () => {
                    currentMissionId = m.id
                    document.querySelectorAll("#missions-list button").forEach(b => b.classList.remove("active"))
                    btn.classList.add("active")
                    loadMissionDetail(m.id)
                    startTelemetry()
                })
                list.appendChild(btn)
            })
            if (missions.length > 0) {
                if (!currentMissionId) {
                    currentMissionId = missions[0].id
                }
                loadMissionDetail(currentMissionId)
                startTelemetry()
            }
        })
}

function loadMissionDetail(id) {
    fetch("/api/missions/" + id)
        .then(r => r.json())
        .then(m => {
            const detail = document.getElementById("mission-detail")
            if (m.error) {
                detail.textContent = "Misión no encontrada"
                return
            }
            detail.innerHTML = ""
            const title = document.createElement("h3")
            title.textContent = m.name
            const status = document.createElement("p")
            status.textContent = "Estado: " + m.status
            const plan = document.createElement("p")
            plan.textContent = "Plan de vuelo: " + m.flight_plan
            detail.appendChild(title)
            detail.appendChild(status)
            detail.appendChild(plan)
        })
}

function createMission() {
    const nameInput = document.getElementById("new-mission-name")
    const statusInput = document.getElementById("new-mission-status")
    const planInput = document.getElementById("new-mission-plan")
    const statusLabel = document.getElementById("create-mission-status")
    const name = nameInput.value.trim()
    const status = statusInput.value.trim() || "Planeada"
    const plan = planInput.value.trim()
    if (!name || !plan) {
        statusLabel.textContent = "Falta nombre o plan de vuelo"
        return
    }
    fetch("/api/missions", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            name: name,
            status: status,
            flight_plan: plan
        })
    })
        .then(r => r.json())
        .then(m => {
            if (m.error) {
                statusLabel.textContent = "Error: " + m.error
                return
            }
            statusLabel.textContent = "Misión creada con ID " + m.id
            nameInput.value = ""
            statusInput.value = ""
            planInput.value = ""
            loadMissions()
        })
}

function updateTelemetryView(data) {
    const altElem = document.getElementById("telemetry-altitude")
    const velElem = document.getElementById("telemetry-velocity")
    const fuelElem = document.getElementById("telemetry-fuel")
    const statusElem = document.getElementById("telemetry-status")
    const timeElem = document.getElementById("telemetry-timestamp")
    const logList = document.getElementById("telemetry-log-list")

    altElem.textContent = data.altitude.toFixed(1)
    velElem.textContent = data.velocity.toFixed(1)
    fuelElem.textContent = data.fuel.toFixed(1)
    statusElem.textContent = data.status
    timeElem.textContent = data.timestamp

    const li = document.createElement("li")
    li.textContent =
        "[" + data.timestamp + "] Altitud " + data.altitude.toFixed(1) +
        " m, Velocidad " + data.velocity.toFixed(1) +
        " m/s, Combustible " + data.fuel.toFixed(1) + " %, Estado " + data.status
    logList.prepend(li)
    while (logList.children.length > 20) {
        logList.removeChild(logList.lastChild)
    }
}

function startTelemetry() {
    if (telemetrySource) {
        telemetrySource.close()
        telemetrySource = null
    }
    const source = new EventSource("/api/telemetry/stream")
    source.onmessage = function (event) {
        const data = JSON.parse(event.data)
        updateTelemetryView(data)
    }
    source.onerror = function () {
        source.close()
    }
    telemetrySource = source
}

function initChat(username) {
    currentOperator = username || "operador"
    if (socketInstance) {
        return
    }
    socketInstance = io()
    const messagesDiv = document.getElementById("chat-messages")
    const input = document.getElementById("chat-text")
    const button = document.getElementById("btn-send-chat")

    socketInstance.on("broadcast_message", data => {
        const msgDiv = document.createElement("div")
        msgDiv.classList.add("chat-message")
        const usernameSpan = document.createElement("span")
        const textSpan = document.createElement("span")
        if (data.username === "Sistema") {
            usernameSpan.textContent = "[Sistema] "
            usernameSpan.classList.add("system")
        } else {
            usernameSpan.textContent = "[" + data.username + "] "
            usernameSpan.classList.add("username")
        }
        textSpan.textContent = data.message
        msgDiv.appendChild(usernameSpan)
        msgDiv.appendChild(textSpan)
        messagesDiv.appendChild(msgDiv)
        messagesDiv.scrollTop = messagesDiv.scrollHeight
    })

    button.addEventListener("click", () => {
        const text = input.value.trim()
        if (!text) {
            return
        }
        socketInstance.emit("new_message", {
            username: currentOperator,
            message: text
        })
        input.value = ""
    })

    input.addEventListener("keyup", event => {
        if (event.key === "Enter") {
            button.click()
        }
    })
}

document.addEventListener("DOMContentLoaded", () => {
    const btnLogin = document.getElementById("btn-login")
    const usernameInput = document.getElementById("username")
    const loginStatus = document.getElementById("login-status")
    const btnCreateMission = document.getElementById("btn-create-mission")

    btnLogin.addEventListener("click", () => {
        const username = usernameInput.value.trim() || "operador"
        apiLogin(username).then(data => {
            currentOperator = data.operator
            loginStatus.textContent = "Conectado como " + currentOperator
            initChat(currentOperator)
        })
    })

    btnCreateMission.addEventListener("click", () => {
        createMission()
    })

    loadMissions()
    startTelemetry()
})
