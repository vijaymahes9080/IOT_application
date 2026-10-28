/*
  AGRI LINK - ESP32 Smart Agriculture Master Display Firmware
  OLED: SSD1306 128x64, Software SPI
  Engine: Zero-Memory 25 FPS Cubic Ease-Out Sliding Carousel
  Graphics: PROGMEM 1-Bit Agro-Tech Iconography & Linear Progress Gauges
  Alerts: Instant Preemption Hazard Cards & Acoustic Chimes

  Pins are based strictly on existing hardware wiring.
*/

#include <Wire.h>
#include <SPI.h>
#include <math.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <DHT.h>
#include <VL53L0X.h>
#include <TinyGPS++.h>

// ---------- OLED Software SPI Pin Definitions ----------
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

// ---------- Sensor & Actuator Pin Definitions ----------
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

// ---------- Timing & Animation Constants ----------
const unsigned long PAGE_INTERVAL_MS = 5000;       // Dwell time per page
const unsigned long FRAME_INTERVAL_MS = 40;         // 25 FPS render rate
const unsigned long SENSOR_INTERVAL_MS = 300;       // Sensor acquisition
const unsigned long DHT_INTERVAL_MS = 2000;         // DHT11 acquisition
const unsigned long TELEMETRY_INTERVAL_MS = 500;    // Serial JSON telemetry
const unsigned long TRANSITION_DURATION_MS = 300;   // Carousel slide duration

// ---------- Alert Thresholds ----------
const float ULTRASONIC_NEAR_CM = 10.0f;
const uint16_t LASER_NEAR_MM = 200;
const float HIGH_TEMP_C = 40.0f;
const bool ENABLE_SOIL_ALERT = false;
const int SOIL_DRY_THRESHOLD = 3000;
const int SOIL_DRY_RAW = 4095;
const int SOIL_WET_RAW = 1500;

// ---------- Live Sensor Readings ----------
float temperatureC = NAN;
float humidityPct = NAN;
float ultrasonicCm = -1.0f;
int soilRaw = 0;
int ldrRaw = 0;
uint16_t laserMm = 0;
bool laserReady = false;
bool gpsFix = false;
double latitude = 0.0;
double longitude = 0.0;

// ---------- Carousel & Alert State ----------
const int PAGE_COUNT = 9;
uint8_t currentPage = 0;
uint32_t animationFrame = 0;
int activeAlert = 0; // 0: None, 1: Ultrasonic, 2: Laser, 3: Temp, 4: Soil

unsigned long lastPageChange = 0;
unsigned long lastFrame = 0;
unsigned long lastSensorRead = 0;
unsigned long lastDhtRead = 0;
unsigned long lastTelemetrySend = 0;

// Carousel Transition State Machine
bool isTransitioning = false;
uint8_t transitionFromPage = 0;
uint8_t transitionToPage = 0;
unsigned long transitionStartTime = 0;

// Serial Command Buffer
String serialCommandBuffer = "";

// ============================================================================
// PROGMEM 16x16 1-Bit Pixel-Art Iconography
// ============================================================================

// Shield Sprout (Page 0 Logo)
const uint8_t PROGMEM bmp_shield_sprout[32] = {
  0x1F, 0xF8, 0x30, 0x0C, 0x62, 0x46, 0x47, 0xE2,
  0x4F, 0xF2, 0x47, 0xE2, 0x41, 0x82, 0x41, 0x82,
  0x41, 0x82, 0x47, 0xE2, 0x4F, 0xF2, 0x20, 0x04,
  0x30, 0x0C, 0x18, 0x18, 0x0C, 0x30, 0x07, 0xE0
};

// Thermometer (Page 1)
const uint8_t PROGMEM bmp_thermometer[32] = {
  0x07, 0xC0, 0x08, 0x20, 0x0B, 0x20, 0x08, 0x20,
  0x0B, 0x20, 0x08, 0x20, 0x0B, 0xA0, 0x09, 0xA0,
  0x0B, 0xA0, 0x09, 0xA0, 0x19, 0x98, 0x3F, 0xFC,
  0x3F, 0xFC, 0x3F, 0xFC, 0x1F, 0xF8, 0x07, 0xC0
};

// Water Droplet (Page 2)
const uint8_t PROGMEM bmp_droplet[32] = {
  0x01, 0x80, 0x03, 0xC0, 0x03, 0xC0, 0x07, 0xE0,
  0x07, 0xE0, 0x0D, 0xF0, 0x19, 0xF8, 0x1B, 0xF8,
  0x3F, 0xFC, 0x3F, 0xFC, 0x7F, 0xFE, 0x7F, 0xFE,
  0x7F, 0xFE, 0x3F, 0xFC, 0x1F, 0xF8, 0x07, 0xE0
};

