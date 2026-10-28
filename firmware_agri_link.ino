/*
  AGRI LINK - ESP32 Smart Agriculture Display
  OLED: SSD1306 128x64, software SPI
  Pages rotate every 5 seconds; alerts override normal pages.

  Libraries:
  Adafruit GFX, Adafruit SSD1306, DHT sensor library,
  VL53L0X (Pololu), TinyGPSPlus

  Pins are based on the user's existing wiring.
*/

#include <Wire.h>
#include <SPI.h>
#include <math.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <DHT.h>
#include <VL53L0X.h>
#include <TinyGPS++.h>

// OLED software SPI pins
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_MOSI 23
#define OLED_CLK 18
#define OLED_DC 19
#define OLED_CS 5
#define OLED_RESET 4

Adafruit_SSD1306 display(
  SCREEN_WIDTH, SCREEN_HEIGHT,
  OLED_MOSI, OLED_CLK, OLED_DC,
  OLED_RESET, OLED_CS
);

// Sensor / output pins
#define DHT_PIN 27
#define DHT_TYPE DHT11
#define LDR_PIN 35
#define SOIL_PIN 34
#define GPS_RX 16
#define GPS_TX 17
#define BUZZER_PIN 32
#define TRIG_PIN 12
#define ECHO_PIN 14
#define LED_RED 25
#define LED_BLUE 26
#define LED_GREEN 33

DHT dht(DHT_PIN, DHT_TYPE);
VL53L0X laser;
TinyGPSPlus gps;
HardwareSerial GPS_Serial(2);

// Timing
const unsigned long PAGE_INTERVAL_MS = 5000;
const unsigned long FRAME_INTERVAL_MS = 100;
const unsigned long SENSOR_INTERVAL_MS = 300;
const unsigned long DHT_INTERVAL_MS = 2000;

// Alert thresholds (adjust after testing)
const float ULTRASONIC_NEAR_CM = 10.0;
const uint16_t LASER_NEAR_MM = 200;
const float HIGH_TEMP_C = 40.0;

// Soil alert is disabled by default until the raw sensor is calibrated.
const bool ENABLE_SOIL_ALERT = false;
const int SOIL_DRY_THRESHOLD = 3000;

// Calibrate these using your own dry and wet soil readings.
// Typical capacitive sensors often read lower when wet, but modules vary.
const int SOIL_DRY_RAW = 4095;
const int SOIL_WET_RAW = 1500;

// Live sensor data
float temperatureC = NAN;
float humidityPct = NAN;
float ultrasonicCm = -1.0;
int soilRaw = 0;
int ldrRaw = 0;
uint16_t laserMm = 0;
bool laserReady = false;
bool gpsFix = false;
double latitude = 0.0;
double longitude = 0.0;

// Pages: 0 welcome, 1 temp, 2 humidity, 3 soil, 4 light,
//        5 laser, 6 ultrasonic, 7 GPS, 8 animated farm
const int PAGE_COUNT = 9;
int currentPage = 0;
int animationFrame = 0;
int activeAlert = 0; // 0 none, 1 ultrasonic, 2 laser, 3 temp, 4 soil

unsigned long lastPageChange = 0;
unsigned long lastFrame = 0;
unsigned long lastSensorRead = 0;
unsigned long lastDhtRead = 0;

// ---------- Small drawing helpers ----------
void drawCenteredText(const char *text, int y, uint8_t size) {
  display.setTextSize(size);
  display.setTextColor(SSD1306_WHITE);
  int16_t x1, y1;
  uint16_t w, h;
  display.getTextBounds(text, 0, y, &x1, &y1, &w, &h);
  display.setCursor((SCREEN_WIDTH - (int)w) / 2, y);
  display.print(text);
}

void drawHeader(const char *title) {
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.print(title);
  display.drawLine(0, 10, 127, 10, SSD1306_WHITE);
}

void drawFooter() {
  display.drawLine(0, 56, 127, 56, SSD1306_WHITE);
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 57);
  display.print("AGRI LINK");
  display.setCursor(99, 57);
  display.print(currentPage + 1);
  display.print("/");
  display.print(PAGE_COUNT);
}

