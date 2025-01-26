"use client";
import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import * as turf from "@turf/turf";
import Papa from "papaparse";

interface CustomWindow extends Window {
  reloadAndReroute?: () => Promise<void>;
}

interface SimulationLayerProps {
  map: mapboxgl.Map;
}

interface Person {
  id: string;
  marker: mapboxgl.Marker;
  home: [number, number];
  targetStore: [number, number];
  progress: number;
  isReturning: boolean;
  route: [number, number][];
  tractId: string;
}

interface StoreFeature {
  geometry: {
    coordinates: [number, number];
  };
}

interface MongoStore {
  geometry: {
    coordinates: [number, number];
  };
}

export function SimulationLayer({ map }: SimulationLayerProps) {
  const peopleRef = useRef<Person[]>([]);
  const routeCacheRef = useRef<Map<string, [number, number][]>>(new Map());
  const animationRef = useRef<number>(0);
  const [, setForceUpdate] = useState(0);
  const lastRequestRef = useRef<number>(0);

  const getRoute = async (
    start: [number, number],
    end: [number, number]
  ): Promise<[number, number][]> => {
    const cacheKey = `${start[0]},${start[1]}-${end[0]},${end[1]}`;
    const reverseKey = `${end[0]},${end[1]}-${start[0]},${start[1]}`;

    // Check both directions
    if (routeCacheRef.current.has(cacheKey))
      return routeCacheRef.current.get(cacheKey)!;
    if (routeCacheRef.current.has(reverseKey))
      return [...routeCacheRef.current.get(reverseKey)!].reverse();

    // Rate limit: 1 request every 300ms (~3 requests/second)
    const now = Date.now();
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(300 - (now - lastRequestRef.current), 0))
    );
    lastRequestRef.current = Date.now();

    try {
      const response = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/walking/${start[0]},${start[1]};${end[0]},${end[1]}?` +
          new URLSearchParams({
            steps: "true",
            geometries: "geojson",
            overview: "full",
            access_token: mapboxgl.accessToken as string,
            approaches: "curb;curb", // Snap to roads
          })
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const json = await response.json();
      const route = json.routes?.[0]?.geometry?.coordinates || [];

      // Validate route
      if (route.length > 1) {
        routeCacheRef.current.set(cacheKey, route);
        routeCacheRef.current.set(reverseKey, [...route].reverse());
      }

      return route;
    } catch (err) {
      console.error("Routing error:", err);
      return [];
    }
  };

  const findNearestStore = (
    point: [number, number],
    stores: { features: StoreFeature[] }
  ): [number, number] => {
    let nearest = point;
    let minDistance = Infinity;

    stores.features.forEach((store) => {
      const storeCoords = store.geometry.coordinates;
      const distance = turf.distance(
        turf.point(point),
        turf.point(storeCoords)
      );
      if (distance < minDistance) {
        minDistance = distance;
        nearest = storeCoords;
      }
    });

    return nearest;
  };

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      const [tractsRes, storesRes, csvRes] = await Promise.all([
        fetch("/data/Census_Tracts_in_2020.geojson"),
        fetch("/data/Grocery_Store_Locations.geojson"),
        fetch("/data/cleaned_census_tracts.csv"),
      ]);

      const [tracts, stores, csvText] = await Promise.all([
        tractsRes.json(),
        storesRes.json(),
        csvRes.text(),
      ]);

      const csvData = Papa.parse(csvText, { header: true }).data as Array<{
        GEOID: string;
        pop_percent: string;
      }>;

      const popMap = new Map(
        csvData.map((row) => [row.GEOID, parseFloat(row.pop_percent)])
      );

      const people: Person[] = [];
      const TOTAL_PEOPLE = 100; // Reduced for better rate limit handling

      // Create markers first
      tracts.features.forEach(
        (tract: {
          properties: { GEOID: string };
          geometry: turf.AllGeoJSON;
        }) => {
          const tractId = tract.properties.GEOID;
          const population = Math.round(
            (popMap.get(tractId) || 0) * TOTAL_PEOPLE
          );

          for (let i = 0; i < population && people.length < TOTAL_PEOPLE; i++) {
            const home = turf.randomPoint(1, {
              bbox: turf.bbox(tract.geometry),
            }).features[0].geometry.coordinates as [number, number];

            const targetStore = findNearestStore(home, stores);

            const el = document.createElement("div");
            el.style.cssText = `
            width: 12px;
            height: 12px;
            background-color: #2ecc71;
            border-radius: 50%;
            border: 2px solid white;
            box-shadow: 0 0 3px rgba(0,0,0,0.5);
          `;

            const marker = new mapboxgl.Marker(el).setLngLat(home).addTo(map);

            people.push({
              id: `person-${people.length}`,
              marker,
              home,
              targetStore,
              progress: Math.random(),
              isReturning: Math.random() > 0.5,
              route: [],
              tractId,
            });
          }
        }
      );

      // Load routes sequentially
      for (const person of people) {
        if (!mounted) break;
        try {
          const route = await getRoute(person.home, person.targetStore);
          if (route.length > 1) {
            person.route = route;
          } else {
            person.marker.remove();
          }
        } catch (err) {
          console.error("Routing error for person:", person.id, err);
          person.marker.remove();
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      peopleRef.current = people.filter((p) => p.route.length > 1);
      startAnimation();
    };

    const startAnimation = () => {
      const FIXED_SPEED = 0.005; // Adjust this value to change speed (smaller = slower)

      const animate = () => {
        if (!mounted) return;

        peopleRef.current.forEach((person) => {
          const route = person.isReturning
            ? [...person.route].reverse()
            : person.route;

          if (route.length < 2) return;

          const line = turf.lineString(route);
          const distance = turf.length(line);
          const position = turf.along(line, person.progress * distance).geometry
            .coordinates as [number, number];

          person.marker.setLngLat(position);

          person.progress += FIXED_SPEED;
          if (person.progress >= 1) {
            person.progress = 0;
            person.isReturning = !person.isReturning;
          }
        });

        setForceUpdate((prev) => prev + 1);
        animationRef.current = requestAnimationFrame(animate);
      };

      animationRef.current = requestAnimationFrame(animate);
    };

    initialize();

    return () => {
      mounted = false;
      cancelAnimationFrame(animationRef.current);
      peopleRef.current.forEach((p) => p.marker.remove());
    };
  }, [map]);

  async function reloadAndReroute() {
    try {
      // Fetch all stores including new one
      const response = await fetch("/api/get-stores");
      const stores = await response.json();
      console.log("Fetched stores:", stores);

      // For each person
      for (const person of peopleRef.current) {
        console.log("Person home:", person.home);
        let nearestStore = person.targetStore;
        let minDistance = turf.distance(
          turf.point(person.home),
          turf.point(nearestStore)
        );

        // Check each store
        stores.forEach((store: MongoStore) => {
          // The coordinates are already numbers, no need to parse
          const storeCoords: [number, number] = [
            store.geometry.coordinates[0],
            store.geometry.coordinates[1],
          ];

          console.log("Store coordinates:", storeCoords);

          const distance = turf.distance(
            turf.point(person.home),
            turf.point(storeCoords)
          );

          // If this store is closer, update target
          if (distance < minDistance) {
            minDistance = distance;
            nearestStore = storeCoords;
          }
        });

        // If a closer store was found, update route
        if (nearestStore !== person.targetStore) {
          person.targetStore = nearestStore;
          person.progress = 0;
          person.isReturning = false;
          const newRoute = await getRoute(person.home, nearestStore);
          if (newRoute.length > 1) {
            person.route = newRoute;
          }
        }
      }
    } catch (err) {
      console.error("Error reloading routes:", err);
    }
  }

  // Expose the function to the window for access
  useEffect(() => {
    (window as CustomWindow).reloadAndReroute = reloadAndReroute;
    return () => {
      delete (window as CustomWindow).reloadAndReroute;
    };
  }, [reloadAndReroute]);

  return null;
}