// Sprout Soil (Page 3)
const uint8_t PROGMEM bmp_sprout_soil[32] = {
  0x0C, 0x30, 0x1E, 0x78, 0x3F, 0xFC, 0x7F, 0xFE,
  0x7D, 0xBE, 0x39, 0x9C, 0x01, 0x80, 0x01, 0x80,
  0x01, 0x80, 0x01, 0x80, 0x3F, 0xFC, 0x7F, 0xFE,
  0xD6, 0xD7, 0xFF, 0xFF, 0x6D, 0xB6, 0x26, 0x64
};

// Radiant Sun (Page 4)
const uint8_t PROGMEM bmp_sun[32] = {
  0x01, 0x80, 0x41, 0x82, 0x20, 0x04, 0x1F, 0xF8,
  0x3F, 0xFC, 0x3F, 0xFC, 0x7F, 0xFE, 0xFF, 0xFF,
  0xFF, 0xFF, 0x7F, 0xFE, 0x3F, 0xFC, 0x3F, 0xFC,
  0x1F, 0xF8, 0x20, 0x04, 0x41, 0x82, 0x01, 0x80
};

// Laser Reticle (Page 5)
const uint8_t PROGMEM bmp_laser_reticle[32] = {
  0x01, 0x80, 0x01, 0x80, 0x0F, 0xF0, 0x19, 0x98,
  0x31, 0x8C, 0x20, 0x04, 0x67, 0xE6, 0xC7, 0xE3,
  0xC7, 0xE3, 0x67, 0xE6, 0x20, 0x04, 0x31, 0x8C,
  0x19, 0x98, 0x0F, 0xF0, 0x01, 0x80, 0x01, 0x80
};

// Ultrasonic Waves (Page 6)
const uint8_t PROGMEM bmp_ultrasonic_waves[32] = {
  0x00, 0x03, 0x00, 0x0D, 0x38, 0x31, 0x7C, 0x41,
  0x6E, 0xC1, 0x67, 0x01, 0x63, 0x40, 0x63, 0xC0,
  0x63, 0xC0, 0x63, 0x40, 0x67, 0x01, 0x6E, 0xC1,
  0x7C, 0x41, 0x38, 0x31, 0x00, 0x0D, 0x00, 0x03
};

// GPS Satellite (Page 7)
const uint8_t PROGMEM bmp_gps_satellite[32] = {
  0x00, 0x70, 0x00, 0xF8, 0x01, 0xD8, 0x03, 0xD8,
  0x07, 0xF8, 0x0F, 0x70, 0x1E, 0x00, 0x3C, 0x06,
  0x78, 0x0C, 0xF0, 0x18, 0x70, 0x30, 0x30, 0x60,
  0x1E, 0xC0, 0x0F, 0x80, 0x07, 0x00, 0x03, 0x00
};

// Hazard Icons (Alert Overlays)
const uint8_t PROGMEM icon_hazard_barrier[32] = {
  0x01, 0x80, 0x03, 0xC0, 0x07, 0xE0, 0x0F, 0xF0,
  0x1E, 0x78, 0x3C, 0x3C, 0x78, 0x1E, 0x70, 0x0E,
  0x70, 0x0E, 0x78, 0x1E, 0x3C, 0x3C, 0x1E, 0x78,
  0x0F, 0xF0, 0x07, 0xE0, 0x03, 0xC0, 0x01, 0x80
};

const uint8_t PROGMEM icon_hazard_laser[32] = {
  0x01, 0x80, 0x01, 0x80, 0x00, 0x00, 0x3F, 0xFC,
  0x20, 0x04, 0x27, 0xE4, 0x24, 0x24, 0x24, 0x24,
  0x24, 0x24, 0x27, 0xE4, 0x20, 0x04, 0x3F, 0xFC,
  0x00, 0x00, 0x01, 0x80, 0x01, 0x80, 0x00, 0x00
};

const uint8_t PROGMEM icon_hazard_flame[32] = {
  0x01, 0x00, 0x03, 0x80, 0x07, 0xC0, 0x0E, 0xE0,
  0x1C, 0x70, 0x38, 0x38, 0x30, 0x18, 0x73, 0x9C,
  0x67, 0xCE, 0x6F, 0xEE, 0x7F, 0xFE, 0x3F, 0xFC,
  0x3F, 0xFC, 0x1F, 0xF8, 0x0F, 0xF0, 0x03, 0xC0
};

const uint8_t PROGMEM icon_hazard_drought[32] = {
  0x01, 0x80, 0x03, 0xC0, 0x07, 0xE0, 0x0F, 0xF0,
  0x1F, 0xF8, 0x3B, 0xDC, 0x71, 0x8E, 0x60, 0x06,
  0x60, 0x06, 0x71, 0x8E, 0x3B, 0xDC, 0x1F, 0xF8,
  0x0F, 0xF0, 0x07, 0xE0, 0x03, 0xC0, 0x01, 0x80
};