void drawSun(int x, int y, int r) {
  display.drawCircle(x, y, r, SSD1306_WHITE);
  for (int i = 0; i < 8; i++) {
    float a = i * 0.785398f;
    int x1 = x + (int)(cosf(a) * (r + 2));
    int y1 = y + (int)(sinf(a) * (r + 2));
    int x2 = x + (int)(cosf(a) * (r + 5));
    int y2 = y + (int)(sinf(a) * (r + 5));
    display.drawLine(x1, y1, x2, y2, SSD1306_WHITE);
  }
}

void drawWaterDrop(int x, int y, int r) {
  display.drawCircle(x, y, r, SSD1306_WHITE);
  display.drawTriangle(x, y-r-4, x-r, y, x+r, y, SSD1306_WHITE);
}

void drawPlant(int x, int groundY, int height) {
  display.drawLine(x, groundY, x, groundY-height, SSD1306_WHITE);
  display.drawLine(x, groundY-height/2, x-5, groundY-height/2-4, SSD1306_WHITE);
  display.drawLine(x, groundY-height+3, x+5, groundY-height+7, SSD1306_WHITE);
}

void drawTree(int x, int groundY) {
  display.drawLine(x, groundY, x, groundY-10, SSD1306_WHITE);
  display.drawCircle(x, groundY-15, 6, SSD1306_WHITE);
  display.drawCircle(x-4, groundY-12, 4, SSD1306_WHITE);
  display.drawCircle(x+4, groundY-12, 4, SSD1306_WHITE);
}

void drawButterfly(int x, int y, bool wingsOpen) {
  if (wingsOpen) {
    display.drawCircle(x-3, y-2, 3, SSD1306_WHITE);
    display.drawCircle(x+3, y-2, 3, SSD1306_WHITE);
  } else {
    display.drawLine(x-4, y-2, x, y, SSD1306_WHITE);
    display.drawLine(x+4, y-2, x, y, SSD1306_WHITE);
  }
  display.drawLine(x, y-2, x, y+3, SSD1306_WHITE);
}

void drawFarmer(int x, int y, bool walkingStep) {
  display.drawCircle(x, y, 3, SSD1306_WHITE); // head
  display.drawLine(x-4, y-3, x+4, y-3, SSD1306_WHITE); // hat
  display.drawLine(x, y+3, x, y+10, SSD1306_WHITE); // body
  if (walkingStep) {
    display.drawLine(x, y+5, x-5, y+7, SSD1306_WHITE);
    display.drawLine(x, y+5, x+5, y+2, SSD1306_WHITE);
    display.drawLine(x, y+10, x-5, y+15, SSD1306_WHITE);
    display.drawLine(x, y+10, x+4, y+13, SSD1306_WHITE);
  } else {
    display.drawLine(x, y+5, x-4, y+8, SSD1306_WHITE);
    display.drawLine(x, y+5, x+4, y+8, SSD1306_WHITE);
    display.drawLine(x, y+10, x-3, y+15, SSD1306_WHITE);
    display.drawLine(x, y+10, x+3, y+15, SSD1306_WHITE);
  }
}

void drawChicken(int x, int y) {
  display.drawCircle(x, y, 4, SSD1306_WHITE);
  display.drawCircle(x+4, y-4, 3, SSD1306_WHITE);
  display.drawLine(x+7, y-4, x+10, y-3, SSD1306_WHITE);
  display.drawLine(x-2, y+4, x-3, y+7, SSD1306_WHITE);
  display.drawLine(x+2, y+4, x+3, y+7, SSD1306_WHITE);
}

void drawCow(int x, int y) {
  display.drawRoundRect(x, y-8, 15, 8, 2, SSD1306_WHITE);
  display.drawCircle(x+17, y-7, 4, SSD1306_WHITE);
  display.drawLine(x+3, y, x+3, y+3, SSD1306_WHITE);
  display.drawLine(x+11, y, x+11, y+3, SSD1306_WHITE);
  display.drawPixel(x+7, y-5, SSD1306_WHITE);
}

