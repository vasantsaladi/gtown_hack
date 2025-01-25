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

  const getRoute = async (
    start: [number, number],
    end: [number, number]
  ): Promise<[number, number][]> => {
    // Create cache key
    const cacheKey = `${start.join(",")}-${end.join(",")}`;

    // Check cache first
    if (routeCacheRef.current.has(cacheKey)) {
      return routeCacheRef.current.get(cacheKey)!;
    }

    // Add longer delay between requests (500ms)
    await new Promise((resolve) => setTimeout(resolve, 500));

    try {
      const query = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/walking/${start[0]},${start[1]};${end[0]},${end[1]}?steps=true&geometries=geojson&access_token=${mapboxgl.accessToken}`
      );

      if (query.status === 429) {
        console.log("Rate limit hit, using direct route");
        return [start, end];
      }

      const json = await query.json();
      const route = json.routes?.[0]?.geometry.coordinates || [start, end];

      // Cache the route
      routeCacheRef.current.set(cacheKey, route);
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

    if (!nearestStore) {
      return point;
    }

    return nearestStore;
  };

  useEffect(() => {
    const initialize = async () => {
      console.log("Starting initialization");

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

      // Create a map from GEOID to pop_percent
      const popPercentMap = new Map<string, number>();
      csvJson.forEach((row) => {
        popPercentMap.set(row.GEOID, parseFloat(row.pop_percent));
      });

      // Debug logs
      console.log("Sample CSV GEOID:", csvJson[0].GEOID);
      console.log("Sample Tract GEOID:", tracts.features[0].properties.GEOID);
      console.log(
        "popPercent for first tract:",
        popPercentMap.get(tracts.features[0].properties.GEOID)
      );

      const newPeople: Person[] = [];
      const totalPeopleToCreate = 200; // Changed to 200 total people

      for (const tract of tracts.features) {
        const tractId = tract.properties.GEOID;
        const popPercent = popPercentMap.get(tractId) || 0;
        const tractPeople = Math.round(popPercent * totalPeopleToCreate);

        if (tractPeople === 0) continue;

        console.log(
          `Creating ${tractPeople} people for tract ${
            tract.properties.GEOID
          } (${(popPercent * 100).toFixed(2)}% of population)`
        );

        for (
          let i = 0;
          i < tractPeople && newPeople.length < totalPeopleToCreate;
          i++
        ) {
          // Generate random point within tract boundary
          const point = turf.randomPoint(1, {
            bbox: turf.bbox(tract.geometry),
          });
          const home = point.features[0].geometry.coordinates as [
            number,
            number
          ];

          // Find nearest store
          const targetStore = findNearestStore(home, stores);

          // Create marker element
          const el = document.createElement("div");
          el.style.cssText = `
            width: 8px;
            height: 8px;
            background-color: red;
            border-radius: 50%;
            border: 2px solid white;
            box-shadow: 0 0 2px rgba(0,0,0,0.5);
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
            tractId: tract.properties.GEOID,
          });
        }
      }

      console.log(`Created total of ${newPeople.length} people`);
      peopleRef.current = newPeople;
      animate();
    };

    const animate = () => {
      const currentPeople = peopleRef.current;
      const updatedPeople = currentPeople.map((person) => {
        try {
          // Use getRoute when initializing route
          if (!person.route || person.route.length < 2) {
            getRoute(person.home, person.targetStore).then((route) => {
              person.route = route;
            });
          }

          const route = person.isReturning
            ? person.route.slice().reverse() // Reverse the route for return journey
            : person.route;

          const line = turf.lineString(route);
          const distance = turf.length(line);
          const currentPosition = turf.along(line, person.progress * distance);

          // Update marker position
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

      peopleRef.current = updatedPeople;
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