// Mini Status Icons
const uint8_t PROGMEM icon_mini_bell_5x5[5] = { 0x20, 0x70, 0x70, 0xF8, 0x20 };

// ============================================================================
// UI Primitives & High-Craft Rendering Helpers
// ============================================================================

void drawDegreeSymbol(int16_t x, int16_t y) {
  display.drawCircle(x + 1, y + 1, 1, SSD1306_WHITE);
}

void drawStatusPill(int16_t x, int16_t y, const char *text, bool inverted = false) {
  if (!text) return;
  int16_t len = (int16_t)strlen(text);
  int16_t w = len * 6 + 6;
  int16_t h = 10;

  if (inverted) {
    display.fillRoundRect(x, y, w, h, 2, SSD1306_WHITE);
    display.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
  } else {
    display.fillRoundRect(x, y, w, h, 2, SSD1306_BLACK);
    display.drawRoundRect(x, y, w, h, 2, SSD1306_WHITE);
    display.setTextColor(SSD1306_WHITE);
  }
  display.setTextSize(1);
  display.setCursor(x + 3, y + 1);
  display.print(text);
  display.setTextColor(SSD1306_WHITE);
}

void drawProgressBar(int16_t x, int16_t y, int16_t w, int16_t h, int16_t percent, int16_t thresholdMark = -1) {
  if (w <= 4 || h <= 3) return;
  display.drawRoundRect(x, y, w, h, 2, SSD1306_WHITE);
  display.fillRect(x + 1, y + 1, w - 2, h - 2, SSD1306_BLACK);

  int16_t innerW = w - 4;
  int16_t innerH = h - 4;
  int16_t clamped = constrain(percent, 0, 100);
  int16_t fillW = (int16_t)(((int32_t)clamped * innerW) / 100);

  if (fillW > 0) {
    display.fillRect(x + 2, y + 2, fillW, innerH, SSD1306_WHITE);
  }

  if (thresholdMark >= 0 && thresholdMark <= 100) {
    int16_t tx = x + 2 + (int16_t)(((int32_t)thresholdMark * (innerW - 1)) / 100);
    display.drawPixel(tx, y - 1, SSD1306_WHITE);
    display.drawPixel(tx, y + h, SSD1306_WHITE);
    if (thresholdMark <= clamped) {
      display.drawFastVLine(tx, y + 2, innerH, SSD1306_BLACK);
    } else {
      display.drawFastVLine(tx, y + 2, innerH, SSD1306_WHITE);
    }
  }
}

void drawHeader(const char* category, const char* title) {
  if (category && strlen(category) > 0) {
    display.fillRoundRect(0, 0, 24, 10, 2, SSD1306_WHITE);
    display.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(3, 1);
    display.print(category);
  }
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(28, 1);
  if (title) display.print(title);

  if (activeAlert != 0) {
    display.drawBitmap(104, 2, icon_mini_bell_5x5, 5, 5, SSD1306_WHITE);
  }
  display.drawFastHLine(0, 11, 128, SSD1306_WHITE);
}

void drawFooter(uint8_t pageIdx, uint8_t pageCount, uint32_t dwellMs) {
  display.drawFastHLine(0, 53, 128, SSD1306_WHITE);

  // 9-dot pagination track (x = 3..43)
  int16_t dotSpacing = 5;
  for (uint8_t i = 0; i < pageCount; i++) {
    int16_t dx = 3 + i * dotSpacing;
    if (i == pageIdx) {
      display.fillRect(dx, 57, 3, 3, SSD1306_WHITE);
    } else {
      display.drawPixel(dx + 1, 58, SSD1306_WHITE);
    }
  }

  // 5s page dwell progress line (x = 48..84)
  int16_t barW = 36;
  int16_t fillW = (int16_t)constrain((dwellMs * barW) / PAGE_INTERVAL_MS, 0, barW);
  display.drawFastHLine(48, 58, barW, SSD1306_WHITE);
  display.fillRect(48, 57, fillW, 3, SSD1306_WHITE);

  // Numerical page fraction (x = 90..127)
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(90, 56);
  display.print(pageIdx + 1);
  display.print("/");
  display.print(pageCount);
}

void drawHeaderForPage(uint8_t pageIndex) {
  switch (pageIndex % PAGE_COUNT) {
    case 0: drawHeader("SYS", "AGRI-LINK"); break;
    case 1: drawHeader("TMP", "TEMPERATURE"); break;
    case 2: drawHeader("HUM", "AIR HUMIDITY"); break;
    case 3: drawHeader("SOL", "SOIL MOISTURE"); break;
    case 4: drawHeader("LGT", "LIGHT SENSOR"); break;
    case 5: drawHeader("LSR", "LASER DISTANCE"); break;
    case 6: drawHeader("ULT", "ULTRASONIC"); break;
    case 7: drawHeader("GPS", "GPS TELEMETRY"); break;
    case 8: drawHeader("HUD", "FARM OVERVIEW"); break;
  }
}

