#include <SoftwareSerial.h>

// Front Ultrasonic
const byte TRIG = 2;
const byte ECHO = 3;

// L298N Motor Driver — Original Pins
const byte ENA = 5;
const byte IN1 = 4;
const byte IN2 = 7;
const byte IN3 = 8;
const byte IN4 = 9;
const byte ENB = 6;

// Buzzer
const byte BUZZER = 10;

// Bluetooth: RX, TX
SoftwareSerial bluetooth(11, 12);

// UNO 2 Communication: RX, TX
SoftwareSerial dustbinSerial(A0, A1);

const int MOTOR_SPEED = 170;
const int OBSTACLE_DISTANCE = 25;

bool manualMode = false;
bool dustbinBusy = false;
bool obstacleDetected = false;

unsigned long lastSensorRead = 0;
unsigned long lastDustbinCheck = 0;

char bluetoothCommand = '\0';
char dustbinMessage[16];
byte dustbinIndex = 0;

long readDistanceCM() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);

  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);

  digitalWrite(TRIG, LOW);

  unsigned long duration =
      pulseIn(ECHO, HIGH, 25000UL);

  if (duration == 0) return 999;

  return duration * 0.0343 / 2.0;
}

void stopMotors() {
  analogWrite(ENA, 0);
  analogWrite(ENB, 0);

  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, LOW);
}

void setMotors(int leftSpeed, int rightSpeed,
               bool leftForward, bool rightForward) {
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

void moveForward() {
  if (dustbinBusy || obstacleDetected) {
    stopMotors();
    return;
  }

  setMotors(MOTOR_SPEED, MOTOR_SPEED, true, true);
}

void moveBackward() {
  if (dustbinBusy) {
    stopMotors();
    return;
  }

  setMotors(MOTOR_SPEED, MOTOR_SPEED, false, false);
}

void turnLeft() {
  if (dustbinBusy) {
    stopMotors();
    return;
  }

  setMotors(MOTOR_SPEED, MOTOR_SPEED, false, true);
}

void turnRight() {
  if (dustbinBusy) {
    stopMotors();
    return;
  }

  setMotors(MOTOR_SPEED, MOTOR_SPEED, true, false);
}

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
          Serial.println("Dustbin active - car stopped");
        }
        else if (strcmp(dustbinMessage, "READY") == 0) {
          dustbinBusy = false;
          Serial.println("Dustbin ready");
        }

        dustbinIndex = 0;
      }
    }
    else if (dustbinIndex < sizeof(dustbinMessage) - 1) {
      dustbinMessage[dustbinIndex++] = c;
    }
  }
}

void checkBluetooth() {
  bluetooth.listen();

  if (!bluetooth.available()) return;

  char command = bluetooth.read();

  Serial.print("Bluetooth command: ");
  Serial.println(command);

  if (command == 'M' || command == 'm') {
    manualMode = true;
    obstacleDetected = false;
    stopMotors();
    return;
  }

  if (command == 'A' || command == 'a') {
    manualMode = false;
    obstacleDetected = false;
    stopMotors();
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

  Serial.println("UNO 1 - Car Controller Ready");
}

void loop() {
  checkBluetooth();

  if (millis() - lastDustbinCheck >= 20) {
    lastDustbinCheck = millis();
    checkDustbin();
  }

  if (dustbinBusy) {
    stopMotors();
    return;
  }

  if (!manualMode &&
      millis() - lastSensorRead >= 100) {

    lastSensorRead = millis();

    long distance = readDistanceCM();

    Serial.print("Front distance: ");
    Serial.println(distance);

    if (distance <= OBSTACLE_DISTANCE) {
      obstacleDetected = true;
      stopMotors();
      tone(BUZZER, 1500, 150);
    }
    else {
      obstacleDetected = false;
      moveForward();
    }
  }
}

