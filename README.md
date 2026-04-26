# 🛰️ ORBIT-X: Autonomous Satellite Monitoring & AI Command Console
## 🚀 MISSION: TITAN-1

[![Tech Stack](https://img.shields.io/badge/Stack-Electron%20|%20Node.js%20|%20Python%20|%20ML-00e5ff?style=for-the-badge)](https://github.com/your-repo/orbit-x)
[![Mission Status](https://img.shields.io/badge/Mission-TITAN--1%20Nominal-green?style=for-the-badge)](https://github.com/your-repo/orbit-x)

---

## 1. INTRODUCTION
**ORBIT-X** is a next-generation autonomous satellite monitoring system designed for the **TITAN-1 Mission**. It bridges the gap between low-level IOT hardware telemetry and high-level AI-driven decision-making. The system utilizes **Hybrid Edge Computing**, where critical data processing happens locally to ensure zero-latency responses, while long-term trends and global model weights are managed via the cloud.

> [!IMPORTANT]
> **Full Documentation**: For a deep-dive into the engineering, mathematics, and operational logic of Orbit-X, please refer to the **[MISSION TITAN-1 TECHNICAL REPORT](file:///d:/intership/IOT_2026-main/MISSION_TITAN_1_TECHNICAL_REPORT.md)** (25-Page Technical Manifesto).

The system is built on the principle of **Autonomous Resilience**, meaning it can detect and mitigate hardware or software failures without human intervention. Key objectives include:
- **High-Fidelity Telemetry Tracking**: Real-time acquisition of 15+ sensor parameters.
- **Autonomous Anomaly Detection**: Utilizing **Reconstruction Error Analysis** via Autoencoders to identify system drifts.
- **Hybrid Cloud Integration**: Seamless synchronization between local edge processing and ThingsBoard IOT Cloud.
- **Mission Resilience**: Robust hardware/software layers designed for 100% uptime.

---

## 2. COMPONENTS LIST AND DESCRIPTION

### **Software Components**
- **Electron (Core Dashboard)**: Cross-platform desktop environment providing a high-performance HUD using Vanilla CSS and JavaScript.
- **Node.js (Orchestration)**: Manages IPC, database transactions, and background services.
- **Python (Neural Core)**: Flask-based microservice hosting heavy-duty ML/DL models (LSTM, Autoencoders).
- **TensorFlow.js & PyTorch**: Used for both local inference and distributed training.
- **MS Access (MDB)**: Local edge database utilizing a custom **Robust ADODB Proxy** for high-frequency data persistence.
- **MQTT (ThingsBoard)**: Protocol for remote telemetry streaming and global model weight synchronization.

### **Hardware Components (AgriNode System)**
- **ESP32 Microcontroller**: The heart of the hardware node, handling Wi-Fi/Serial communication.
- **MPU6050 (IMU)**: Provides 3-axis Gyroscope and Accelerometer data for orientation tracking.
- **Soil Moisture Sensor**: Real-time monitoring of ground conditions for automated irrigation.
- **DHT11 (Temp/Humidity)**: Environmental monitoring for climate risk assessment.
- **Ultrasonic Sensor (HC-SR04)**: Distance measurement for proximity alerts or fluid level monitoring.
- **LDR (Photoresistor)**: Ambient light detection for solar power optimization.
- **Solar/Battery Management**: Monitors battery voltage and solar charging current.

---

## 3. CIRCUIT DIAGRAM

![ORBIT-X Hardware Architecture](assets/orbit_x_circuit_diagram.png)
*Figure 1: Conceptual circuit diagram showing the ESP32 integration with various environmental and inertial sensors.*

---

## 4. CODE AND EXPLANATION

### **A. AI Neural Core (app.py)**
The Neural Core uses a **Hybrid Neural Engine** to process 15-feature telemetry vectors.
```python
@app.route('/predict/universal', methods=['POST'])
def predict_universal():
    """Universal autonomous prediction endpoint."""
    data = request.json or {}
    res, model_name = _get_prediction(data)
    return jsonify({
        "result": float(res),
        "model_used": model_name or "Stable_Ensemble",
        "timestamp": datetime.now().isoformat()
    })
```
*Explanation*: This endpoint allows the dashboard to query the local Python AI service. It falls back between different models (LSTM for time-series, Autoencoder for anomalies) based on the input signature.

### **B. Hardware Communication (serial-client.js)**
A resilient serial client that handles auto-discovery and data parsing.
```javascript
// Map incoming labels to buffer keys
if (/temp.?1|t1|temp|temperature/.test(rawKey))    buffer.temp1       = val;
else if (/hum|humidity|rh|h1/.test(rawKey))             buffer.humidity    = val;
else if (/soil|moist|moisture|sm|s1/.test(rawKey))      buffer.soilMoisture= val;
```
*Explanation*: The client uses regex to normalize varied data formats from different MCU firmwares, ensuring the dashboard remains compatible even if the hardware sensor labels change.

---

## 5. WORKING PRINCIPLE

The system operates on a cyclical **Sense-Analyze-Act** loop, optimized for high-reliability mission environments.

### **Phase 1: Multi-Modal Data Acquisition**
The **ESP32 Microcontroller** serves as the primary edge device, sampling high-dimensional telemetry vectors. This involves I2C communication with the **MPU6050** for inertial data and analog/digital sampling of environmental sensors. Data is serialized and transmitted via USB-UART to the ground station.

### **Phase 2: Standardized Normalization**
Raw telemetry is often noisy or non-linear. The **Node.js Orchestrator** implements a **Standardization Layer** that uses regular expressions to parse incoming streams. This ensures that the downstream AI models receive a fixed-length 15-feature vector, regardless of sensor configuration or firmware variations.

### **Phase 3: Neural Inference & Anomaly Detection**
The normalized vector is processed by the **Hybrid Neural Engine**:
- **Autoencoders (AE)**: This model is trained to compress and then reconstruct "normal" telemetry. By calculating the **MSE (Mean Squared Error)** between the input and the reconstruction, the system identifies anomalies. A high error indicates that the current telemetry does not match any known "stable" patterns.
- **LSTM (Long Short-Term Memory)**: Used for time-series forecasting, the LSTM predicts future values for critical metrics like battery voltage and orbital velocity, allowing ground control to pre-emptively mitigate risks.

### **Phase 4: Persistence & Cloud Synchronization**
To maintain a high-integrity mission log, data is written to the **MS Access Edge Database**. To optimize disk performance, the system uses **Adaptive Throttling**, adjusting write frequency based on system load. Every 45 seconds, the local data is synchronized with **ThingsBoard**, which serves as a global monitoring hub and a repository for updated neural network weights.

---

## 6. ADVANTAGES
- **Offline First**: Full AI and database capability without an internet connection.
- **Low Latency**: IPC-based communication ensures < 50ms delay between sensor read and UI update.
- **Scalable Architecture**: MQTT support allows one dashboard to monitor multiple AgriNodes globally.
- **High Transparency**: The integrated terminal allows ground control to inspect raw bitstreams in real-time.
- **Resilient Design**: Includes **GPU Defense Mode** to prevent system crashes during high-load inference.

---

## 7. CONCLUSION AND FUTURE WORK
The ORBIT-X system successfully integrates IOT hardware, edge databases, and deep learning into a cohesive mission control platform. It demonstrates that complex satellite-grade monitoring can be achieved using accessible hardware and modern web technologies.

**Future Enhancements**:
- **3D Digital Twin**: Integration of Three.js for real-time 3D visualization of the satellite's orientation.
- **Blockchain Logging**: Implementing a decentralized ledger for tamper-proof mission logs.
- **LoRa Support**: Long-range radio integration for monitoring nodes in areas without Wi-Fi.

---

## 8. SCREENSHOT

![ORBIT-X Command Console](assets/dashboard_preview.png)
*Figure 2: The ORBIT-X Command Console HUD showing real-time AI predictions and orbital tracking.*

---

## 9. REFERENCE
1. **Electron Documentation**: [electronjs.org](https://www.electronjs.org/docs)
2. **SerialPort Node.js**: [serialport.io](https://serialport.io/)
3. **ThingsBoard IoT Platform**: [thingsboard.io](https://thingsboard.io/)
4. **TensorFlow & Keras API**: [tensorflow.org](https://www.tensorflow.org/)
5. **Mission TITAN-1 Technical Spec v2.4** (Internal Project Document)