// ============================================================================
// Redesigned Offset-Aware Display Pages (y = 12..52)
// ============================================================================

// Page 0: Agro-Tech Welcome & System Diagnostics
void page0(int16_t xOffset) {
  display.drawBitmap(6 + xOffset, 14, bmp_shield_sprout, 16, 16, SSD1306_WHITE);
  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(28 + xOffset, 14);
  display.print("AGRI LINK");

  display.setTextSize(1);
  display.setCursor(28 + xOffset, 30);
  display.print("SMART TELEMETRY");

  display.drawFastHLine(6 + xOffset, 40, 116, SSD1306_WHITE);

  display.setCursor(6 + xOffset, 43);
  display.print("DHT:");
  display.print(isnan(temperatureC) ? "--" : "OK");

  display.setCursor(48 + xOffset, 43);
  display.print("LSR:");
  display.print(laserReady ? "OK" : "--");

  display.setCursor(90 + xOffset, 43);
  display.print("GPS:");
  display.print(gpsFix ? "3D" : "ACQ");
}

// Page 1: Temperature Page
void page1(int16_t xOffset) {
  display.drawBitmap(6 + xOffset, 14, bmp_thermometer, 16, 16, SSD1306_WHITE);
  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(28 + xOffset, 14);
  if (isnan(temperatureC)) display.print("--.-");
  else display.print(temperatureC, 1);

  drawDegreeSymbol(88 + xOffset, 14);
  display.setTextSize(1);
  display.setCursor(94 + xOffset, 14);
  display.print("C");

  const char *statusStr = "OPTIMAL";
  bool isCrit = false;
  if (isnan(temperatureC)) { statusStr = "ERR"; isCrit = true; }
  else if (temperatureC >= HIGH_TEMP_C) { statusStr = "CRITICAL"; isCrit = true; }
  else if (temperatureC >= 32.0f) statusStr = "ELEVATED";
  else if (temperatureC < 18.0f) statusStr = "COLD";
  drawStatusPill(28 + xOffset, 31, statusStr, isCrit);

  int16_t pct = isnan(temperatureC) ? 0 : (int16_t)constrain(temperatureC * 2.0f, 0, 100);
  drawProgressBar(6 + xOffset, 43, 116, 6, pct, 80);
}

// Page 2: Humidity Page
void page2(int16_t xOffset) {
  display.drawBitmap(6 + xOffset, 14, bmp_droplet, 16, 16, SSD1306_WHITE);
  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(28 + xOffset, 14);
  if (isnan(humidityPct)) display.print("--");
  else display.print((int)round(humidityPct));
  display.setTextSize(1);
  display.setCursor(68 + xOffset, 14);
  display.print("% RH");

  const char *humStr = "TARGET RH";
  bool isErr = false;
  if (isnan(humidityPct)) { humStr = "ERR"; isErr = true; }
  else if (humidityPct < 40.0f) humStr = "DRY AIR";
  else if (humidityPct > 70.0f) humStr = "SATURATED";
  drawStatusPill(28 + xOffset, 31, humStr, isErr);

  int16_t pct = isnan(humidityPct) ? 0 : (int16_t)constrain(humidityPct, 0, 100);
  drawProgressBar(6 + xOffset, 43, 116, 6, pct, -1);

  int16_t x1 = 6 + 2 + (112 * 50) / 100 + xOffset;
  int16_t x2 = 6 + 2 + (112 * 70) / 100 + xOffset;
  display.drawFastVLine(x1, 41, 3, SSD1306_WHITE);
  display.drawFastVLine(x1, 48, 3, SSD1306_WHITE);
  display.drawFastVLine(x2, 41, 3, SSD1306_WHITE);
  display.drawFastVLine(x2, 48, 3, SSD1306_WHITE);
}

int calculateSoilPercent() {
  if (SOIL_DRY_RAW == SOIL_WET_RAW) return 0;
  int p = map(soilRaw, SOIL_DRY_RAW, SOIL_WET_RAW, 0, 100);
  return constrain(p, 0, 100);
}

// Page 3: Soil Moisture Page
void page3(int16_t xOffset) {
  display.drawBitmap(6 + xOffset, 14, bmp_sprout_soil, 16, 16, SSD1306_WHITE);
  int soilPct = calculateSoilPercent();

  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(28 + xOffset, 14);
  display.print(soilPct);
  display.setTextSize(1);
  display.print("%");

  char adcBuf[10];
  snprintf(adcBuf, sizeof(adcBuf), "A:%04d", soilRaw);
  drawStatusPill(76 + xOffset, 16, adcBuf, false);

  const char *soilStatus = "HYDRATED";
  bool isWarn = false;
  if (ENABLE_SOIL_ALERT && soilRaw >= SOIL_DRY_THRESHOLD) { soilStatus = "DROUGHT"; isWarn = true; }
  else if (soilPct < 30) soilStatus = "DRY SOIL";
  else if (soilPct > 75) soilStatus = "SATURATED";
  drawStatusPill(28 + xOffset, 31, soilStatus, isWarn);

  drawProgressBar(6 + xOffset, 43, 116, 6, soilPct, 42);
}

