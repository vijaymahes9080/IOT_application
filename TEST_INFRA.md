# AGRI LINK ESP32 Firmware E2E Test Infrastructure & Methodology

## 1. Executive Summary & Test Philosophy

### 1.1 Purpose
This document establishes the authoritative End-to-End (E2E) testing infrastructure, architectural methodology, and verification gates for the AGRI LINK ESP32 Smart Agriculture OLED Display Firmware Refactor. 

### 1.2 Test Philosophy: Strict Opaque-Box Verification
Testing for embedded firmware refactoring must adhere to strict **opaque-box principles**:
1. **Zero Internal Code Coupling**: Tests evaluate the observable interface, behavioral contracts, hardware invariants, and end-to-end deliverables without relying on private implementation details.
2. **Requirement & Contract Driven**: Expected outputs are derived exclusively from authoritative requirements (`ORIGINAL_REQUEST.md`), interface specifications (`PROJECT.md`), and physical hardware constraints.
3. **Progressive Testability & Dual-Track Isolation**: Test writers work in an independent track and do NOT modify firmware implementation code. Implementation defects discovered during testing are systematically cataloged and escalated to the implementation team.
4. **Adversarial & Boundary Rigor**: Tests must verify not only the happy path, but also extreme corner cases, invalid inputs, sensor timeouts, and multi-hazard preemption cascades.

---

## 2. Test Architecture Overview

```
+--------------------------------------------------------------------------------------------------+
|                                    AGRI LINK TEST SUITE HARNESS                                  |
|                                (scratch/test_e2e_agri_link.py)                                   |
+--------------------------------------------------------------------------------------------------+
                                                 |
         +--------------------+------------------+------------------+--------------------+
         |                    |                                     |                    |
         v                    v                                     v                    v
+------------------+ +-------------------------+ +---------------------+ +----------------------+
|     TIER 1       | |         TIER 2          | |       TIER 3        | |        TIER 4        |
| Feature Coverage | | Boundary & Corner Cases | | Combinations & Prio | | Real-World Workloads |
+------------------+ +-------------------------+ +---------------------+ +----------------------+
| - Pin Invariants | | - Ultrasonic 10.0cm     | | - P1 vs P2 Priority | | - Heatwave Emergency |
| - Baud Rates     | | - Laser 200mm / Timeout | | - P2 vs P3 Priority | | - Tractor Collision  |
| - Sensor Inits   | | - Temp 40.0C / NaN      | | - P3 vs P4 Priority | | - Arid Flash Drought |
| - Actuator Modes | | - Soil 3000 / Clamping  | | - Multi-Alert Race  | | - 24h Carousel Loop  |
| - Threshold Defs | | - GPS Null / Out-of-bnd | | - Preemption Freeze | | - Sensor Disconnect  |
| - Build Compiler | | - NBSP Byte Hygiene     | | - Clear & Recovery  | | - Dwell Progression  |
+------------------+ +-------------------------+ +---------------------+ +----------------------+
         |                    |                                     |                    |
         +--------------------+------------------+------------------+--------------------+
                                                 |
                                                 v
                     +--------------------------------------------------------+
                     |                 STANDARDIZED ARTIFACTS                 |
                     |  - Console Execution Matrix with Color Highlights      |
                     |  - TEST_READY.md (Signoff & Coverage Matrix)           |
                     |  - Automated JSON / Markdown Telemetry Reports         |
                     +--------------------------------------------------------+
```

---

## 3. 4-Tier Test Methodology & Specification

### Tier 1: Feature Coverage (Baseline & Hardware Invariants)
Verifies that all baseline hardware features, pin assignments, baud rates, actuator directions, and build configurations are fully preserved.

