/*
 * SentinelIoT Arduino Uno LED-only firmware.
 * Green LED: D8 anode; cathode -> 220 ohm resistor -> GND.
 * Red LED: D9 anode; cathode -> 220 ohm resistor -> GND.
 * No buzzer is used.
 * Serial at 9600 baud, newline-terminated commands:
 * N, A, DOS, DDOS, SCAN, BRUTE, BOTNET.
 */
const int GREEN_LED = 8;
const int RED_LED = 9;

String currentAttack = "normal";
String ledState = "green";
bool alarmState = false;
unsigned long lastTelemetry = 0;

void setNormal() {
  digitalWrite(GREEN_LED, HIGH);
  digitalWrite(RED_LED, LOW);
  currentAttack = "normal";
  ledState = "green";
  alarmState = false;
}

void showAttack(const String& type, int count, int durationMs) {
  digitalWrite(GREEN_LED, LOW);
  currentAttack = type;
  ledState = "red";
  alarmState = true;

  for (int i = 0; i < count; i++) {
    digitalWrite(RED_LED, HIGH);
    delay(durationMs);
    digitalWrite(RED_LED, LOW);
    delay(200);
  }
  digitalWrite(RED_LED, HIGH);
}

void processCommand(String cmd) {
  cmd.trim();
  cmd.toUpperCase();
  if (cmd == "N") setNormal();
  else if (cmd == "A") showAttack("attack", 1, 700);
  else if (cmd == "DOS") showAttack("dos", 1, 1000);
  else if (cmd == "DDOS") showAttack("ddos", 2, 200);
  else if (cmd == "SCAN") showAttack("port_scan", 3, 150);
  else if (cmd == "BRUTE") showAttack("brute_force", 4, 150);
  else if (cmd == "BOTNET") showAttack("botnet", 5, 150);
}

void sendTelemetry() {
  Serial.print("{\"device_id\":\"SENTINEL_UNO_01\",\"uptime_ms\":");
  Serial.print(millis());
  Serial.print(",\"led_state\":\"");
  Serial.print(ledState);
  Serial.print("\",\"alarm_state\":");
  Serial.print(alarmState ? "true" : "false");
  Serial.print(",\"attack_type\":\"");
  Serial.print(currentAttack);
  Serial.println("\",\"firmware\":\"sentinel-uno-v3\"}");
}

void setup() {
  Serial.begin(9600);
  Serial.setTimeout(100);
  pinMode(GREEN_LED, OUTPUT);
  pinMode(RED_LED, OUTPUT);
  setNormal();
}

void loop() {
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    processCommand(cmd);
  }
  if (millis() - lastTelemetry >= 2000) {
    lastTelemetry = millis();
    sendTelemetry();
  }
}
