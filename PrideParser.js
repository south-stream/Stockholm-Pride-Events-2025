// pride-events.js
import axios from "axios";
import fs from "node:fs/promises";
import "dotenv/config";

// --- konstanter -------------------------------------------------------------
const GOOGLE_API_KEY = process.env.GOOGLE_GEOCODING_API_KEY; // Lägg till din Google API-nyckel i .env
const PRIDE_API = "https://event.stockholmpride.org/api/events";
const GOOGLE_GEOCODE = (addr) =>
  `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addr)}&key=${GOOGLE_API_KEY}&region=se`;

// --- arrow-helpers ----------------------------------------------------------
const fetchEvents = async (params = { date: "upcoming", language: "sv" }) => {
  const qs = new URLSearchParams(params).toString();
  const { data } = await axios.get(`${PRIDE_API}?${qs}`);
  return data; // Array<Event>
};

const geocode = async (address) => {
  if (!address || address.trim() === "") return null;

  if (!GOOGLE_API_KEY) {
    console.error("❌ GOOGLE_GEOCODING_API_KEY saknas i .env filen");
    return null;
  }

  try {
    const url = GOOGLE_GEOCODE(address);
    console.log(
      `🔍 Google Geocoding request: ${url.replace(GOOGLE_API_KEY, "API_KEY_HIDDEN")}`
    );

    const { data } = await axios.get(url, { timeout: 10_000 });
    console.log(
      `📡 Google Response: ${data.status}, ${data.results?.length || 0} resultat för "${address}"`
    );

    if (data.status === "OK" && data.results?.[0]) {
      const location = data.results[0].geometry.location;
      const coords = { lat: location.lat, lon: location.lng };
      console.log(`✅ Google: Hittade koordinater för "${address}"`);
      return coords;
    } else {
      console.log(
        `⚠️ Google: ${data.status} - Ingen koordinat hittad för "${address}"`
      );
      return null;
    }
  } catch (error) {
    console.error(`❌ Google Geocoding fel för "${address}": ${error.message}`);
    return null;
  }
};

const writeEventToFile = async (enrichedEvent, outputFile, isFirst) => {
  const prefix = isFirst ? "" : ",\n";
  const eventJson = JSON.stringify(enrichedEvent, null, 2);

  // Indentera JSON för att matcha array-strukturen
  const indentedJson = eventJson
    .split("\n")
    .map((line) => (line ? "  " + line : line))
    .join("\n");

  await fs.appendFile(outputFile, prefix + indentedJson);
};

const geocodeEvents = async (
  events,
  rps = 1,
  outputFile = "eventsWithCoords.json"
) => {
  // Ladda befintliga koordinater från fil
  const addressCache = await loadExistingCoordinates(outputFile);

  // Skriv början av JSON-arrayen
  await fs.writeFile(outputFile, "[\n");

  const results = [];
  let successCount = 0;
  let errorCount = 0;
  let cacheHits = 0;

  // Ladda befintliga koordinater från filen till cache
  const fileCache = await loadExistingCoordinates(outputFile);
  fileCache.forEach((coords, addr) => addressCache.set(addr, coords));

  for (let i = 0; i < events.length; i++) {
    const evt = events[i];

    try {
      const addr = evt.location?.address ?? evt.area?.address ?? "";
      let coords = null;

      // Kolla först i cache
      if (addr && addressCache.has(addr)) {
        coords = addressCache.get(addr);
        console.log(`💾 Cache hit för "${addr}"`);
        cacheHits++;
      } else if (addr && addr.trim() !== "") {
        // Respektera rate limit - vänta mellan API-requests
        if (i > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000 / rps));
        }

        // Gör API-anrop endast om inte i cache
        coords = await geocode(addr);
        // Spara i cache (även null-resultat för att undvika onödiga API-anrop)
        addressCache.set(addr, coords);
      }

      const enrichedEvent = {
        id: evt.id,
        title: evt.title,
        address: addr,
        ...coords,
      };

      // Skriv direkt till filen i korrekt ordning
      await writeEventToFile(enrichedEvent, outputFile, i === 0);

      if (coords) {
        console.log(
          `📍 Event ${i + 1}/${events.length}: ${enrichedEvent.title} (${coords.lat}, ${coords.lon})`
        );
        successCount++;
      } else if (!addr || addr.trim() === "") {
        console.log(
          `📍 Event ${i + 1}/${events.length}: ${enrichedEvent.title} - Ingen adress angiven`
        );
        successCount++; // Räkna som lyckad eftersom det inte är ett fel
      } else {
        console.log(
          `⚠️  Event ${i + 1}/${events.length}: ${enrichedEvent.title} - Ingen koordinat hittad för "${addr}"`
        );
        errorCount++;
      }

      results.push(enrichedEvent);
    } catch (error) {
      console.error(
        `❌ Event ${i + 1}/${events.length}: ${evt.title} - Fel: ${error.message}`
      );
      errorCount++;

      // Lägg till event även om geocoding misslyckades
      const enrichedEvent = {
        id: evt.id,
        title: evt.title,
        address: evt.location?.address ?? evt.area?.address ?? "",
        error: error.message,
      };

      await writeEventToFile(enrichedEvent, outputFile, i === 0);
      results.push(enrichedEvent);
    }
  }

  // Stäng JSON-arrayen
  await fs.appendFile(outputFile, "\n]\n");

  console.log(
    `\n📊 Sammanfattning: ${successCount} lyckades, ${errorCount} misslyckades av ${events.length} totalt`
  );
  console.log(
    `💾 Cache: ${addressCache.size} unika adresser sparade, ${cacheHits} cache hits`
  );

  return results;
};

const loadExistingCoordinates = async (outputFile) => {
  const cache = new Map();
  try {
    const existingData = await fs.readFile(outputFile, "utf-8");
    const events = JSON.parse(existingData);

    for (const event of events) {
      if (event.address && event.lat && event.lon) {
        cache.set(event.address, { lat: event.lat, lon: event.lon });
      }
    }

    console.log(
      `💾 Laddade ${cache.size} befintliga adresser från ${outputFile}`
    );
  } catch (error) {
    // Ignorera fel - det är okej om filen inte finns eller är skadad
    if (error.code !== "ENOENT") {
      console.log(
        `📝 Varning: Kunde inte läsa ${outputFile}: ${error.message}`
      );
    }
  }

  return cache;
};

// --- main -------------------------------------------------------------------
const run = async () => {
  const events = await fetchEvents(); // Pride-API  [oai_citation:0‡event.stockholmpride.org](https://event.stockholmpride.org/api-docs/get-api-events_date_area_subarea_room_organizer_highlighted_language) [oai_citation:1‡event.stockholmpride.org](https://event.stockholmpride.org/api-docs/models/eventlocation)
  const enriched = await geocodeEvents(events, 1, "eventsWithCoords.json"); // 1 req/s ⇒ under gratis­gränsen
  console.log(`✅  ${enriched.length} events sparade → eventsWithCoords.json`);
};

run().catch(console.error);
