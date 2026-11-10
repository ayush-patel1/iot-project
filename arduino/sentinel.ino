/*
 * SentinelIoT Arduino Uno hardware alert firmware.
 * Wiring:
 * D8 -> green LED anode; LED cathode -> 220 ohm resistor -> GND
 * D9 -> red LED anode; LED cathode -> 220 ohm resistor -> GND
 * D10 -> active buzzer (+); buzzer (-) -> GND
 * All components share Arduino GND.
 *
 * Serial commands at 9600 baud:
 * N = benign/normal: green ON, red OFF, buzzer OFF
 * A = attack: green OFF, red ON, buzzer sounds for 700 ms
 */
const int greenLed = 8;
const int redLed = 9;
const int buzzer = 10;

bool attackState = false;
bool buzzerActive = false;
unsigned long buzzerStarted = 0;
unsigned long lastTelemetry = 0;

void setNormal() {
  attackState = false;
  buzzerActive = false;
  digitalWrite(greenLed, HIGH);
  digitalWrite(redLed, LOW);
  digitalWrite(buzzer, LOW);
}

void setAttack() {
  attackState = true;
  buzzerActive = true;
  buzzerStarted = millis();
  digitalWrite(greenLed, LOW);
  digitalWrite(redLed, HIGH);
  digitalWrite(buzzer, HIGH);
}

void setup() {
  pinMode(greenLed, OUTPUT);
  pinMode(redLed, OUTPUT);
  pinMode(buzzer, OUTPUT);
  setNormal();
  Serial.begin(9600);
  Serial.println("{\"type\":\"status\",\"message\":\"SENTINEL_READY\"}");
}

void loop() {
  while (Serial.available() > 0) {
    const char command = Serial.read();
    if (command == 'A') {
      setAttack();
    } else if (command == 'N') {
      setNormal();
    }
  }

  if (buzzerActive && millis() - buzzerStarted >= 700) {
    digitalWrite(buzzer, LOW);
    buzzerActive = false;
  }

  if (millis() - lastTelemetry >= 2000) {
    lastTelemetry = millis();
    Serial.print("{\"device_id\":\"SENTINEL_UNO_01\",\"uptime_ms\":");
    Serial.print(millis());
    Serial.print(",\"led_state\":\"");
    Serial.print(attackState ? "red" : "green");
    Serial.print("\",\"alarm_state\":\"");
    Serial.print(buzzerActive ? "on" : "off");
    Serial.println("\",\"firmware\":\"sentinel-uno-v2\"}");
  }
}