// Pseudo-3D perspective crop rows
void drawPerspectiveField() {
  display.drawLine(0, 33, 127, 33, SSD1306_WHITE);
  display.drawLine(0, 55, 48, 33, SSD1306_WHITE);
  display.drawLine(32, 55, 54, 33, SSD1306_WHITE);
  display.drawLine(64, 55, 64, 33, SSD1306_WHITE);
  display.drawLine(96, 55, 74, 33, SSD1306_WHITE);
  display.drawLine(127, 55, 80, 33, SSD1306_WHITE);

  for (int y = 38; y <= 53; y += 5) {
    int halfWidth = map(y, 33, 55, 0, 63);
    display.drawLine(64-halfWidth, y, 64+halfWidth, y, SSD1306_WHITE);
  }
  drawPlant(12, 48, 5);
  drawPlant(28, 51, 6);
  drawPlant(46, 46, 5);
  drawPlant(82, 46, 5);
  drawPlant(100, 51, 6);
  drawPlant(116, 48, 5);
}

// ---------- Read sensors ----------
float readUltrasonicCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  unsigned long duration = pulseIn(ECHO_PIN, HIGH, 25000UL);
  if (duration == 0) return -1.0;
  return duration * 0.0343f / 2.0f;
}

void updateGPS() {
  while (GPS_Serial.available() > 0) {
    gps.encode(GPS_Serial.read());
  }
  gpsFix = gps.location.isValid() && gps.location.age() < 5000;
  if (gpsFix) {
    latitude = gps.location.lat();
    longitude = gps.location.lng();
  }
}

void readSensors() {
  unsigned long now = millis();
  updateGPS();

  if (now - lastSensorRead >= SENSOR_INTERVAL_MS) {
    lastSensorRead = now;
    soilRaw = analogRead(SOIL_PIN);
    ldrRaw = analogRead(LDR_PIN);
    ultrasonicCm = readUltrasonicCm();

    if (laserReady) {
      uint16_t reading = laser.readRangeContinuousMillimeters();
      if (!laser.timeoutOccurred()) laserMm = reading;
      else laserMm = 0;
    }
  }

  if (now - lastDhtRead >= DHT_INTERVAL_MS) {
    lastDhtRead = now;
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    if (!isnan(t)) temperatureC = t;
    if (!isnan(h)) humidityPct = h;
  }
}

int calculateSoilPercent() {
  if (SOIL_DRY_RAW == SOIL_WET_RAW) return 0;
  int p = map(soilRaw, SOIL_DRY_RAW, SOIL_WET_RAW, 0, 100);
  return constrain(p, 0, 100);
}

// ---------- Alert priority ----------
int determineAlert() {
  if (ultrasonicCm > 0 && ultrasonicCm <= ULTRASONIC_NEAR_CM) return 1;
  if (laserReady && laserMm > 0 && laserMm <= LASER_NEAR_MM) return 2;
  if (!isnan(temperatureC) && temperatureC >= HIGH_TEMP_C) return 3;
  if (ENABLE_SOIL_ALERT && soilRaw >= SOIL_DRY_THRESHOLD) return 4;
  return 0;
}

void updateOutputs() {
  digitalWrite(LED_RED, LOW);
  digitalWrite(LED_BLUE, LOW);
  digitalWrite(LED_GREEN, LOW);

  if (activeAlert == 1 || activeAlert == 2) {
    digitalWrite(LED_RED, HIGH);
  } else if (activeAlert == 3 || activeAlert == 4) {
    digitalWrite(LED_BLUE, HIGH);
  } else {
    digitalWrite(LED_GREEN, HIGH);
  }

  static unsigned long lastBuzzerToggle = 0;
  static bool buzzerOn = false;

  if (activeAlert == 0) {
    noTone(BUZZER_PIN);
    buzzerOn = false;
    return;
  }

  unsigned long interval = 150;
  int frequency = 2000;
  if (activeAlert == 2) { interval = 300; frequency = 1600; }
  if (activeAlert == 3) { interval = 500; frequency = 1000; }
  if (activeAlert == 4) { interval = 800; frequency = 700; }

  if (millis() - lastBuzzerToggle >= interval) {
    lastBuzzerToggle = millis();
    buzzerOn = !buzzerOn;
    if (buzzerOn) tone(BUZZER_PIN, frequency);
    else noTone(BUZZER_PIN);
  }
}

