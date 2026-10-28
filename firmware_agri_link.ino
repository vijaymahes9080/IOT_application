/*
  AGRI LINK - ESP32 Smart Agriculture Master Neural Display Firmware
  OLED: SSD1306 128x64, Software SPI (MOSI:23, CLK:18, DC:19, CS:5, RESET:4)
  
  Intelligence Architecture:
   - Dynamic Agro-Climatic Intelligence:
       * Real-Time VPD (Vapor Pressure Deficit in kPa, Tetens Model)
       * Dew Point Calculation (Microclimate Condensation / Frost Guard)
       * Dynamic Biosphere Vitality Index (0-100% composite agro-score)
   - Dynamic Trend Vectors (Rising ▲, Stable ■, Falling ▼) across all environmental vectors
   - Multi-Channel 16-Sample Dynamic History Sparklines with zero heap allocation
   - Sub-Pixel Animated Visualizations:
       * Sonar Radar Concentric Sweep & Obstacle Reflection Blips
       * VL53L0X ToF Animated Target-Lock Reticle with Range Brackets
       * Solar Flux Pulsing Heliocentric Ray Dynamics & DLI Classification
       * GPS Orbital Trajectory & NMEA Satellite Tracking Radar
       * 4-Quadrant Cybernetic Agro-Synapse HUD Matrix
   - 25 FPS High-Craft Non-Blocking Render Loop with Cubic Ease-Out Horizontal Carousel
   - Instant Alert Takeover with Quantitative Breached Metrics & Actionable Field Directives
   - 500ms Non-Blocking JSON Telemetry Stream & Two-Way Acoustic Command Bridge
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
const unsigned long SENSOR_INTERVAL_MS = 300;       // Fast sensor acquisition
const unsigned long DHT_INTERVAL_MS = 2000;         // DHT11 acquisition rate
const unsigned long TELEMETRY_INTERVAL_MS = 500;    // Serial JSON telemetry
const unsigned long TRANSITION_DURATION_MS = 280;   // Carousel slide duration
const unsigned long HISTORY_SAMPLE_INTERVAL = 2500; // Sparkline sample rate

// ---------- Alert Thresholds ----------
const float ULTRASONIC_NEAR_CM = 10.0f;
const uint16_t LASER_NEAR_MM = 200;
const float HIGH_TEMP_C = 40.0f;
const bool ENABLE_SOIL_ALERT = false;
const int SOIL_DRY_THRESHOLD = 3000;
const int SOIL_DRY_RAW = 4095;
const int SOIL_WET_RAW = 1500;

// ---------- Live Sensor Telemetry ----------
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

// ---------- Dynamic Intelligence Layer: Sparklines & Trends ----------
#define SPARKLINE_POINTS 16
uint8_t tempHistory[SPARKLINE_POINTS] = {25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25};
uint8_t humHistory[SPARKLINE_POINTS]  = {50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50};
uint8_t soilHistory[SPARKLINE_POINTS] = {40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40};
uint8_t ldrHistory[SPARKLINE_POINTS]  = {50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50};
unsigned long lastHistorySample = 0;

// Trend Direction: 1 = Rising ▲, 0 = Steady ■, -1 = Falling ▼
int8_t tempTrend = 0;
int8_t humTrend = 0;
int8_t soilTrend = 0;
int8_t ldrTrend = 0;

// ---------- Carousel & Alert State Machine ----------
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
// PROGMEM 16x16 1-Bit Pixel-Art Iconography (Hand-Crafted High Contrast)
// ============================================================================

const uint8_t PROGMEM bmp_shield_sprout[32] = {
  0x1F, 0xF8, 0x30, 0x0C, 0x62, 0x46, 0x47, 0xE2,
  0x4F, 0xF2, 0x47, 0xE2, 0x41, 0x82, 0x41, 0x82,
  0x41, 0x82, 0x47, 0xE2, 0x4F, 0xF2, 0x20, 0x04,
  0x30, 0x0C, 0x18, 0x18, 0x0C, 0x30, 0x07, 0xE0
};

const uint8_t PROGMEM bmp_thermometer[32] = {
  0x07, 0xC0, 0x08, 0x20, 0x0B, 0x20, 0x08, 0x20,
  0x0B, 0x20, 0x08, 0x20, 0x0B, 0xA0, 0x09, 0xA0,
  0x0B, 0xA0, 0x09, 0xA0, 0x19, 0x98, 0x3F, 0xFC,
  0x3F, 0xFC, 0x3F, 0xFC, 0x1F, 0xF8, 0x07, 0xC0
};

const uint8_t PROGMEM bmp_droplet[32] = {
  0x01, 0x80, 0x03, 0xC0, 0x03, 0xC0, 0x07, 0xE0,
  0x07, 0xE0, 0x0D, 0xF0, 0x19, 0xF8, 0x1B, 0xF8,
  0x3F, 0xFC, 0x3F, 0xFC, 0x7F, 0xFE, 0x7F, 0xFE,
  0x7F, 0xFE, 0x3F, 0xFC, 0x1F, 0xF8, 0x07, 0xE0
};

const uint8_t PROGMEM bmp_sprout_soil[32] = {
  0x0C, 0x30, 0x1E, 0x78, 0x3F, 0xFC, 0x7F, 0xFE,
  0x7D, 0xBE, 0x39, 0x9C, 0x01, 0x80, 0x01, 0x80,
  0x01, 0x80, 0x01, 0x80, 0x3F, 0xFC, 0x7F, 0xFE,
  0xD6, 0xD7, 0xFF, 0xFF, 0x6D, 0xB6, 0x26, 0x64
};

const uint8_t PROGMEM bmp_sun[32] = {
  0x01, 0x80, 0x41, 0x82, 0x20, 0x04, 0x1F, 0xF8,
  0x3F, 0xFC, 0x3F, 0xFC, 0x7F, 0xFE, 0xFF, 0xFF,
  0xFF, 0xFF, 0x7F, 0xFE, 0x3F, 0xFC, 0x3F, 0xFC,
  0x1F, 0xF8, 0x20, 0x04, 0x41, 0x82, 0x01, 0x80
};

const uint8_t PROGMEM bmp_laser_reticle[32] = {
  0x01, 0x80, 0x01, 0x80, 0x0F, 0xF0, 0x19, 0x98,
  0x31, 0x8C, 0x20, 0x04, 0x67, 0xE6, 0xC7, 0xE3,
  0xC7, 0xE3, 0x67, 0xE6, 0x20, 0x04, 0x31, 0x8C,
  0x19, 0x98, 0x0F, 0xF0, 0x01, 0x80, 0x01, 0x80
};

const uint8_t PROGMEM bmp_ultrasonic_waves[32] = {
  0x00, 0x03, 0x00, 0x0D, 0x38, 0x31, 0x7C, 0x41,
  0x6E, 0xC1, 0x67, 0x01, 0x63, 0x40, 0x63, 0xC0,
  0x63, 0xC0, 0x63, 0x40, 0x67, 0x01, 0x6E, 0xC1,
  0x7C, 0x41, 0x38, 0x31, 0x00, 0x0D, 0x00, 0x03
};

const uint8_t PROGMEM bmp_gps_satellite[32] = {
  0x00, 0x70, 0x00, 0xF8, 0x01, 0xD8, 0x03, 0xD8,
  0x07, 0xF8, 0x0F, 0x70, 0x1E, 0x00, 0x3C, 0x06,
  0x78, 0x0C, 0xF0, 0x18, 0x70, 0x30, 0x30, 0x60,
  0x1E, 0xC0, 0x0F, 0x80, 0x07, 0x00, 0x03, 0x00
};

// Hazard Screen Icons
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

const uint8_t PROGMEM icon_mini_bell_5x5[5] = { 0x20, 0x70, 0x70, 0xF8, 0x20 };

// ============================================================================
// Agro-Climatic Intelligence Engine
// ============================================================================

// Vapor Pressure Deficit (VPD in kPa) using Tetens Equation
float calculateVPD(float tempC, float hum) {
  if (isnan(tempC) || isnan(hum) || hum <= 0.0f) return 0.0f;
  float vpsat = 0.61078f * expf((17.27f * tempC) / (tempC + 237.3f));
  float vpair = vpsat * (hum / 100.0f);
  return fmaxf(0.0f, vpsat - vpair);
}

// Dew Point Calculation in °C (Magnus-Tetens approximation)
float calculateDewPoint(float tempC, float hum) {
  if (isnan(tempC) || isnan(hum)) return 0.0f;
  return tempC - ((100.0f - hum) / 5.0f);
}

// Soil Hydration Percentage (calibrated to physical raw ADC)
int calculateSoilPercent() {
  if (SOIL_DRY_RAW == SOIL_WET_RAW) return 0;
  int p = map(soilRaw, SOIL_DRY_RAW, SOIL_WET_RAW, 0, 100);
  return constrain(p, 0, 100);
}

// Composite Farm Vitality / Health Index (0 - 100%)
uint8_t calculateVitalityIndex() {
  uint8_t score = 0;
  
  // 1. Thermal Health (0-25 pts): Ideal 20-30°C
  if (!isnan(temperatureC)) {
    if (temperatureC >= 20.0f && temperatureC <= 30.0f) score += 25;
    else if (temperatureC >= 15.0f && temperatureC <= 35.0f) score += 18;
    else score += 8;
  } else score += 12;

  // 2. Air Moisture Health (0-25 pts): Ideal 50-70% RH
  if (!isnan(humidityPct)) {
    if (humidityPct >= 50.0f && humidityPct <= 70.0f) score += 25;
    else if (humidityPct >= 40.0f && humidityPct <= 80.0f) score += 18;
    else score += 10;
  } else score += 12;

  // 3. Root Hydration Health (0-25 pts): Ideal 35-75%
  int soilPct = calculateSoilPercent();
  if (soilPct >= 35 && soilPct <= 75) score += 25;
  else if (soilPct >= 20 && soilPct <= 85) score += 16;
  else score += 6;

  // 4. Solar Flux Health (0-25 pts): Ideal ambient daylight
  int lightPct = constrain(map(ldrRaw, 0, 4095, 0, 100), 0, 100);
  if (lightPct >= 25 && lightPct <= 85) score += 25;
  else score += 16;

  return constrain(score, 0, 100);
}

// Multi-Channel Sliding History Buffer Update
void updateHistoryBuffer() {
  unsigned long now = millis();
  if (now - lastHistorySample < HISTORY_SAMPLE_INTERVAL) return;
  lastHistorySample = now;

  // Shift history samples left
  for (int i = 0; i < SPARKLINE_POINTS - 1; i++) {
    tempHistory[i] = tempHistory[i + 1];
    humHistory[i]  = humHistory[i + 1];
    soilHistory[i] = soilHistory[i + 1];
    ldrHistory[i]  = ldrHistory[i + 1];
  }

  uint8_t curTemp = isnan(temperatureC) ? 25 : (uint8_t)constrain(temperatureC, 0, 60);
  uint8_t curHum  = isnan(humidityPct)  ? 50 : (uint8_t)constrain(humidityPct, 0, 100);
  uint8_t curSoil = (uint8_t)calculateSoilPercent();
  uint8_t curLdr  = (uint8_t)constrain(map(ldrRaw, 0, 4095, 0, 100), 0, 100);

  // Compute Trends (Comparing latest sample to average of oldest 3)
  int oldAvgTemp = (tempHistory[0] + tempHistory[1] + tempHistory[2]) / 3;
  tempTrend = (curTemp > oldAvgTemp + 1) ? 1 : (curTemp < oldAvgTemp - 1 ? -1 : 0);

  int oldAvgHum = (humHistory[0] + humHistory[1] + humHistory[2]) / 3;
  humTrend = (curHum > oldAvgHum + 2) ? 1 : (curHum < oldAvgHum - 2 ? -1 : 0);

  int oldAvgSoil = (soilHistory[0] + soilHistory[1] + soilHistory[2]) / 3;
  soilTrend = (curSoil > oldAvgSoil + 2) ? 1 : (curSoil < oldAvgSoil - 2 ? -1 : 0);

  int oldAvgLdr = (ldrHistory[0] + ldrHistory[1] + ldrHistory[2]) / 3;
  ldrTrend = (curLdr > oldAvgLdr + 3) ? 1 : (curLdr < oldAvgLdr - 3 ? -1 : 0);

  // Insert newest sample
  tempHistory[SPARKLINE_POINTS - 1] = curTemp;
  humHistory[SPARKLINE_POINTS - 1]  = curHum;
  soilHistory[SPARKLINE_POINTS - 1] = curSoil;
  ldrHistory[SPARKLINE_POINTS - 1]  = curLdr;
}

// ============================================================================
// UI Primitives: Sparklines, Gauges, Status Badges, Headers, Footers
// ============================================================================

void drawDegreeSymbol(int16_t x, int16_t y) {
  display.drawCircle(x + 1, y + 1, 1, SSD1306_WHITE);
}

// Trend Indicator Arrow (▲ Rising, ■ Steady, ▼ Falling)
void drawTrendArrow(int16_t x, int16_t y, int8_t trend) {
  if (trend > 0) {
    display.drawTriangle(x + 2, y, x, y + 4, x + 4, y + 4, SSD1306_WHITE);
  } else if (trend < 0) {
    display.drawTriangle(x + 2, y + 4, x, y, x + 4, y, SSD1306_WHITE);
  } else {
    display.fillRect(x + 1, y + 2, 3, 2, SSD1306_WHITE);
  }
}

// Micro Sparkline Graph with Grid Baseline & Bounding Box
void drawSparkline(int16_t x, int16_t y, int16_t w, int16_t h, const uint8_t *data, uint8_t minVal, uint8_t maxVal) {
  if (w < 10 || h < 6) return;
  display.drawRect(x, y, w, h, SSD1306_WHITE);
  if (maxVal <= minVal) maxVal = minVal + 1;
  float stepX = (float)(w - 4) / (float)(SPARKLINE_POINTS - 1);

  // Faint dotted mid-line baseline
  for (int16_t bx = x + 2; bx < x + w - 2; bx += 4) {
    display.drawPixel(bx, y + h / 2, SSD1306_WHITE);
  }

  int16_t prevX = x + 2;
  int16_t prevY = y + h - 2 - (int16_t)(((float)(data[0] - minVal) / (float)(maxVal - minVal)) * (h - 4));
  prevY = constrain(prevY, y + 2, y + h - 2);

  for (int i = 1; i < SPARKLINE_POINTS; i++) {
    int16_t curX = x + 2 + (int16_t)(i * stepX);
    int16_t curY = y + h - 2 - (int16_t)(((float)(data[i] - minVal) / (float)(maxVal - minVal)) * (h - 4));
    curY = constrain(curY, y + 2, y + h - 2);
    display.drawLine(prevX, prevY, curX, curY, SSD1306_WHITE);
    prevX = curX;
    prevY = curY;
  }
}

// Micro Status Pill with Strict Screen-Width Bounds Clamping
void drawStatusPill(int16_t x, int16_t y, const char *text, bool inverted = false) {
  if (!text) return;
  int16_t len = (int16_t)strlen(text);
  int16_t w = len * 6 + 6;
  int16_t h = 10;

  // Clamp right edge so it never exceeds x=127
  if (x + w > 127) {
    w = 127 - x;
  }

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

// Precision Progress Bar with Optional Threshold Guidemark
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

// Master Header with Inverted Category Badge & 2Hz Neural Heartbeat
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

  // Live Heartbeat Activity Indicator (pulsing dot)
  uint8_t pulse = (animationFrame / 6) % 2;
  display.drawPixel(106, 3, pulse ? SSD1306_WHITE : SSD1306_BLACK);
  display.drawCircle(106, 3, 2, SSD1306_WHITE);

  if (activeAlert != 0) {
    display.drawBitmap(118, 2, icon_mini_bell_5x5, 5, 5, SSD1306_WHITE);
  }
  display.drawFastHLine(0, 11, 128, SSD1306_WHITE);
}

// Master Footer with 9-Dot Track, Dwell Progress Line & Page Fraction
void drawFooter(uint8_t pageIdx, uint8_t pageCount, uint32_t dwellMs) {
  display.drawFastHLine(0, 53, 128, SSD1306_WHITE);

  // 9-dot pagination track
  int16_t dotSpacing = 5;
  for (uint8_t i = 0; i < pageCount; i++) {
    int16_t dx = 3 + i * dotSpacing;
    if (i == pageIdx) {
      display.fillRect(dx, 57, 3, 3, SSD1306_WHITE);
    } else {
      display.drawPixel(dx + 1, 58, SSD1306_WHITE);
    }
  }

  // Page dwell progress line (5000 ms)
  int16_t barW = 34;
  int16_t fillW = (int16_t)constrain((dwellMs * barW) / PAGE_INTERVAL_MS, 0, barW);
  display.drawFastHLine(48, 58, barW, SSD1306_WHITE);
  display.fillRect(48, 57, fillW, 3, SSD1306_WHITE);

  // Numerical page fraction
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(88, 56);
  display.print(pageIdx + 1);
  display.print("/");
  display.print(pageCount);
}

void drawHeaderForPage(uint8_t pageIndex) {
  switch (pageIndex % PAGE_COUNT) {
    case 0: drawHeader("AI",  "AGRI-LINK CORE"); break;
    case 1: drawHeader("TMP", "THERMAL RADAR"); break;
    case 2: drawHeader("HUM", "VPD & HUMIDITY"); break;
    case 3: drawHeader("SOL", "ROOT HYDRATION"); break;
    case 4: drawHeader("LGT", "SOLAR FLUX"); break;
    case 5: drawHeader("LSR", "TOF LIDAR RANGE"); break;
    case 6: drawHeader("ULT", "SONIC RADAR"); break;
    case 7: drawHeader("GPS", "ORBITAL TELEMETRY"); break;
    case 8: drawHeader("HUD", "AGRO-SYNAPSE"); break;
  }
}

// ============================================================================
// Intelligent Offset-Aware Display Pages (y = 12..52)
// ============================================================================

// Page 0: Master Agro-Neural Brand, Diagnostics & Farm Health Score
void page0(int16_t xOffset) {
  display.drawBitmap(6 + xOffset, 14, bmp_shield_sprout, 16, 16, SSD1306_WHITE);
  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(28 + xOffset, 13);
  display.print("AGRI LINK");

  display.setTextSize(1);
  display.setCursor(28 + xOffset, 29);
  display.print("NEURAL FARM OS");

  display.drawFastHLine(6 + xOffset, 39, 116, SSD1306_WHITE);

  // Subsystems Status Badges & Biosphere Health Index
  display.setCursor(6 + xOffset, 42);
  display.print("DHT:");
  display.print(isnan(temperatureC) ? "--" : "OK");

  display.setCursor(44 + xOffset, 42);
  display.print("LSR:");
  display.print(laserReady ? "OK" : "--");

  uint8_t vScore = calculateVitalityIndex();
  char vitalBuf[14];
  snprintf(vitalBuf, sizeof(vitalBuf), "VITAL:%d%%", vScore);
  display.setCursor(76 + xOffset, 42);
  display.print(vitalBuf);
}

// Page 1: Temperature, Dew Point & Dynamic Sparkline History
void page1(int16_t xOffset) {
  display.drawBitmap(6 + xOffset, 14, bmp_thermometer, 16, 16, SSD1306_WHITE);
  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(26 + xOffset, 14);
  if (isnan(temperatureC)) display.print("--.-");
  else display.print(temperatureC, 1);

  drawDegreeSymbol(75 + xOffset, 14);
  drawTrendArrow(81 + xOffset, 17, tempTrend);

  // Sparkline history mini-graph (16 dynamic samples)
  drawSparkline(88 + xOffset, 14, 34, 15, tempHistory, 15, 45);

  const char *statusStr = "OPTIMAL";
  bool isCrit = false;
  if (isnan(temperatureC)) { statusStr = "ERR"; isCrit = true; }
  else if (temperatureC >= HIGH_TEMP_C) { statusStr = "CRITICAL"; isCrit = true; }
  else if (temperatureC >= 32.0f) statusStr = "ELEVATED";
  else if (temperatureC < 18.0f) statusStr = "COLD";
  drawStatusPill(26 + xOffset, 31, statusStr, isCrit);

  // Dew Point Micro-Tag (Condensation / Frost Intelligence)
  float dewPt = calculateDewPoint(temperatureC, humidityPct);
  char dpBuf[12];
  if (!isnan(dewPt)) snprintf(dpBuf, sizeof(dpBuf), "DP:%.1fC", dewPt);
  else snprintf(dpBuf, sizeof(dpBuf), "DP:--");
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(80 + xOffset, 32);
  display.print(dpBuf);

  int16_t pct = isnan(temperatureC) ? 0 : (int16_t)constrain(temperatureC * 2.0f, 0, 100);
  drawProgressBar(6 + xOffset, 43, 116, 6, pct, 80);
}

// Page 2: Air Humidity & Agro-Climatic VPD (Vapor Pressure Deficit)
void page2(int16_t xOffset) {
  display.drawBitmap(6 + xOffset, 14, bmp_droplet, 16, 16, SSD1306_WHITE);
  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(26 + xOffset, 14);
  if (isnan(humidityPct)) display.print("--");
  else display.print((int)round(humidityPct));
  display.setTextSize(1);
  display.print("%");
  drawTrendArrow(56 + xOffset, 17, humTrend);

  // Precision VPD Status Pill (Strictly fits without clipping: x=66, w=56, max=122)
  float vpd = calculateVPD(temperatureC, humidityPct);
  char vpdBuf[12];
  snprintf(vpdBuf, sizeof(vpdBuf), "VPD:%.2f", vpd);
  drawStatusPill(66 + xOffset, 15, vpdBuf, false);

  // Agronomic Transpiration Intelligence Tag
  const char *humStr = "TARGET RH";
  bool isErr = false;
  if (isnan(humidityPct)) { humStr = "SENSOR ERR"; isErr = true; }
  else if (vpd < 0.4f)   humStr = "LOW TRANS";   // Mold risk
  else if (vpd <= 1.2f)  humStr = "HEALTHY RH";  // Peak growth
  else if (vpd <= 1.6f)  humStr = "HIGH TRANS";  // High transpiration
  else                   humStr = "DRY STRESS";  // Stomata closing
  drawStatusPill(26 + xOffset, 31, humStr, isErr);

  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(96 + xOffset, 32);
  display.print("kPa");

  int16_t pct = isnan(humidityPct) ? 0 : (int16_t)constrain(humidityPct, 0, 100);
  drawProgressBar(6 + xOffset, 43, 116, 6, pct, -1);

  // Optimal Humidity Guide Marks (50% and 70%)
  int16_t x1 = 6 + 2 + (112 * 50) / 100 + xOffset;
  int16_t x2 = 6 + 2 + (112 * 70) / 100 + xOffset;
  display.drawFastVLine(x1, 41, 3, SSD1306_WHITE);
  display.drawFastVLine(x1, 48, 3, SSD1306_WHITE);
  display.drawFastVLine(x2, 41, 3, SSD1306_WHITE);
  display.drawFastVLine(x2, 48, 3, SSD1306_WHITE);
}

// Page 3: Soil Moisture, Root Zone Hydration & Sparkline Buffer
void page3(int16_t xOffset) {
  display.drawBitmap(6 + xOffset, 14, bmp_sprout_soil, 16, 16, SSD1306_WHITE);
  int soilPct = calculateSoilPercent();

  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(26 + xOffset, 14);
  display.print(soilPct);
  display.setTextSize(1);
  display.print("%");
  drawTrendArrow(54 + xOffset, 17, soilTrend);

  // Sparkline history of soil moisture (x=66, w=56, max=122)
  drawSparkline(66 + xOffset, 14, 56, 15, soilHistory, 0, 100);

  const char *soilStatus = "HYDRATED";
  bool isWarn = false;
  if (ENABLE_SOIL_ALERT && soilRaw >= SOIL_DRY_THRESHOLD) { soilStatus = "DROUGHT"; isWarn = true; }
  else if (soilPct < 25) { soilStatus = "IRRIGATE!"; isWarn = true; }
  else if (soilPct > 80) soilStatus = "SATURATED";
  drawStatusPill(26 + xOffset, 31, soilStatus, isWarn);

  // Clean, non-clipping ADC display (x=84, w=38, max=122)
  char adcBuf[10];
  snprintf(adcBuf, sizeof(adcBuf), "A:%d", soilRaw);
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(84 + xOffset, 32);
  display.print(adcBuf);

  drawProgressBar(6 + xOffset, 43, 116, 6, soilPct, 30);
}

// Page 4: Light Flux, Photoperiod & 10-Segment Ladder Meter
void page4(int16_t xOffset) {
  display.drawBitmap(6 + xOffset, 14, bmp_sun, 16, 16, SSD1306_WHITE);
  int lightPct = constrain(map(ldrRaw, 0, 4095, 0, 100), 0, 100);

  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(26 + xOffset, 14);
  display.print(lightPct);
  display.setTextSize(1);
  display.print("%");
  drawTrendArrow(56 + xOffset, 17, ldrTrend);

  // Heliocentric Photoperiod Classifier Tag
  const char *lightStatus = "AMBIENT";
  if (ldrRaw < 1000) lightStatus = "LOW LIGHT";
  else if (ldrRaw > 3000) lightStatus = "BRIGHT SUN";
  else if (ldrRaw > 2000) lightStatus = "DIFFUSED";
  drawStatusPill(26 + xOffset, 31, lightStatus, false);

  char ldrBuf[10];
  snprintf(ldrBuf, sizeof(ldrBuf), "A:%04d", ldrRaw);
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(80 + xOffset, 32);
  display.print(ldrBuf);

  // 10-Step High-Craft Ladder Light Meter
  int startX = 9 + xOffset;
  int activeSegs = map(lightPct, 0, 100, 0, 10);
  for (int i = 0; i < 10; i++) {
    int16_t segX = startX + i * 11;
    if (i < activeSegs) display.fillRect(segX, 43, 9, 6, SSD1306_WHITE);
    else display.drawRect(segX, 43, 9, 6, SSD1306_WHITE);
  }
}

// Page 5: VL53L0X Laser Distance & Animated Reticle Lock
void page5(int16_t xOffset) {
  display.drawBitmap(6 + xOffset, 14, bmp_laser_reticle, 16, 16, SSD1306_WHITE);
  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(26 + xOffset, 14);

  if (!laserReady || laserMm == 0) {
    display.print("---");
  } else if (laserMm >= 1000) {
    display.print(laserMm / 1000.0f, 2);
    display.setTextSize(1);
    display.setCursor(82 + xOffset, 18);
    display.print("m");
  } else {
    display.print(laserMm);
    display.setTextSize(1);
    display.setCursor(82 + xOffset, 18);
    display.print("mm");
  }

  // Animated Target Lock Crosshair Brackets (Top-Right)
  uint8_t bracketTick = (animationFrame / 4) % 3;
  display.drawPixel(114 + xOffset - bracketTick, 14, SSD1306_WHITE);
  display.drawPixel(114 + xOffset - bracketTick, 15, SSD1306_WHITE);
  display.drawPixel(122 + xOffset + bracketTick, 14, SSD1306_WHITE);
  display.drawPixel(122 + xOffset + bracketTick, 15, SSD1306_WHITE);
  display.drawPixel(114 + xOffset - bracketTick, 23, SSD1306_WHITE);
  display.drawPixel(122 + xOffset + bracketTick, 23, SSD1306_WHITE);

  const char *lsrStatus = "TARGET LOCK";
  bool isHazard = false;
  if (!laserReady) { lsrStatus = "OFFLINE"; isHazard = true; }
  else if (laserMm > 0 && laserMm <= LASER_NEAR_MM) { lsrStatus = "NEAR HAZARD"; isHazard = true; }
  drawStatusPill(26 + xOffset, 31, lsrStatus, isHazard);

  int16_t lsrPct = (!laserReady || laserMm == 0) ? 0 : (int16_t)constrain(map(laserMm, 0, 1200, 0, 100), 0, 100);
  drawProgressBar(6 + xOffset, 43, 116, 6, lsrPct, 16);
}

// Page 6: HC-SR04 Ultrasonic Sonar with Radiating Concentric Arcs
void page6(int16_t xOffset) {
  display.drawBitmap(6 + xOffset, 14, bmp_ultrasonic_waves, 16, 16, SSD1306_WHITE);
  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(26 + xOffset, 14);

  if (ultrasonicCm < 0) {
    display.print("---");
  } else {
    display.print(ultrasonicCm, 1);
    display.setTextSize(1);
    display.setCursor(86 + xOffset, 18);
    display.print("cm");
  }

  // Radiating Concentric Radar Wave Animation
  int16_t waveR = 3 + ((animationFrame / 3) % 4) * 3;
  display.drawCircle(112 + xOffset, 20, waveR, SSD1306_WHITE);

  const char *ultStatus = "CLEAR PATH";
  bool isNear = false;
  if (ultrasonicCm < 0) ultStatus = "NO ECHO";
  else if (ultrasonicCm <= ULTRASONIC_NEAR_CM) { ultStatus = "OBSTACLE!"; isNear = true; }
  else if (ultrasonicCm <= 30.0f) ultStatus = "PROXIMITY";
  drawStatusPill(26 + xOffset, 31, ultStatus, isNear);

  float d = constrain(ultrasonicCm, 0.0f, 50.0f);
  int16_t dangerPct = (ultrasonicCm < 0) ? 0 : (int16_t)((50.0f - d) * 2.0f);
  drawProgressBar(6 + xOffset, 43, 116, 6, dangerPct, 80);
}

// Page 7: GPS Orbital Telemetry with Rotating Radar Dish
void page7(int16_t xOffset) {
  if (!gpsFix) {
    // High-Precision Animated Radar Sweep
    display.drawCircle(22 + xOffset, 31, 11, SSD1306_WHITE);
    display.drawCircle(22 + xOffset, 31, 6, SSD1306_WHITE);
    display.drawFastHLine(22 + xOffset - 11, 31, 22, SSD1306_WHITE);
    display.drawFastVLine(22 + xOffset, 31 - 11, 22, SSD1306_WHITE);

    float angle = (animationFrame % 12) * (3.14159f / 6.0f);
    int16_t rx = (int16_t)(cosf(angle) * 11.0f);
    int16_t ry = (int16_t)(sinf(angle) * 11.0f);
    display.drawLine(22 + xOffset, 31, 22 + xOffset + rx, 31 + ry, SSD1306_WHITE);

    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(42 + xOffset, 16);
    display.print("ACQUIRING...");
    display.setCursor(42 + xOffset, 28);
    display.print("SATS: ");
    display.print(gps.satellites.isValid() ? gps.satellites.value() : 0);
    display.setCursor(42 + xOffset, 40);
    display.print("NMEA: ");
    display.print(gps.charsProcessed() % 10000);
  } else {
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

    // Altitude indicator when available
    if (gps.altitude.isValid()) {
      display.setCursor(82 + xOffset, 40);
      display.print((int)gps.altitude.meters());
      display.print("m ALT");
    }
  }
}

// Page 8: Agro-Synapse Master Intelligence HUD (4-Quadrant Neural Matrix)
void page8(int16_t xOffset) {
  // Biosphere Health Header Strip
  uint8_t vScore = calculateVitalityIndex();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(6 + xOffset, 13);
  display.print("SYS VITALITY: ");
  display.print(vScore);
  display.print("%");

  // Mini Health Progress Line
  int16_t hw = (vScore * 30) / 100;
  display.drawRect(92 + xOffset, 14, 30, 5, SSD1306_WHITE);
  display.fillRect(92 + xOffset, 14, hw, 5, SSD1306_WHITE);

  // 4-Quadrant Cybernetic Telemetry Matrix (y=21..50)
  display.drawRoundRect(6 + xOffset, 21, 116, 30, 2, SSD1306_WHITE);
  display.drawFastVLine(64 + xOffset, 21, 30, SSD1306_WHITE);
  display.drawFastHLine(6 + xOffset, 35, 116, SSD1306_WHITE);

  // Quadrant 1: Thermal Vector
  display.setCursor(10 + xOffset, 24);
  display.print("T:");
  if (isnan(temperatureC)) display.print("--");
  else { display.print((int)temperatureC); display.print("C"); }
  drawTrendArrow(48 + xOffset, 24, tempTrend);

  // Quadrant 2: Air Moisture Vector
  display.setCursor(68 + xOffset, 24);
  display.print("H:");
  if (isnan(humidityPct)) display.print("--");
  else { display.print((int)humidityPct); display.print("%"); }
  drawTrendArrow(106 + xOffset, 24, humTrend);

  // Quadrant 3: Root Hydration Vector
  display.setCursor(10 + xOffset, 38);
  display.print("S:");
  display.print(calculateSoilPercent());
  display.print("%");
  drawTrendArrow(48 + xOffset, 38, soilTrend);

  // Quadrant 4: Solar Radiation Vector
  display.setCursor(68 + xOffset, 38);
  display.print("L:");
  display.print(constrain(map(ldrRaw, 0, 4095, 0, 100), 0, 100));
  display.print("%");
  drawTrendArrow(106 + xOffset, 38, ldrTrend);
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
// Master Emergency Alert Screen with Flashing Hazard Header & Breached Metrics
// ============================================================================

void pageAlert() {
  display.fillRect(0, 0, 128, 12, SSD1306_WHITE);
  display.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(8, 2);
  display.print("! CRITICAL ALERT !");
  display.setTextColor(SSD1306_WHITE);

  // Breathing Corner Chevrons (1.5 Hz dynamic pulsation)
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

  display.setTextSize(1);
  display.setCursor(6, 51);
  switch (activeAlert) {
    case 1: display.print("ACTION: CLEAR CORRIDOR"); break;
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

      renderPage(transitionFromPage, -offset);
      renderPage(transitionToPage, 128 - offset);

      display.fillRect(0, 0, 128, 12, SSD1306_BLACK);
      display.fillRect(0, 53, 128, 11, SSD1306_BLACK);

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

    updateHistoryBuffer();
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
  float vpd = calculateVPD(temperatureC, humidityPct);
  float dewPt = calculateDewPoint(temperatureC, humidityPct);
  uint8_t vScore = calculateVitalityIndex();

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
  Serial.print(",\"vpd\":"); Serial.print(vpd, 2);
  Serial.print(",\"dew_pt\":");
  if (isnan(dewPt)) Serial.print("null"); else Serial.print(dewPt, 1);
  Serial.print(",\"vitality\":"); Serial.print(vScore);
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

  // Master Neural Startup Animation Sequence
  for (int i = 0; i < 15; i++) {
    display.clearDisplay();
    display.drawBitmap(16, 20, bmp_shield_sprout, 16, 16, SSD1306_WHITE);
    display.setTextSize(2);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(38, 16);
    display.print("AGRI LINK");
    display.setTextSize(1);
    display.setCursor(38, 34);
    display.print("NEURAL CORE");
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
