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
  const rateLimitTimeoutRef = useRef<number>(0);

  const getRoute = async (
    start: [number, number],
    end: [number, number]
  ): Promise<[number, number][]> => {
    const cacheKey = `${start.join(",")}-${end.join(",")}`;

    if (routeCacheRef.current.has(cacheKey)) {
      return routeCacheRef.current.get(cacheKey)!;
    }

    // Check rate limit timeout
    const now = Date.now();
    if (now < rateLimitTimeoutRef.current) {
      return [start, end];
    }

    try {
      // Add delay between requests to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 100));

      const query = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/walking/${start[0]},${start[1]};${end[0]},${end[1]}?steps=true&geometries=geojson&access_token=${mapboxgl.accessToken}`
      );

      if (query.status === 429) {
        // Set a timeout for 1 minute when rate limit is hit
        rateLimitTimeoutRef.current = now + 60000;
        return [start, end];
      }

      const json = await query.json();

      if (json.routes?.[0]?.geometry?.coordinates) {
        const route = json.routes[0].geometry.coordinates;
        routeCacheRef.current.set(cacheKey, route as [number, number][]);
        return route as [number, number][];
      }

      return [start, end];
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

          // Create marker with larger green dot
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
            route: [home, targetStore], // Start with direct route
            tractId: tract.properties.GEOID,
          });
        }
      }

      console.log(`Created ${newPeople.length} people`);
      peopleRef.current = newPeople;
      animate();
    };

    const animate = () => {
      peopleRef.current = peopleRef.current.map((person) => {
        try {
          // Only get new route if we're not rate limited
          if (
            (!person.route || person.route.length < 2) &&
            Date.now() >= rateLimitTimeoutRef.current
          ) {
            getRoute(
              person.isReturning ? person.targetStore : person.home,
              person.isReturning ? person.home : person.targetStore
            ).then((route) => {
              person.route = route;
            });
          }

          const route = person.isReturning
            ? [...person.route].reverse()
            : person.route;

          const line = turf.lineString(route);
          const currentPosition = turf.along(
            line,
            person.progress * turf.length(line)
          );

          person.marker.setLngLat(
            currentPosition.geometry.coordinates as [number, number]
          );

          let newProgress = person.progress + 0.001;
          let isReturning = person.isReturning;

          if (newProgress >= 1) {
            newProgress = 0;
            isReturning = !isReturning;
          }

          return {
            ...person,
            progress: newProgress,
            isReturning,
          };
        } catch (error) {
          console.error("Animation error for person:", person.id, error);
          return person;
        }
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    initialize();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      peopleRef.current.forEach((person) => person.marker.remove());
    };
  }, [map]);

  return null;
}
