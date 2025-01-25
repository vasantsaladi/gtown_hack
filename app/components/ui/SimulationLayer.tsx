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

  const isPointInDC = (point: [number, number]): boolean => {
    // DC bounding box coordinates
    const dcBounds = {
      minLng: -77.1197,
      maxLng: -76.909,
      minLat: 38.7916,
      maxLat: 38.9955,
    };

    return (
      point[0] >= dcBounds.minLng &&
      point[0] <= dcBounds.maxLng &&
      point[1] >= dcBounds.minLat &&
      point[1] <= dcBounds.maxLat
    );
  };

  const generateValidPointInTract = (tract: any): [number, number] => {
    let attempts = 0;
    const maxAttempts = 50;

    while (attempts < maxAttempts) {
      const point = turf.randomPoint(1, {
        bbox: turf.bbox(tract.geometry),
      });
      const coords = point.features[0].geometry.coordinates as [number, number];

      if (
        isPointInDC(coords) &&
        turf.booleanPointInPolygon(point.features[0], tract.geometry)
      ) {
        return coords;
      }
      attempts++;
    }

    // If we can't find a valid point after max attempts, use tract centroid
    const center = turf.centroid(tract.geometry);
    return center.geometry.coordinates as [number, number];
  };

  const getRoute = async (
    start: [number, number],
    end: [number, number]
  ): Promise<[number, number][]> => {
    const cacheKey = `${start.join(",")}-${end.join(",")}`;

    if (routeCacheRef.current.has(cacheKey)) {
      return routeCacheRef.current.get(cacheKey)!;
    }

    try {
      // Add delay between requests to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));

      const query = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/walking/${start[0]},${start[1]};${end[0]},${end[1]}?steps=true&geometries=geojson&overview=full&access_token=${mapboxgl.accessToken}`
      );

      const json = await query.json();

      if (!json.routes || json.routes.length === 0) {
        throw new Error("No route found");
      }

      const route = json.routes[0].geometry.coordinates as [number, number][];

      // Ensure we have enough points for smooth animation
      if (route.length < 2) {
        throw new Error("Route too short");
      }

      // Cache the valid route
      routeCacheRef.current.set(cacheKey, route);
      return route;
    } catch (error) {
      console.error("Route error:", error);

      // If we don't have a cached route, try one more time after a delay
      if (!routeCacheRef.current.has(cacheKey)) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        try {
          const retryQuery = await fetch(
            `https://api.mapbox.com/directions/v5/mapbox/walking/${start[0]},${start[1]};${end[0]},${end[1]}?steps=true&geometries=geojson&overview=full&access_token=${mapboxgl.accessToken}`
          );
          const retryJson = await retryQuery.json();
          if (retryJson.routes && retryJson.routes.length > 0) {
            const retryRoute = retryJson.routes[0].geometry.coordinates as [
              number,
              number
            ][];
            if (retryRoute.length >= 2) {
              routeCacheRef.current.set(cacheKey, retryRoute);
              return retryRoute;
            }
          }
        } catch (retryError) {
          console.error("Retry route error:", retryError);
        }
      }

      // If all else fails, return the cached route or create a new one
      return routeCacheRef.current.get(cacheKey) || [start, end];
    }
  };

  const findNearestStore = (
    point: [number, number],
    stores: { features: Array<StoreFeature> }
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

      const [tracts, stores] = await Promise.all([
        tractsResponse.json(),
        storesResponse.json(),
      ]);

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
          const home = generateValidPointInTract(tract);
          const targetStore = findNearestStore(home, stores);

          // Only create person if both home and target are in DC
          if (!isPointInDC(home) || !isPointInDC(targetStore)) {
            continue;
          }

          // Get initial route
          const route = await getRoute(home, targetStore);

          const el = document.createElement("div");
          el.style.cssText = `
            width: 12px;
            height: 12px;
            background-color: #2ecc71;
            border-radius: 50%;
            border: 2px solid white;
            box-shadow: 0 0 3px rgba(0,0,0,0.5);
          `;

          const marker = new mapboxgl.Marker(el)
            .setLngLat(home)
            .setPopup(
              new mapboxgl.Popup({ offset: 25 }).setHTML(
                `<div>Tract: ${tractId}</div>`
              )
            )
            .addTo(map);

          newPeople.push({
            id: `person-${newPeople.length}`,
            marker,
            home,
            targetStore,
            progress: Math.random(),
            isReturning: Math.random() > 0.5,
            route,
            tractId,
          });
        }
      }

      peopleRef.current = newPeople;
      animate();
    };

    const animate = () => {
      peopleRef.current = peopleRef.current.map((person) => {
        try {
          // Ensure we have a valid route
          if (!person.route || person.route.length < 2) {
            getRoute(
              person.isReturning ? person.targetStore : person.home,
              person.isReturning ? person.home : person.targetStore
            ).then((newRoute) => {
              person.route = newRoute;
            });
            return person;
          }

          const route = person.isReturning
            ? [...person.route].reverse()
            : person.route;

          const line = turf.lineString(route);
          const currentPosition = turf.along(
            line,
            person.progress * turf.length(line)
          );

          // Update marker color based on direction
          const el = person.marker.getElement();
          el.style.backgroundColor = person.isReturning ? "#ffd700" : "#2ecc71";

          person.marker.setLngLat(
            currentPosition.geometry.coordinates as [number, number]
          );

          let newProgress = person.progress + 0.001;
          let isReturning = person.isReturning;

          if (newProgress >= 1) {
            newProgress = 0;
            isReturning = !isReturning;

            // Get new route for next journey
            getRoute(
              isReturning ? person.targetStore : person.home,
              isReturning ? person.home : person.targetStore
            ).then((newRoute) => {
              if (newRoute && newRoute.length >= 2) {
                person.route = newRoute;
              }
              // Update color
              const el = person.marker.getElement();
              el.style.backgroundColor = isReturning ? "#ffd700" : "#2ecc71";
            });
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
