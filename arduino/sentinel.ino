/*
 * SentinelIoT Arduino Uno telemetry firmware.
 * Sends real board status over USB Serial as JSON lines.
 * No external sensors are assumed or fabricated.
 * Commands: A = built-in LED ON, N = built-in LED OFF.
 */
const int statusLed = LED_BUILTIN;
bool ledOn = false;
unsigned long lastTelemetry = 0;

void setup() {
  pinMode(statusLed, OUTPUT);
  digitalWrite(statusLed, LOW);
  Serial.begin(9600);
  Serial.println("{\"type\":\"status\",\"message\":\"SENTINEL_READY\"}");
}

void loop() {
  while (Serial.available() > 0) {
    const char command = Serial.read();
    if (command == 'A') {
      ledOn = true;
      digitalWrite(statusLed, HIGH);
    } else if (command == 'N') {
      ledOn = false;
      digitalWrite(statusLed, LOW);
    }
  }
  if (millis() - lastTelemetry >= 2000) {
    lastTelemetry = millis();
    Serial.print("{\"device_id\":\"SENTINEL_UNO_01\",\"uptime_ms\":");
    Serial.print(millis());
    Serial.print(",\"led_state\":\"");
    Serial.print(ledOn ? "on" : "off");
    Serial.println("\",\"firmware\":\"sentinel-uno-v1\"}");
  }
}