// Page 4: Light / Solar Page
void page4(int16_t xOffset) {
  display.drawBitmap(6 + xOffset, 14, bmp_sun, 16, 16, SSD1306_WHITE);
  int lightPct = constrain(map(ldrRaw, 0, 4095, 0, 100), 0, 100);

  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(28 + xOffset, 14);
  display.print(lightPct);
  display.setTextSize(1);
  display.print("%");

  char ldrBuf[10];
  snprintf(ldrBuf, sizeof(ldrBuf), "L:%04d", ldrRaw);
  drawStatusPill(76 + xOffset, 16, ldrBuf, false);

  const char *lightStatus = "AMBIENT";
  if (ldrRaw < 1200) lightStatus = "LOW LIGHT";
  else if (ldrRaw > 2800) lightStatus = "BRIGHT SUN";
  drawStatusPill(28 + xOffset, 31, lightStatus, false);

  // 10-Step Segmented Ladder Meter
  int startX = 10 + xOffset;
  int activeSegs = map(lightPct, 0, 100, 0, 10);
  for (int i = 0; i < 10; i++) {
    int16_t segX = startX + i * 11;
    if (i < activeSegs) display.fillRect(segX, 43, 9, 6, SSD1306_WHITE);
    else display.drawRect(segX, 43, 9, 6, SSD1306_WHITE);
  }
}

// Page 5: Laser Distance Page
void page5(int16_t xOffset) {
  display.drawBitmap(6 + xOffset, 14, bmp_laser_reticle, 16, 16, SSD1306_WHITE);
  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(28 + xOffset, 14);

  if (!laserReady || laserMm == 0) {
    display.print("---");
  } else if (laserMm >= 1000) {
    display.print(laserMm / 1000.0f, 2);
    display.setTextSize(1);
    display.setCursor(84 + xOffset, 18);
    display.print("m");
  } else {
    display.print(laserMm);
    display.setTextSize(1);
    display.setCursor(84 + xOffset, 18);
    display.print("mm");
  }

  const char *lsrStatus = "TARGET LOCK";
  bool isHazard = false;
  if (!laserReady) { lsrStatus = "OFFLINE"; isHazard = true; }
  else if (laserMm > 0 && laserMm <= LASER_NEAR_MM) { lsrStatus = "NEAR HAZARD"; isHazard = true; }
  drawStatusPill(28 + xOffset, 31, lsrStatus, isHazard);

  int16_t lsrPct = (!laserReady || laserMm == 0) ? 0 : (int16_t)constrain(map(laserMm, 0, 1200, 0, 100), 0, 100);
  drawProgressBar(6 + xOffset, 43, 116, 6, lsrPct, 16);
}

// Page 6: Ultrasonic Distance Page
void page6(int16_t xOffset) {
  display.drawBitmap(6 + xOffset, 14, bmp_ultrasonic_waves, 16, 16, SSD1306_WHITE);
  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(28 + xOffset, 14);

  if (ultrasonicCm < 0) {
    display.print("---");
  } else {
    display.print(ultrasonicCm, 1);
    display.setTextSize(1);
    display.setCursor(90 + xOffset, 18);
    display.print("cm");
  }

  const char *ultStatus = "CLEAR PATH";
  bool isNear = false;
  if (ultrasonicCm < 0) ultStatus = "NO ECHO";
  else if (ultrasonicCm <= ULTRASONIC_NEAR_CM) { ultStatus = "OBSTACLE!"; isNear = true; }
  else if (ultrasonicCm <= 30.0f) ultStatus = "PROXIMITY";
  drawStatusPill(28 + xOffset, 31, ultStatus, isNear);

  float d = constrain(ultrasonicCm, 0.0f, 50.0f);
  int16_t dangerPct = (ultrasonicCm < 0) ? 0 : (int16_t)((50.0f - d) * 2.0f);
  drawProgressBar(6 + xOffset, 43, 116, 6, dangerPct, 80);
}

