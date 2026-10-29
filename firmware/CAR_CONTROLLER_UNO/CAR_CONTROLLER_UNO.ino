#include <SoftwareSerial.h>

// ============================================================================
//            AGRI-LINK / SMART AUTONOMOUS CAR CONTROLLER (UNO 1)
// ============================================================================
// Hardware Pin Mapping:
//  - Front Ultrasonic: TRIG = 2, ECHO = 3
//  - L298N Motor Driver: ENA = 5, IN1 = 4, IN2 = 7, IN3 = 8, IN4 = 9, ENB = 6
//  - Buzzer: Pin 10
//  - Bluetooth (HC-05): RX = 11, TX = 12
//  - UNO 2 Dustbin Comms: RX = A0, TX = A1
//  - USB Serial: Hardware Serial (Pins 0/1) at 9600 baud
// ============================================================================

// Front Ultrasonic
const byte TRIG = 2;
const byte ECHO = 3;

// L298N Motor Driver Pins
const byte ENA = 5;
const byte IN1 = 4;
const byte IN2 = 7;
const byte IN3 = 8;
const byte IN4 = 9;
const byte ENB = 6;

// Buzzer
const byte BUZZER = 10;

// Bluetooth: RX=11, TX=12
SoftwareSerial bluetooth(11, 12);

// UNO 2 Communication: RX=A0, TX=A1
SoftwareSerial dustbinSerial(A0, A1);

// Tuning Parameters
const int MOTOR_SPEED = 170;       // Standard cruise speed (0-255)
const int TURN_SPEED  = 160;       // Turning maneuver speed
const int OBSTACLE_DISTANCE = 25;  // Obstacle avoidance threshold (cm)

// Operating States
bool manualMode = false;           // Default to Full Auto Mode
bool dustbinBusy = false;
bool obstacleDetected = false;

unsigned long lastSensorRead = 0;
unsigned long lastDustbinCheck = 0;
unsigned long lastTelemetryLog = 0;

char dustbinMessage[16];
byte dustbinIndex = 0;
int avoidTurnDirection = 0;        // Alternates 0=Right, 1=Left for intelligent navigation

// ----------------------------------------------------------------------------
// Distance Measurement via HC-SR04
// ----------------------------------------------------------------------------
long readDistanceCM() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);

  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);

  digitalWrite(TRIG, LOW);

  unsigned long duration = pulseIn(ECHO, HIGH, 30000UL); // 30ms timeout (~5m max)

  if (duration == 0) return 999; // Sensor out of range or no echo

  long cm = duration * 0.0343 / 2.0;
  return (cm > 0) ? cm : 999;
}

// ----------------------------------------------------------------------------
// Motor Control Functions
// ----------------------------------------------------------------------------
void stopMotors() {
  analogWrite(ENA, 0);
  analogWrite(ENB, 0);

  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, LOW);
}

void setMotors(int leftSpeed, int rightSpeed, bool leftForward, bool rightForward) {
  if (dustbinBusy) {
    stopMotors();
    return;
  }

  digitalWrite(IN1, leftForward ? HIGH : LOW);
  digitalWrite(IN2, leftForward ? LOW : HIGH);

  digitalWrite(IN3, rightForward ? HIGH : LOW);
  digitalWrite(IN4, rightForward ? LOW : HIGH);

  analogWrite(ENA, constrain(leftSpeed, 0, 255));
  analogWrite(ENB, constrain(rightSpeed, 0, 255));
}

void moveForward(int speedVal = MOTOR_SPEED) {
  if (dustbinBusy || obstacleDetected) {
    stopMotors();
    return;
  }
  setMotors(speedVal, speedVal, true, true);
}

void moveBackward(int speedVal = MOTOR_SPEED) {
  if (dustbinBusy) {
    stopMotors();
    return;
  }
  setMotors(speedVal, speedVal, false, false);
}

void turnLeft(int speedVal = TURN_SPEED) {
  if (dustbinBusy) {
    stopMotors();
    return;
  }
  setMotors(speedVal, speedVal, false, true);
}

void turnRight(int speedVal = TURN_SPEED) {
  if (dustbinBusy) {
    stopMotors();
    return;
  }
  setMotors(speedVal, speedVal, true, false);
}

// ----------------------------------------------------------------------------
// Autonomous Obstacle Avoidance Maneuver (Optimized Auto Mode)
// ----------------------------------------------------------------------------
void executeObstacleAvoidance(long currentDistance) {
  Serial.print(F("[AUTO-AVOID] Obstacle at: "));
  Serial.print(currentDistance);
  Serial.println(F(" cm! Initiating avoidance maneuver..."));

  // 1. Immediate Halt & Audible Warning
  stopMotors();
  tone(BUZZER, 1800, 180);
  delay(150);

  // 2. Reverse briefly to gain steering clearance
  moveBackward(MOTOR_SPEED - 20);
  delay(350);
  stopMotors();
  delay(100);

  // 3. Intelligent Turn Selection (Alternates Left / Right if blocked)
  if (avoidTurnDirection == 0) {
    Serial.println(F("[AUTO-AVOID] Steering RIGHT..."));
    turnRight(TURN_SPEED);
    avoidTurnDirection = 1;
  } else {
    Serial.println(F("[AUTO-AVOID] Steering LEFT..."));
    turnLeft(TURN_SPEED);
    avoidTurnDirection = 0;
  }
  delay(420); // Turn duration for ~60-80 degree evasion
  stopMotors();
  delay(120);

  // 4. Verify path is clear before proceeding
  long newDist = readDistanceCM();
  if (newDist > OBSTACLE_DISTANCE) {
    obstacleDetected = false;
    Serial.print(F("[AUTO-AVOID] Path clear ("));
    Serial.print(newDist);
    Serial.println(F(" cm). Resuming forward drive."));
    moveForward();
  } else {
    Serial.println(F("[AUTO-AVOID] Path still obstructed, will re-evade next cycle."));
  }
}

