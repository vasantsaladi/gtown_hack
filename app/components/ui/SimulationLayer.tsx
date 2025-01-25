"use client";
import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import * as turf from "@turf/turf";
import Papa from "papaparse";

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

export function SimulationLayer({ map }: SimulationLayerProps) {
  const animationFrameRef = useRef<number | null>(null);
  const peopleRef = useRef<Person[]>([]);
  const routeCacheRef = useRef<Map<string, [number, number][]>>(new Map());
  const lastRequestTimeRef = useRef<number>(0);
  const isMountedRef = useRef(true);

  const getRoute = async (
    start: [number, number],
    end: [number, number]
  ): Promise<[number, number][]> => {
    const cacheKey = `${start.join(",")}-${end.join(",")}`;
    const reverseKey = `${end.join(",")}-${start.join(",")}`;

    if (routeCacheRef.current.has(cacheKey))
      return routeCacheRef.current.get(cacheKey)!;
    if (routeCacheRef.current.has(reverseKey))
      return [...routeCacheRef.current.get(reverseKey)!].reverse();

    const now = Date.now();
    const timeSinceLast = now - lastRequestTimeRef.current;
    const delay = Math.max(300 - timeSinceLast, 0); // 300ms between requests

    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      lastRequestTimeRef.current = Date.now();
      const response = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/walking/${start[0]},${start[1]};${end[0]},${end[1]}?steps=true&geometries=geojson&access_token=${mapboxgl.accessToken}`
      );

      if (response.status === 429) {
        console.log("Rate limited - using direct route");
        return [start, end];
      }

      const json = await response.json();
      const route = json.routes?.[0]?.geometry?.coordinates || [start, end];

      routeCacheRef.current.set(cacheKey, route);
      routeCacheRef.current.set(reverseKey, [...route].reverse());

      return route as [number, number][];
    } catch (error) {
      console.error("Route error:", error);
      return [start, end];
    }
  };

  const findNearestStore = (
    point: [number, number],
    stores: {
      features: Array<StoreFeature>;
    }
  ): [number, number] => {
    let nearestStore: [number, number] | null = null;
    let minDistance = Infinity;

    stores.features.forEach((store: StoreFeature) => {
      const storeCoords = store.geometry.coordinates;
      const distance = turf.distance(
        turf.point(point),
        turf.point(storeCoords)
      );
      if (distance < minDistance) {
        minDistance = distance;
        nearestStore = storeCoords;
      }
    });

    return nearestStore || point;
  };

  useEffect(() => {
    const initialize = async () => {
      const [tractsResponse, storesResponse, csvData] = await Promise.all([
        fetch("/data/Census_Tracts_in_2020.geojson"),
        fetch("/data/Grocery_Store_Locations.geojson"),
        fetch("/data/cleaned_census_tracts.csv").then((res) => res.text()),
      ]);

      const tracts = await tractsResponse.json();
      const stores = await storesResponse.json();
      const csvJson = Papa.parse(csvData, { header: true }).data as {
        GEOID: string;
        pop_percent: string;
      }[];

      const popPercentMap = new Map<string, number>();
      csvJson.forEach((row) => {
        popPercentMap.set(row.GEOID, parseFloat(row.pop_percent));
      });

      const newPeople: Person[] = [];
      const totalPeopleToCreate = 200;

      // Create all people first
      for (const tract of tracts.features) {
        const tractId = tract.properties.GEOID;
        const popPercent = popPercentMap.get(tractId) || 0;
        const tractPeople = Math.round(popPercent * totalPeopleToCreate);

        if (tractPeople === 0) continue;

        for (
          let i = 0;
          i < tractPeople && newPeople.length < totalPeopleToCreate;
          i++
        ) {
          const point = turf.randomPoint(1, {
            bbox: turf.bbox(tract.geometry),
          });
          const home = point.features[0].geometry.coordinates as [
            number,
            number
          ];
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

          newPeople.push({
            id: `person-${newPeople.length}`,
            marker,
            home,
            targetStore,
            progress: Math.random(),
            isReturning: Math.random() > 0.5,
            route: [home, targetStore],
            tractId,
          });
        }
      }

      // Load routes sequentially with delay
      for (const person of newPeople) {
        try {
          person.route = await getRoute(person.home, person.targetStore);
        } catch (error) {
          console.error("Route loading error:", error);
        }
      }

      peopleRef.current = newPeople;
      console.log("Initialization complete - starting animation");

      // Animation loop
      const animate = () => {
        if (!isMountedRef.current) return;

        const currentPeople = peopleRef.current;

        currentPeople.forEach((person) => {
          try {
            if (person.route.length < 2) return;

            const route = person.isReturning
              ? [...person.route].reverse()
              : person.route;

            const line = turf.lineString(route);
            const distance = turf.length(line);
            const currentPosition = turf.along(
              line,
              person.progress * distance
            );

            person.marker.setLngLat(
              currentPosition.geometry.coordinates as [number, number]
            );

            const newProgress = person.progress + 0.01; // Faster movement
            if (newProgress >= 1) {
              person.progress = 0;
              person.isReturning = !person.isReturning;
            } else {
              person.progress = newProgress;
            }
          } catch (error) {
            console.error("Animation error:", error);
          }
        });

        animationFrameRef.current = requestAnimationFrame(animate);
      };

      animate();
    };

    initialize();

    return () => {
      isMountedRef.current = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      peopleRef.current.forEach((person) => person.marker.remove());
    };
  }, [map]);

  return null;
}
