#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>

#define DHTPIN 4
#define DHTTYPE DHT11 // Change to DHT22 if using the other model

const char* ssid = "HUAWEI-2.4G-VKa6";
const char* password = "A7kvENW9";

// Supabase REST endpoint
const char* supabaseUrl = "https://owiqugejswriycdlkbxo.supabase.co/rest/v1/sensor_data";
const char* supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93aXF1Z2Vqc3dyaXljZGxrYnhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDU1NDksImV4cCI6MjA5MzQ4MTU0OX0.F1AsMeWqy7vE0gfaFp8OcxYjTqg320RPoFfA9gxFYqk";

DHT dht(DHTPIN, DHTTYPE);

void setup() {
  Serial.begin(115200);
  dht.begin();
  
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected");
}

void loop() {
  delay(15000); // Send data every 15 seconds

  float h = dht.readHumidity();
  float t = dht.readTemperature();

  if (isnan(h) || isnan(t)) {
    Serial.println("Failed to read from DHT sensor!");
    return;
  }

  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(supabaseUrl);
    
    http.addHeader("Content-Type", "application/json");
    http.addHeader("apikey", supabaseKey);
    http.addHeader("Authorization", String("Bearer ") + supabaseKey);
    
    String jsonPayload = "{\"temperature\":" + String(t) + ",\"humidity\":" + String(h) + "}";
    
    int httpResponseCode = http.POST(jsonPayload);
    
    if (httpResponseCode > 0) {
      String response = http.getString();
      Serial.println("Data sent: " + response);
    } else {
      Serial.print("Error sending POST: ");
      Serial.println(httpResponseCode);
    }
    
    http.end();
  }
}