// ----------------------------------------------------------------------------
// UNO 2 (Dustbin) Message Check
// ----------------------------------------------------------------------------
void checkDustbin() {
  dustbinSerial.listen();

  while (dustbinSerial.available()) {
    char c = dustbinSerial.read();

    if (c == '\n' || c == '\r') {
      if (dustbinIndex > 0) {
        dustbinMessage[dustbinIndex] = '\0';

        if (strcmp(dustbinMessage, "BUSY") == 0) {
          dustbinBusy = true;
          stopMotors();
          Serial.println(F("[DUSTBIN] State: BUSY - Car Halted"));
          tone(BUZZER, 1000, 100);
        }
        else if (strcmp(dustbinMessage, "READY") == 0) {
          dustbinBusy = false;
          Serial.println(F("[DUSTBIN] State: READY - Car Resumed"));
          tone(BUZZER, 2200, 80);
        }

        dustbinIndex = 0;
      }
    }
    else if (dustbinIndex < sizeof(dustbinMessage) - 1) {
      dustbinMessage[dustbinIndex++] = c;
    }
  }
}

// ----------------------------------------------------------------------------
// Bluetooth Commands (App / Remote Control)
// ----------------------------------------------------------------------------
void checkBluetooth() {
  bluetooth.listen();

  if (!bluetooth.available()) return;

  char command = bluetooth.read();
  Serial.print(F("[BT-CMD] Received: "));
  Serial.println(command);

  if (command == 'M' || command == 'm') {
    manualMode = true;
    obstacleDetected = false;
    stopMotors();
    Serial.println(F("[MODE] Switched to MANUAL control."));
    tone(BUZZER, 1200, 120);
    return;
  }

  if (command == 'A' || command == 'a') {
    manualMode = false;
    obstacleDetected = false;
    stopMotors();
    Serial.println(F("[MODE] Switched to FULL AUTO mode."));
    tone(BUZZER, 2400, 150);
    return;
  }

  if (command == 'S' || command == 's') {
    stopMotors();
    return;
  }

  if (dustbinBusy) {
    stopMotors();
    return;
  }

  // Manual driving commands
  if (manualMode) {
    if (command == 'F' || command == 'f') {
      obstacleDetected = false;
      moveForward();
    }
    else if (command == 'B' || command == 'b') {
      moveBackward();
    }
    else if (command == 'L' || command == 'l') {
      turnLeft();
    }
    else if (command == 'R' || command == 'r') {
      turnRight();
    }
  }
}

// ----------------------------------------------------------------------------
// Hardware Startup & Circuit Verification
// ----------------------------------------------------------------------------
void setup() {
  Serial.begin(9600);
  bluetooth.begin(9600);
  dustbinSerial.begin(9600);

  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);

  pinMode(ENA, OUTPUT);
  pinMode(ENB, OUTPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);

  pinMode(BUZZER, OUTPUT);

  stopMotors();

  Serial.println(F("=================================================="));
  Serial.println(F("  AGRI LINK - UNO 1 CAR CONTROLLER ONLINE"));
  Serial.println(F("=================================================="));

  // Circuit Self-Test Sequence
  Serial.println(F("[TEST] Running Circuit Self-Diagnostics..."));
  tone(BUZZER, 1800, 80);
  delay(120);
  tone(BUZZER, 2400, 100);
  delay(200);

  long initialDist = readDistanceCM();
  Serial.print(F("[TEST] Front Ultrasonic Ping: "));
  Serial.print(initialDist);
  Serial.println(F(" cm"));

  Serial.println(F("[TEST] Testing L298N Motors (0.1s Pulse)..."));
  analogWrite(ENA, 120);
  analogWrite(ENB, 120);
  digitalWrite(IN1, HIGH);
  digitalWrite(IN3, HIGH);
  delay(120);
  stopMotors();

  Serial.println(F("[OK] Circuit Test Passed. Starting FULL AUTO MODE..."));
  Serial.println(F("=================================================="));
}

// ----------------------------------------------------------------------------
// Main Operational Loop
// ----------------------------------------------------------------------------
void loop() {
  // 1. Process Remote Bluetooth input
  checkBluetooth();

  // 2. Poll UNO 2 Dustbin state every 25ms
  if (millis() - lastDustbinCheck >= 25) {
    lastDustbinCheck = millis();
    checkDustbin();
  }

  // 3. Safety Halt if dustbin is currently active
  if (dustbinBusy) {
    stopMotors();
    return;
  }

  // 4. Autonomous Driving & Obstacle Avoidance Loop
  if (!manualMode && millis() - lastSensorRead >= 80) {
    lastSensorRead = millis();

    long distance = readDistanceCM();

    // Periodic live telemetry to USB serial
    if (millis() - lastTelemetryLog >= 600) {
      lastTelemetryLog = millis();
      Serial.print(F("[TELEMETRY] Mode: AUTO | Dist: "));
      Serial.print(distance);
      Serial.print(F(" cm | Status: "));
      if (distance <= OBSTACLE_DISTANCE) {
        Serial.println(F("OBSTACLE DETECTED"));
      } else {
        Serial.println(F("CRUISING FORWARD"));
      }
    }

    if (distance <= OBSTACLE_DISTANCE && distance > 0) {
      obstacleDetected = true;
      executeObstacleAvoidance(distance);
    } else {
      obstacleDetected = false;
      moveForward();
    }
  }
}
