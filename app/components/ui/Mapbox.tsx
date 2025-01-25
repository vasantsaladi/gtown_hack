"use client";
import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";

// Define the type for our GeoJSON feature properties
interface NeighborhoodProperties {
  NAME: string;
  NBH_NAMES: string;
  // Add other specific properties you need from your GeoJSON
  OBJECTID?: number;
  Shape_Area?: number;
  Shape_Length?: number;
  [key: string]: string | number | undefined; // for any remaining string or number properties
}

export default function MapboxMap() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [lng] = useState(-77.0369);
  const [lat] = useState(38.9072);
  const [zoom] = useState(11);

  useEffect(() => {
    const initializeMap = async () => {
      try {
        const response = await fetch("/api/mapbox-token");
        const { token } = await response.json();
        mapboxgl.accessToken = token;

        if (map.current || !mapContainer.current) return;

        map.current = new mapboxgl.Map({
          container: mapContainer.current as HTMLElement,
          style: "mapbox://styles/mapbox/light-v11",
          center: [lng, lat],
          zoom: zoom,
          antialias: true,
        });

        map.current.on("load", () => {
          if (!map.current) return;

          // Add the GeoJSON source
          map.current.addSource("neighborhoods", {
            type: "geojson",
            data: "/data/Neighborhood_Clusters.geojson",
          });

          // Add a layer showing the neighborhood boundaries
          map.current.addLayer({
            id: "neighborhood-borders",
            type: "line",
            source: "neighborhoods",
            layout: {},
            paint: {
              "line-color": "#627BC1",
              "line-width": 2,
            },
          });

          // Add a layer for the neighborhood fills
          map.current.addLayer({
            id: "neighborhood-fills",
            type: "fill",
            source: "neighborhoods",
            layout: {},
            paint: {
              "fill-color": "#627BC1",
              "fill-opacity": 0.1,
            },
          });

          // Add hover effect
          map.current.on("mouseenter", "neighborhood-fills", () => {
            if (!map.current) return;
            map.current.getCanvas().style.cursor = "pointer";
          });

          map.current.on("mouseleave", "neighborhood-fills", () => {
            if (!map.current) return;
            map.current.getCanvas().style.cursor = "";
          });

          // Add popup on click
          map.current.on("click", "neighborhood-fills", (e) => {
            if (!map.current || !e.features?.length) return;

            const feature = e.features[0] as mapboxgl.MapboxGeoJSONFeature & {
              properties: NeighborhoodProperties;
            };

            if (!feature.properties) return;

            new mapboxgl.Popup()
              .setLngLat(e.lngLat)
              .setHTML(
                `
                <h3 style="font-weight: bold; margin-bottom: 5px;">${
                  feature.properties.NAME || "Unknown"
                }</h3>
                <p>${
                  feature.properties.NBH_NAMES || "No neighborhoods listed"
                }</p>
              `
              )
              .addTo(map.current);
          });
        });
      } catch (error) {
        console.error("Error initializing map:", error);
      }
    };

    initializeMap();

    return () => {
      if (map.current) map.current.remove();
    };
  }, [lng, lat, zoom]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainer} className="h-full w-full" />
    </div>
  );
}