// Page 7: GPS Telemetry Page
void page7(int16_t xOffset) {
  if (!gpsFix) {
    // Mode A: Radar Sweep Scanner
    display.drawCircle(22 + xOffset, 30, 11, SSD1306_WHITE);
    display.drawCircle(22 + xOffset, 30, 6, SSD1306_WHITE);
    display.drawFastHLine(22 + xOffset - 11, 30, 22, SSD1306_WHITE);
    display.drawFastVLine(22 + xOffset, 30 - 11, 22, SSD1306_WHITE);

    float angle = (animationFrame % 12) * (3.14159f / 6.0f);
    int16_t rx = (int16_t)(cosf(angle) * 11.0f);
    int16_t ry = (int16_t)(sinf(angle) * 11.0f);
    display.drawLine(22 + xOffset, 30, 22 + xOffset + rx, 30 + ry, SSD1306_WHITE);

    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(40 + xOffset, 16);
    display.print("ACQUIRING...");
    display.setCursor(40 + xOffset, 28);
    display.print("SATS: ");
    display.print(gps.satellites.isValid() ? gps.satellites.value() : 0);
    display.setCursor(40 + xOffset, 40);
    display.print("NMEA: ");
    display.print(gps.charsProcessed() % 10000);
  } else {
    // Mode B: High Precision GPS Coordinates
    display.drawBitmap(6 + xOffset, 14, bmp_gps_satellite, 16, 16, SSD1306_WHITE);
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);

    display.setCursor(28 + xOffset, 14);
    display.print("LAT: ");
    display.print(latitude, 4);
    display.print(latitude >= 0 ? " N" : " S");

    display.setCursor(28 + xOffset, 26);
    display.print("LON: ");
    display.print(longitude, 4);
    display.print(longitude >= 0 ? " E" : " W");

    char gpsBuf[24];
    snprintf(gpsBuf, sizeof(gpsBuf), "SATS:%d FIX:3D", gps.satellites.value());
    drawStatusPill(6 + xOffset, 39, gpsBuf, false);
  }
}

// Page 8: Farm Overview HUD (Landscape banner & 4-Quadrant Card)
void page8(int16_t xOffset) {
  display.drawFastHLine(6 + xOffset, 21, 116, SSD1306_WHITE);

  // Silky Smooth Floating Cloud Sprite
  int16_t cloudX = ((animationFrame / 2) % 150) - 20 + xOffset;
  display.fillRect(cloudX, 14, 10, 3, SSD1306_WHITE);
  display.fillRect(cloudX + 2, 13, 6, 1, SSD1306_WHITE);

  // Stationary Tree
  display.drawPixel(8 + xOffset, 17, SSD1306_WHITE);
  display.drawPixel(9 + xOffset, 16, SSD1306_WHITE);
  display.drawPixel(10 + xOffset, 17, SSD1306_WHITE);
  display.drawFastVLine(9 + xOffset, 18, 3, SSD1306_WHITE);

  // 4-Quadrant Card
  display.drawRoundRect(6 + xOffset, 23, 116, 29, 2, SSD1306_WHITE);
  display.drawFastVLine(64 + xOffset, 23, 29, SSD1306_WHITE);
  display.drawFastHLine(6 + xOffset, 37, 116, SSD1306_WHITE);

  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  display.setCursor(10 + xOffset, 26);
  display.print("T:");
  if (isnan(temperatureC)) display.print("--");
  else { display.print((int)temperatureC); display.print("C"); }

  display.setCursor(68 + xOffset, 26);
  display.print("H:");
  if (isnan(humidityPct)) display.print("--");
  else { display.print((int)humidityPct); display.print("%"); }

  display.setCursor(10 + xOffset, 40);
  display.print("S:");
  display.print(calculateSoilPercent());
  display.print("%");

  display.setCursor(68 + xOffset, 40);
  display.print("L:");
  display.print(constrain(map(ldrRaw, 0, 4095, 0, 100), 0, 100));
  display.print("%");
}

void renderPage(uint8_t index, int16_t xOffset) {
  switch (index % PAGE_COUNT) {
    case 0: page0(xOffset); break;
    case 1: page1(xOffset); break;
    case 2: page2(xOffset); break;
    case 3: page3(xOffset); break;
    case 4: page4(xOffset); break;
    case 5: page5(xOffset); break;
    case 6: page6(xOffset); break;
    case 7: page7(xOffset); break;
    case 8: page8(xOffset); break;
  }
}

// ============================================================================
// Pro-Level Emergency Alert Screen Overhaul
// ============================================================================