| Test ID | Feature Under Test | Verification Method | Authoritative Source | Pass Criteria |
|---|---|---|---|---|
| `T1.1_PIN_INVARIANTS` | ESP32 GPIO Pin Map | Static AST & Regex analysis | `PROJECT.md` § Architecture | OLED Software SPI (23, 18, 19, 5, 4), I2C (21, 22), DHT (27), LDR (35), Soil (34), GPS (16, 17), Buzzer (32), Ultrasonic (12, 14), LEDs (25, 26, 33) match 100%. |
| `T1.2_BAUD_RATES` | UART Serial Configuration | Static AST & Regex analysis | `ORIGINAL_REQUEST.md` R3 | Primary `Serial` = 115200 baud, `GPS_Serial` (HardwareSerial 2) = 9600 baud. |
| `T1.3_PERIPHERAL_INITS` | Hardware & Peripheral Inits | Static AST & Regex analysis | `firmware_agri_link.ino` lines 507-535 | `Wire.begin(21, 22)`, `display.begin()`, `laser.init()`, `laser.startContinuous()`, `dht.begin()` (or object constructor) present and configured. |
| `T1.4_ACTUATOR_MODES` | Actuator Pin Directions | Static AST & Regex analysis | `firmware_agri_link.ino` lines 495-500 | `TRIG_PIN`, `BUZZER_PIN`, `LED_RED`, `LED_BLUE`, `LED_GREEN` configured as `OUTPUT`; `ECHO_PIN` configured as `INPUT`. |
| `T1.5_ALERT_CONSTANTS` | Alert Thresholds & Cadence | Static AST & Regex analysis | `PROJECT.md` § Architecture | `ULTRASONIC_NEAR_CM == 10.0`, `LASER_NEAR_MM == 200`, `HIGH_TEMP_C == 40.0`, `SOIL_DRY_THRESHOLD == 3000`; Buzzer frequencies (2000, 1600, 1000, 700 Hz) and intervals (150, 300, 500, 800 ms). |
| `T1.6_COMPILATION_CLEAN` | ESP32 Compiler Toolchain | `arduino-cli compile --fqbn esp32:esp32:esp32` | `PROJECT.md` M5, `ORIGINAL_REQUEST.md` | Exit code 0, 0 compiler errors, flash <= 50% (655,360 bytes), RAM <= 25% (81,920 bytes). |
| `T1.7_TARGET_SYNC` | Target Sketch Availability | File System verification | `PROJECT.md` § Code Layout | Both `firmware_agri_link.ino` and `firmware/AGRI_LINK_FIRMWARE/AGRI_LINK_FIRMWARE.ino` exist and are accessible. |

### Tier 2: Boundary & Corner Cases
Verifies that sensor transfer functions, distance limits, temperature extremes, null telemetries, and character encoding handle extreme boundary conditions gracefully.

| Test ID | Test Condition | Test Input Values | Expected Behavior & Output | Boundary Rationale |
|---|---|---|---|---|
| `T2.1_ULTRASONIC_BOUNDS` | Ultrasonic Distance Boundaries | Case A: `10.0 cm`<br>Case B: `10.01 cm`<br>Case C: `0.0 cm`<br>Case D: `-1.0 cm`<br>Case E: `400.0 cm` | Case A: `activeAlert = 1`<br>Case B: `activeAlert = 0`<br>Case C: `activeAlert = 0` (ignored non-positive)<br>Case D: `activeAlert = 0` (timeout ignored)<br>Case E: `activeAlert = 0` (far range safe) | 10.0 cm is the exact safety limit. <= 10.0 triggers; > 10.0 does not. Non-positive readings indicate sensor timeout. |
| `T2.2_LASER_BOUNDS` | Laser Distance Boundaries | Case A: `200 mm` (laserReady=T)<br>Case B: `201 mm` (laserReady=T)<br>Case C: `0 mm`<br>Case D: `150 mm` (laserReady=F)<br>Case E: `8190 mm` | Case A: `activeAlert = 2`<br>Case B: `activeAlert = 0`<br>Case C: `activeAlert = 0`<br>Case D: `activeAlert = 0` (unready sensor ignored)<br>Case E: `activeAlert = 0` (sensor error code) | 200 mm is the exact threshold. Unready sensor must gracefully degrade without false alerts. 8190 is Pololu out-of-range flag. |
| `T2.3_TEMP_BOUNDS` | Temperature Extremes & NaN | Case A: `40.0 °C`<br>Case B: `39.99 °C`<br>Case C: `NAN`<br>Case D: `-15.0 °C`<br>Case E: `85.0 °C` | Case A: `activeAlert = 3`<br>Case B: `activeAlert = 0`<br>Case C: `activeAlert = 0` (NaN protection active)<br>Case D: `activeAlert = 0`<br>Case E: `activeAlert = 3` | 40.0 °C is the high-temp threshold. DHT11 transient `NAN` must never trigger a false alert or arithmetic crash. |
| `T2.4_SOIL_CALIBRATION` | Soil Moisture Transfer Function | Case A: `soilRaw = 4095`<br>Case B: `soilRaw = 1500`<br>Case C: `soilRaw = 5000`<br>Case D: `soilRaw = 1000`<br>Case E: `soilRaw = 3000` | Case A: `0%` moisture<br>Case B: `100%` moisture<br>Case C: `0%` moisture (clamped)<br>Case D: `100%` moisture (clamped)<br>Case E: `~43%` moisture; Alert 4 if enabled | Calibrated range: 4095 (air dry) to 1500 (water wet). `constrain()` ensures percentages never violate 0-100%. |
| `T2.5_GPS_TELEMETRY` | GPS Telemetry & Fix Boundaries | Case A: `gpsFix = false`<br>Case B: `gpsFix = true, lat=13.0827, lon=80.2707`<br>Case C: `lat = 95.0` (invalid)<br>Case D: `age = 6000 ms` | Case A: Render "Searching / Acquiring"<br>Case B: Render exact formatted coordinates<br>Case C: Reject coordinate, flag invalid<br>Case D: `gpsFix = false` (age >= 5000ms stale) | GPS must differentiate searching vs locked states, format coordinates cleanly, and reject stale or out-of-bounds fixes. |
| `T2.6_SYNTAX_HYGIENE` | NBSP Byte Hygiene | Binary scan for `\xc2\xa0` in `.ino` source | 0 occurrences of non-breaking space bytes | Eliminates GCC compilation error: `error: extended character \xa0 is not valid in an identifier`. |

