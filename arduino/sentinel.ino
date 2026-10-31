/*
 * SentinelIoT - Arduino Uno alert endpoint
 * USB serial at 9600 baud: N = normal (LED off), A = alert (LED on).
 */
const int statusLed = LED_BUILTIN;

void setup() {
  pinMode(statusLed, OUTPUT);
  digitalWrite(statusLed, LOW);
  Serial.begin(9600);
  Serial.println("SENTINEL_READY");
}

void loop() {
  if (Serial.available() > 0) {
    const char command = Serial.read();
    if (command == 'N') {
      digitalWrite(statusLed, LOW);
      Serial.println("STATUS_NORMAL");
    } else if (command == 'A') {
      digitalWrite(statusLed, HIGH);
      Serial.println("STATUS_ALERT");
    }
  }
}