void pageAlert() {
  // Inverted Hazard Header
  display.fillRect(0, 0, 128, 12, SSD1306_WHITE);
  display.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(8, 2);
  display.print("! CRITICAL ALERT !");
  display.setTextColor(SSD1306_WHITE);

  // Breathing Corner Chevrons (1.5 Hz breathing)
  uint8_t breathe = (animationFrame / 8) % 4;
  int16_t armLen = 4 + breathe;
  display.drawFastHLine(0, 14, armLen, SSD1306_WHITE);
  display.drawFastVLine(0, 14, armLen, SSD1306_WHITE);
  display.drawFastHLine(128 - armLen, 14, armLen, SSD1306_WHITE);
  display.drawFastVLine(127, 14, armLen, SSD1306_WHITE);
  display.drawFastHLine(0, 63, armLen, SSD1306_WHITE);
  display.drawFastVLine(0, 64 - armLen, armLen, SSD1306_WHITE);
  display.drawFastHLine(128 - armLen, 63, armLen, SSD1306_WHITE);
  display.drawFastVLine(127, 64 - armLen, armLen, SSD1306_WHITE);

  // Telemetry Card Container
  display.drawRoundRect(6, 16, 116, 32, 3, SSD1306_WHITE);

  switch (activeAlert) {
    case 1: { // Ultrasonic Proximity Hazard
      display.drawBitmap(8, 24, icon_hazard_barrier, 16, 16, SSD1306_WHITE);
      display.setTextSize(2);
      display.setCursor(28, 20);
      if (ultrasonicCm > 0) { display.print(ultrasonicCm, 1); display.setTextSize(1); display.print("cm"); }
      else display.print("---");
      display.setTextSize(1);
      display.setCursor(28, 37);
      display.print("MIN: 10.0cm NEAR!");
      break;
    }
    case 2: { // Laser Proximity Hazard
      display.drawBitmap(8, 24, icon_hazard_laser, 16, 16, SSD1306_WHITE);
      display.setTextSize(2);
      display.setCursor(28, 20);
      if (laserReady && laserMm > 0) { display.print(laserMm); display.setTextSize(1); display.print("mm"); }
      else display.print("---");
      display.setTextSize(1);
      display.setCursor(28, 37);
      display.print("MIN: 200mm TRIP!");
      break;
    }
    case 3: { // High Temperature Hazard
      display.drawBitmap(8, 24, icon_hazard_flame, 16, 16, SSD1306_WHITE);
      display.setTextSize(2);
      display.setCursor(28, 20);
      if (!isnan(temperatureC)) {
        display.print(temperatureC, 1);
        drawDegreeSymbol(84, 21);
        display.setTextSize(1);
        display.setCursor(89, 20);
        display.print("C");
      } else display.print("---");
      display.setTextSize(1);
      display.setCursor(28, 37);
      display.print("MAX: 40.0C HOT!");
      break;
    }
    case 4: { // Soil Drought Hazard
      display.drawBitmap(8, 24, icon_hazard_drought, 16, 16, SSD1306_WHITE);
      display.setTextSize(2);
      display.setCursor(28, 20);
      display.print(calculateSoilPercent());
      display.setTextSize(1);
      display.print("%");
      display.setCursor(28, 37);
      display.print("RAW: ");
      display.print(soilRaw);
      display.print(" DRY!");
      break;
    }
  }

  // Action Recommendation Footer
  display.setTextSize(1);
  display.setCursor(6, 51);
  switch (activeAlert) {
    case 1: display.print("ACTION: CLEAR OBSTACLE"); break;
    case 2: display.print("ACTION: CHECK PERIMETER"); break;
    case 3: display.print("ACTION: VENTILATE FIELD"); break;
    case 4: display.print("ACTION: IRRIGATE CROPS"); break;
    default: display.print("ACTION: INSPECT SENSORS"); break;
  }
}

// ============================================================================
// Master Zero-Memory Sliding Carousel & 25 FPS Screen Renderer
// ============================================================================

float cubicEaseOut(float t) {
  if (t <= 0.0f) return 0.0f;
  if (t >= 1.0f) return 1.0f;
  float u = 1.0f - t;
  return 1.0f - (u * u * u);
}

void renderScreen() {
  display.clearDisplay();

  if (activeAlert != 0) {
    isTransitioning = false;
    pageAlert();
  } else if (isTransitioning) {
    unsigned long elapsed = millis() - transitionStartTime;
    if (elapsed >= TRANSITION_DURATION_MS) {
      isTransitioning = false;
      currentPage = transitionToPage;
      lastPageChange = millis();

      renderPage(currentPage, 0);
      drawHeaderForPage(currentPage);
      drawFooter(currentPage, PAGE_COUNT, 0);
    } else {
      float t = (float)elapsed / (float)TRANSITION_DURATION_MS;
      float ease = cubicEaseOut(t);
      int16_t offset = (int16_t)roundf(ease * 128.0f);

      // Draw outgoing card sliding left
      renderPage(transitionFromPage, -offset);
      // Draw incoming card sliding in from right
      renderPage(transitionToPage, 128 - offset);

      // Mask header and footer bands (guarantees zero card bleed)
      display.fillRect(0, 0, 128, 12, SSD1306_BLACK);
      display.fillRect(0, 53, 128, 11, SSD1306_BLACK);

      // Draw anchored stationary header and footer
      drawHeaderForPage(transitionToPage);
      uint32_t dwellMs = millis() - lastPageChange;
      drawFooter(currentPage, PAGE_COUNT, dwellMs);
    }
  } else {
    renderPage(currentPage, 0);
    drawHeaderForPage(currentPage);
    uint32_t dwellMs = millis() - lastPageChange;
    drawFooter(currentPage, PAGE_COUNT, dwellMs);
  }

  display.display();
}