// ---------- Individual pages ----------
void pageWelcome() {
  drawCenteredText("WELCOME TO", 3, 1);
  drawCenteredText("AGRI LINK", 15, 2);
  drawSun(108, 20, 5);
  drawFarmer(20 + (animationFrame % 75), 34, animationFrame % 2);
  display.setTextSize(1);
  display.setCursor(79, 39); display.print("SMART");
  display.setCursor(79, 48); display.print("FARMING");
}

void pageTemperature() {
  drawHeader("TEMPERATURE");
  drawSun(20, 29, 7);
  display.setTextSize(2);
  display.setCursor(42, 19);
  if (isnan(temperatureC)) display.print("--.-");
  else display.print(temperatureC, 1);
  display.setTextSize(1); display.print(" C");
  display.setCursor(5, 44); display.print("DHT11 live reading");
  drawFooter();
}

void pageHumidity() {
  drawHeader("AIR HUMIDITY");
  drawWaterDrop(20, 29 + (animationFrame % 3), 5);
  display.setTextSize(2);
  display.setCursor(43, 20);
  if (isnan(humidityPct)) display.print("--");
  else display.print(humidityPct, 0);
  display.print("%");
  display.setTextSize(1);
  display.setCursor(5, 44); display.print("Humidity level");
  drawFooter();
}

void pageSoil() {
  drawHeader("SOIL MOISTURE");
  drawPlant(20, 42, 14);
  display.setTextSize(2);
  display.setCursor(43, 15); display.print(soilRaw);
  display.setTextSize(1);
  display.setCursor(43, 35); display.print("Raw ADC");
  display.setCursor(5, 45);
  display.print("Estimate "); display.print(calculateSoilPercent()); display.print("%");
  drawFooter();
}

void pageLight() {
  drawHeader("LIGHT SENSOR");
  drawSun(20 + (animationFrame % 5), 29, 7);
  display.setTextSize(2);
  display.setCursor(43, 19); display.print(ldrRaw);
  display.setTextSize(1);
  display.setCursor(43, 39); display.print("LDR raw");
  display.setCursor(5, 45);
  if (ldrRaw < 1200) display.print("Low light");
  else if (ldrRaw < 2800) display.print("Medium light");
  else display.print("Bright light");
  drawFooter();
}

void pageLaser() {
  drawHeader("LASER DISTANCE");
  int r = 4 + animationFrame % 9;
  display.drawCircle(20, 30, r, SSD1306_WHITE);
  display.drawLine(20, 30, 30, 20, SSD1306_WHITE);
  display.setTextSize(2);
  display.setCursor(42, 19);
  if (!laserReady || laserMm == 0) display.print("---");
  else display.print(laserMm);
  display.setTextSize(1);
  display.setCursor(42, 40); display.print("Distance mm");
  drawFooter();
}

void pageUltrasonic() {
  drawHeader("ULTRASONIC");
  int r = 5 + animationFrame % 9;
  display.drawCircle(20, 29, 4, SSD1306_WHITE);
  display.drawCircle(20, 29, r, SSD1306_WHITE);
  display.setTextSize(2);
  display.setCursor(42, 19);
  if (ultrasonicCm < 0) display.print("---");
  else display.print(ultrasonicCm, 1);
  display.setTextSize(1);
  display.setCursor(42, 40); display.print("Distance cm");
  drawFooter();
}