### Tier 3: Cross-Feature Combinations & Alert Arbitration
Verifies the priority engine when multiple hazards occur concurrently and checks state machine transitions between carousel page rotation and emergency preemption.

| Test ID | Interaction Scenario | Input Conditions | Expected Priority & Output State | Invariant Justification |
|---|---|---|---|---|
| `T3.1_PRIO_ULT_VS_LSR` | Proximity Collision vs Laser Obstacle | `ultrasonicCm = 8.0` (P1) AND `laserMm = 150` (P2) | `activeAlert = 1` (Priority 1 wins)<br>LED: RED<br>Buzzer: 2000 Hz @ 150 ms | Physical obstacle collision (Ultrasonic) takes precedence over optical proximity barrier. |
| `T3.2_PRIO_LSR_VS_TMP` | Laser Obstacle vs Thermal Hazard | `laserMm = 120` (P2) AND `temperatureC = 45.2` (P3) | `activeAlert = 2` (Priority 2 wins)<br>LED: RED<br>Buzzer: 1600 Hz @ 300 ms | Immediate mechanical safety hazard takes precedence over environmental heat stress. |
| `T3.3_PRIO_TMP_VS_SOL` | Thermal Hazard vs Soil Drought | `temperatureC = 41.5` (P3) AND `soilRaw = 3800` (P4, enabled) | `activeAlert = 3` (Priority 3 wins)<br>LED: BLUE<br>Buzzer: 1000 Hz @ 500 ms | Thermal emergency requires immediate human intervention before long-term soil drought. |
| `T3.4_ALL_HAZARDS` | Simultaneous Quad-Hazard | All 4 hazard conditions active | `activeAlert = 1`<br>LED: RED<br>Buzzer: 2000 Hz | Priority 1 strictly preempts all lower priority alerts. |
| `T3.5_PREEMPTION_FREEZE`| Alert Preemption vs Page Rotation | Page = 4, `activeAlert = 2`, `elapsed = 6000 ms` | Display overridden to `pageAlert()`; `currentPage` remains 4; rotation timer frozen. | Normal carousel pages must not advance in background during an active emergency. |
| `T3.6_ALERT_RESTORE` | Alert Resolution & Carousel Recovery | `activeAlert` drops from 2 to 0 | Display restores Page 4 without skipping; Buzzer silenced; LED switches to GREEN. | Clearing emergency returns system to previous state cleanly without jump cuts. |

### Tier 4: Real-World Workloads & Scenarios
Simulates operational agricultural field workloads across multi-hour cycles, verifying sensor telemetry dynamics, dwell time progression, and visual stability.

| Test ID | Scenario Name | Operational Workflow | Pass Criteria |
|---|---|---|---|
| `T4.1_HEATWAVE_CYCLE` | Greenhouse Severe Heatwave | Normal 25.0°C -> Temperature rises to 43.5°C over simulated midday -> Alert 3 triggers with Blue LED & 1000Hz buzzer -> Emergency exhaust activated -> Temperature drops to 27.5°C -> System recovers to Normal with Green LED. | Correct alert entry, buzzer/LED activation, state holding, and clean recovery to Alert 0. |
| `T4.2_TRACTOR_COLLISION` | Obstacle Collision During Navigation | System rotating at Page 5 (Laser) -> Worker walks into ultrasonic beam at 6.2 cm -> Immediate Priority 1 preemption -> Red LED & 2000Hz cadence -> Worker steps away (distance 35.0 cm) -> Display returns to Page 5. | Zero-latency preemption, correct buzzer/LED, rotation freeze, and recovery to exact pre-alert page. |
| `T4.3_FLASH_DROUGHT` | Arid Soil Flash Drought | Soil moisture starts at raw 1800 (wet) -> Dries out to raw 3400 -> When `ENABLE_SOIL_ALERT = true`, Alert 4 triggers with Blue LED & 700Hz buzzer -> When disabled, remains at Alert 0 with moisture % indicated. | Correct behavior with configurable alert flag toggle. |
| `T4.4_24H_CAROUSEL_LOOP` | 24-Hour Continuous Page Rotation | System runs through full carousel rotation (Page 0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 0). | All 9 pages present, have distinct rendering handlers, dwell progress increments smoothly across 5000 ms, zero page memory leaks. |
| `T4.5_SENSOR_DISCONNECT` | Hot-Unplug / Sensor Glitch Resilience | Laser sensor disconnected (`laserReady = false`, `laserMm = 0`) -> DHT11 returns NaN -> Ultrasonic times out (-1.0). | Firmware continues executing at stable frame rate, displays graceful disconnect indicators (`---` / `Searching`), zero division-by-zero crashes. |