// ============================================================================
// Sensor Acquisition, Alert Priority & Serial Telemetry Bridge
// ============================================================================

float readUltrasonicCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  // Optimized timeout: 15,000 µs (max 257 cm) guarantees zero 40ms frame starvation
  unsigned long duration = pulseIn(ECHO_PIN, HIGH, 15000UL);
  if (duration == 0) return -1.0f;
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

int determineAlert() {
  if (ultrasonicCm > 0.0f && ultrasonicCm <= ULTRASONIC_NEAR_CM) return 1;
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

void sendTelemetryPacket() {
  int soilPct = calculateSoilPercent();
  Serial.print("{\"temp\":");
  if (isnan(temperatureC)) Serial.print("null"); else Serial.print(temperatureC, 1);
  Serial.print(",\"hum\":");
  if (isnan(humidityPct)) Serial.print("null"); else Serial.print(humidityPct, 1);
  Serial.print(",\"soil_pct\":"); Serial.print(soilPct);
  Serial.print(",\"soil_raw\":"); Serial.print(soilRaw);
  Serial.print(",\"ldr\":"); Serial.print(ldrRaw);
  Serial.print(",\"ultra_cm\":"); Serial.print(ultrasonicCm, 1);
  Serial.print(",\"laser_mm\":"); Serial.print(laserMm);
  Serial.print(",\"gps_fix\":"); Serial.print(gpsFix ? 1 : 0);
  Serial.print(",\"lat\":"); Serial.print(latitude, 6);
  Serial.print(",\"lon\":"); Serial.print(longitude, 6);
  Serial.print(",\"alert\":"); Serial.print(activeAlert);
  Serial.println("}");
}

void playBuzzerPattern(int patternType) {
  if (patternType == 1) {
    tone(BUZZER_PIN, 1800, 70); delay(90);
    tone(BUZZER_PIN, 2400, 100);
  } else if (patternType == 2) {
    tone(BUZZER_PIN, 2800, 150);
  } else if (patternType == 3) {
    tone(BUZZER_PIN, 1318, 60); delay(70);
    tone(BUZZER_PIN, 1567, 60); delay(70);
    tone(BUZZER_PIN, 2093, 100);
  }
}

void processIncomingSerialCommands() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      serialCommandBuffer.trim();
      if (serialCommandBuffer.length() > 0) {
        if (serialCommandBuffer == "CMD:CHIME" || serialCommandBuffer == "CMD:SPEAK") {
          playBuzzerPattern(1);
        } else if (serialCommandBuffer == "CMD:VOICE_START") {
          playBuzzerPattern(3);
        } else if (serialCommandBuffer == "CMD:ALERT") {
          playBuzzerPattern(2);
        } else if (serialCommandBuffer == "CMD:PING") {
          Serial.println("{\"status\":\"PONG\",\"device\":\"AGRI_LINK_ESP32\"}");
        }
        serialCommandBuffer = "";
      }
    } else {
      if (serialCommandBuffer.length() < 64) {
        serialCommandBuffer += c;
      }
    }
  }
}

// ============================================================================
// Setup & Main Super-Loop
// ============================================================================

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

  // High-Craft Startup Brand Animation
  for (int i = 0; i < 15; i++) {
    display.clearDisplay();
    display.drawBitmap(16, 20, bmp_shield_sprout, 16, 16, SSD1306_WHITE);
    display.setTextSize(2);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(38, 16);
    display.print("AGRI LINK");
    display.setTextSize(1);
    display.setCursor(38, 34);
    display.print("INITIALIZING...");
    drawProgressBar(16, 48, 96, 5, i * 7, -1);
    display.display();
    delay(50);
  }

  lastPageChange = millis();
  lastFrame = millis();
}

void loop() {
  unsigned long now = millis();

  processIncomingSerialCommands();
  readSensors();
  activeAlert = determineAlert();
  updateOutputs();

  // Non-blocking serial telemetry dispatch (500 ms)
  if (now - lastTelemetrySend >= TELEMETRY_INTERVAL_MS) {
    lastTelemetrySend = now;
    sendTelemetryPacket();
  }

  // Advance pages every 5 seconds when no alert is active
  if (activeAlert == 0 && !isTransitioning && (now - lastPageChange >= PAGE_INTERVAL_MS)) {
    isTransitioning = true;
    transitionFromPage = currentPage;
    transitionToPage = (currentPage + 1) % PAGE_COUNT;
    transitionStartTime = now;
  }

  // 25 FPS Non-Blocking Animation Render Loop (40 ms)
  if (now - lastFrame >= FRAME_INTERVAL_MS) {
    lastFrame = now;
    animationFrame++;
    renderScreen();
  }
}