void pageGPS() {
  drawHeader("GPS LOCATION");
  display.drawCircle(15, 24, 7, SSD1306_WHITE);
  display.drawTriangle(10, 29, 20, 29, 15, 39, SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(31, 15);
  if (!gpsFix) {
    display.print("Searching...");
    display.setCursor(5, 43); display.print("Try outdoors");
  } else {
    display.print("LAT "); display.print(latitude, 4);
    display.setCursor(31, 29);
    display.print("LON "); display.print(longitude, 4);
  }
  drawFooter();
}

void pageFarm() {
  drawHeader("3D FARM WORLD");
  drawSun(110, 19, 4);
  drawButterfly(8 + (animationFrame * 2) % 108,
                18 + animationFrame % 3,
                animationFrame % 2 == 0);
  drawPerspectiveField();
  drawTree(8, 40);
  drawTree(120, 40);

  int animalX = 14 + animationFrame % 92;
  if (animationFrame % 2 == 0) drawChicken(animalX, 40);
  else drawCow(animalX, 42);

  drawFarmer(35 + animationFrame % 55, 20, animationFrame % 2);
  drawFooter();
}

void pageAlert() {
  if (animationFrame % 2 == 0) {
    display.drawRect(0, 0, 128, 64, SSD1306_WHITE);
    display.drawRect(2, 2, 124, 60, SSD1306_WHITE);
  }
  drawCenteredText("FIELD ALERT!", 5, 1);

  int r = 8 + animationFrame % 5;
  display.drawTriangle(64, 19-r, 64-r, 20+r, 64+r, 20+r, SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(62, 18); display.print("!");

  if (activeAlert == 1) drawCenteredText("OBJECT VERY NEAR", 42, 1);
  if (activeAlert == 2) drawCenteredText("LASER OBJECT NEAR", 42, 1);
  if (activeAlert == 3) drawCenteredText("HIGH TEMPERATURE", 42, 1);
  if (activeAlert == 4) drawCenteredText("CHECK SOIL MOISTURE", 42, 1);
  drawCenteredText("CHECK YOUR FIELD", 54, 1);
}

void renderScreen() {
  display.clearDisplay();
  if (activeAlert != 0) {
    pageAlert();
  } else {
    switch (currentPage) {
      case 0: pageWelcome(); break;
      case 1: pageTemperature(); break;
      case 2: pageHumidity(); break;
      case 3: pageSoil(); break;
      case 4: pageLight(); break;
      case 5: pageLaser(); break;
      case 6: pageUltrasonic(); break;
      case 7: pageGPS(); break;
      case 8: pageFarm(); break;
    }
  }
  display.display();
}

// ---------- Setup ----------
void setup() {
  Serial.begin(115200);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_RED, OUTPUT);
  pinMode(LED_BLUE, OUTPUT);
  pinMode(LED_GREEN, OUTPUT);

  digitalWrite(TRIG_PIN, LOW);
  analogReadResolution(12);

  dht.begin();
  GPS_Serial.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);
  Wire.begin(21, 22);

  if (!display.begin(SSD1306_SWITCHCAPVCC)) {
    Serial.println("OLED initialization failed. Check wiring.");
    while (true) delay(100);
  }

  display.clearDisplay();
  display.display();

  laser.setTimeout(100);
  laserReady = laser.init();
  if (laserReady) {
    laser.startContinuous(100);
    Serial.println("VL53L0X ready");
  } else {
    Serial.println("VL53L0X not detected; other pages will continue");
  }

  // Startup welcome animation
  for (int i = 0; i < 12; i++) {
    display.clearDisplay();
    drawCenteredText("AGRI LINK", 10, 2);
    drawCenteredText("SMART AGRICULTURE", 34, 1);
    drawFarmer(15 + i * 8, 20, i % 2);
    display.display();
    delay(100);
  }

  lastPageChange = millis();
  lastFrame = millis();
}

// ---------- Main loop ----------
void loop() {
  unsigned long now = millis();

  readSensors();
  activeAlert = determineAlert();
  updateOutputs();

  // Advance pages every 5 seconds when no alert is active.
  if (activeAlert == 0 && now - lastPageChange >= PAGE_INTERVAL_MS) {
    lastPageChange = now;
    currentPage = (currentPage + 1) % PAGE_COUNT;
  }

  // Animate at about 10 frames per second.
  if (now - lastFrame >= FRAME_INTERVAL_MS) {
    lastFrame = now;
    animationFrame++;
    renderScreen();
  }
}