---

## 4. Traceability Matrix

| Requirement / Scope Item | Project Feature | Tier 1 Tests | Tier 2 Tests | Tier 3 Tests | Tier 4 Tests |
|---|---|---|---|---|---|
| **R1: OLED Visual Redesign** | Features 2, 3, 4, 5, 6-14 | `T1.7` | `T2.5` | `T3.5` | `T4.4` |
| **R2: Smooth Animation & Timing** | Features 17, 18 | `T1.6` | `T2.4` | `T3.5`, `T3.6` | `T4.4` |
| **R3: Hardware & Sensor Preservation**| Features 1, 16, 19 | `T1.1`, `T1.2`, `T1.3`, `T1.4`, `T1.5` | `T2.1`, `T2.2`, `T2.3`, `T2.4`, `T2.6` | `T3.1`, `T3.2`, `T3.3`, `T3.4` | `T4.1`, `T4.2`, `T4.3`, `T4.5` |
| **Safety & Alert Engine** | Features 15, 16 | `T1.5` | `T2.1`, `T2.2`, `T2.3` | `T3.1`, `T3.2`, `T3.3`, `T3.4`, `T3.5`, `T3.6` | `T4.1`, `T4.2`, `T4.3` |
| **Compilation Integrity** | Features 1, 20 | `T1.6`, `T1.7` | `T2.6` | - | `T4.5` |

---

## 5. Automated Test Runner Specification

The automated test runner is implemented in `scratch/test_e2e_agri_link.py`. It is a self-contained Python CLI script that runs with standard library dependencies.

### 5.1 CLI Execution Commands

```bash
# Execute the complete 4-tier test suite
python scratch/test_e2e_agri_link.py

# Execute specific test tiers
python scratch/test_e2e_agri_link.py --tier 1
python scratch/test_e2e_agri_link.py --tier 2
python scratch/test_e2e_agri_link.py --tier 3
python scratch/test_e2e_agri_link.py --tier 4

# Verbose execution with detailed diagnostic logs
python scratch/test_e2e_agri_link.py --verbose

# Export structured reports
python scratch/test_e2e_agri_link.py --export-json scratch/test_results.json
python scratch/test_e2e_agri_link.py --export-markdown scratch/test_results.md
```

### 5.2 Pass / Fail Criteria & Exit Codes
- **Exit Code 0**: All executed test cases passed successfully.
- **Exit Code 1**: One or more test assertions failed, or compilation produced an error.
- **Compilation Gate**:
  - `arduino-cli` exit code must be `0`.
  - Compiler diagnostics must contain 0 errors.
  - Flash utilization <= 50% (`655,360 bytes`).
  - RAM utilization <= 25% (`81,920 bytes`).
- **Syntax Hygiene Gate**:
  - 0 non-breaking space bytes (`\u00a0`).
- **Hardware Invariant Gate**:
  - 100% of GPIO pins, baud rates, and alert thresholds must match baseline requirements.

---

## 6. Defect Escalation Protocol

When the test runner identifies a regression or defect:
1. **Document Empirical Evidence**: Verbatim command line output, line numbers, and observed vs expected values.
2. **Classify Severity**:
   - `BLOCKER`: Firmware compilation fails or pin assignments altered.
   - `CRITICAL`: Safety alert priority inverted or preemption broken.
   - `MAJOR`: Boundary calculation error or non-breaking space syntax corruption.
   - `MINOR`: Cosmetic layout deviation or formatting inconsistency.
3. **Escalate to Implementation Worker**: Test writers do NOT alter firmware code; escalate via teamwork dispatch/handoff to the designated implementing agent.
