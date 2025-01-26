"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import * as turf from "@turf/turf";

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

interface TractData {
  origin: {
    type: string;
    coordinates: [number, number];
  };
}

export function SimulationLayer({ map }: SimulationLayerProps) {
  const peopleRef = useRef<Person[]>([]);
  const routeCacheRef = useRef<Map<string, [number, number][]>>(new Map());
  const animationRef = useRef<number>(0);
  const [, setForceUpdate] = useState(0);
  const lastRequestRef = useRef<number>(0);

  const getRoute = useCallback(
    async (
      start: [number, number],
      end: [number, number]
    ): Promise<[number, number][]> => {
      const cacheKey = `${start[0]},${start[1]}-${end[0]},${end[1]}`;
      const reverseKey = `${end[0]},${end[1]}-${start[0]},${start[1]}`;

      if (routeCacheRef.current.has(cacheKey))
        return routeCacheRef.current.get(cacheKey)!;
      if (routeCacheRef.current.has(reverseKey))
        return [...routeCacheRef.current.get(reverseKey)!].reverse();

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
              approaches: "curb;curb",
            })
        );

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const json = await response.json();
        const route = json.routes?.[0]?.geometry?.coordinates || [];

        if (route.length > 1) {
          routeCacheRef.current.set(cacheKey, route);
          routeCacheRef.current.set(reverseKey, [...route].reverse());
        }

        return route as [number, number][];
      } catch (err) {
        console.error("Routing error:", err);
        return [];
      }
    },
    []
  );

  const findNearestStore = useCallback(
    (
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
    },
    []
  );

  const startAnimation = useCallback(() => {
    const FIXED_SPEED = 0.005;

    const animate = () => {
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
  }, []);

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      console.log("Starting initialization...");

      try {
        const originsRes = await fetch("/data/start_point.json");
        if (!originsRes.ok) {
          throw new Error("Failed to load start_point.json");
        }
        const origins = (await originsRes.json()) as Record<string, TractData>;
        console.log("Loaded origins:", Object.keys(origins).length);

        const storesRes = await fetch("/data/Grocery_Store_Locations.geojson");
        if (!storesRes.ok) {
          throw new Error("Failed to load stores data");
        }
        const stores = await storesRes.json();

        console.log("Creating dots for each tract...");
        const people: Person[] = [];

        // Create a dot for each origin point in the JSON
        for (const [tractId, data] of Object.entries(origins)) {
          const coordinates = data.origin.coordinates;

          // Create marker with small random offset
          const home: [number, number] = [
            coordinates[0] + (Math.random() - 0.5) * 0.0001,
            coordinates[1] + (Math.random() - 0.5) * 0.0001,
          ];

          const targetStore = findNearestStore(home, stores);

          const el = document.createElement("div");
          el.style.cssText = `
            width: 12px;
            height: 12px;
            background-color: #2ecc71;
            border-radius: 50%;
            border: 2px solid white;
            box-shadow: 0 0 4px rgba(0,0,0,0.6);
          `;

          const marker = new mapboxgl.Marker({
            element: el,
            anchor: "center",
          })
            .setLngLat(home)
            .addTo(map);

          const route = await getRoute(home, targetStore);
          if (route.length > 1) {
            people.push({
              id: `person-${tractId}`,
              marker,
              home,
              targetStore,
              progress: Math.random(),
              isReturning: Math.random() > 0.5,
              route,
              tractId,
            });
            console.log(`Created dot for tract ${tractId}`);
          } else {
            marker.remove();
            console.warn(`No valid route for tract ${tractId}`);
          }

          // Add delay between route requests
          await new Promise((resolve) => setTimeout(resolve, 300));
          if (!mounted) break;
        }

        console.log(`Created ${people.length} active dots`);
        peopleRef.current = people;

        if (people.length > 0) {
          startAnimation();
        }
      } catch (error) {
        console.error("Initialization error:", error);
      }
    };

    initialize();

    return () => {
      mounted = false;
      cancelAnimationFrame(animationRef.current);
      peopleRef.current.forEach((p) => p.marker.remove());
    };
  }, [map, findNearestStore, getRoute, startAnimation]);

  const reloadAndReroute = useCallback(async () => {
    try {
      const response = await fetch("/api/get-stores");
      const stores = await response.json();

      for (const person of peopleRef.current) {
        let nearestStore = person.targetStore;
        let minDistance = turf.distance(
          turf.point(person.home),
          turf.point(nearestStore)
        );

        stores.forEach((store: MongoStore) => {
          const storeCoords: [number, number] = [
            store.geometry.coordinates[0],
            store.geometry.coordinates[1],
          ];

          const distance = turf.distance(
            turf.point(person.home),
            turf.point(storeCoords)
          );

          if (distance < minDistance) {
            minDistance = distance;
            nearestStore = storeCoords;
          }
        });

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
  }, [getRoute]);

  useEffect(() => {
    (window as CustomWindow).reloadAndReroute = reloadAndReroute;
    return () => {
      delete (window as CustomWindow).reloadAndReroute;
    };
  }, [reloadAndReroute]);

  return null;
}
