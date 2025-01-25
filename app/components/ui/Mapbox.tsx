"use client";
import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";

const MapboxMap = () => {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [zoom, setZoom] = useState(14);
  const [pitch, setPitch] = useState(0);

  useEffect(() => {
    const initializeMap = async () => {
      try {
        const response = await fetch("/api/mapbox-token");
        const { token } = await response.json();
        mapboxgl.accessToken = token;

        if (map.current || !mapContainer.current) return;

        map.current = new mapboxgl.Map({
          container: mapContainer.current as HTMLElement,
          style: "mapbox://styles/mapbox/streets-v12",
          center: [-77.0369, 38.9072],
          zoom: zoom,
          pitch: pitch,
          bearing: 0,
          antialias: true,
        });

        map.current.on("load", () => {
          if (!map.current) return;

          map.current.addSource("mapbox-dem", {
            type: "raster-dem",
            url: "mapbox://mapbox.mapbox-terrain-dem-v1",
            tileSize: 512,
            maxzoom: 14,
          });

          map.current.setTerrain({
            source: "mapbox-dem",
            exaggeration: 1.5,
          });

          map.current.addLayer({
            id: "sky",
            type: "sky",
            paint: {
              "sky-type": "atmosphere",
              "sky-atmosphere-sun": [0.0, 0.0],
              "sky-atmosphere-sun-intensity": 15,
            },
          });

          map.current.setFog({
            range: [0.8, 8],
            color: "white",
            "horizon-blend": 0.5,
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
  }, []);

  const handleZoomIn = () => {
    if (!map.current) return;
    map.current.zoomIn();
    setZoom(map.current.getZoom());
  };

  const handleZoomOut = () => {
    if (!map.current) return;
    map.current.zoomOut();
    setZoom(map.current.getZoom());
  };

  const handleTiltUp = () => {
    if (!map.current) return;
    const newPitch = Math.min(map.current.getPitch() + 10, 85);
    map.current.setPitch(newPitch);
    setPitch(newPitch);
  };

  const handleTiltDown = () => {
    if (!map.current) return;
    const newPitch = Math.max(map.current.getPitch() - 10, 0);
    map.current.setPitch(newPitch);
    setPitch(newPitch);
  };

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainer} className="h-full w-full" />

      {/* Control buttons - adjusted position for full screen */}
      <div className="absolute bottom-8 right-8 flex flex-col gap-2">
        <div className="flex gap-2">
          <button
            onClick={handleZoomIn}
            className="bg-white p-2 rounded-lg shadow-lg hover:bg-gray-100"
          >
            Zoom +
          </button>
          <button
            onClick={handleZoomOut}
            className="bg-white p-2 rounded-lg shadow-lg hover:bg-gray-100"
          >
            Zoom -
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleTiltUp}
            className="bg-white p-2 rounded-lg shadow-lg hover:bg-gray-100"
          >
            Tilt ↑
          </button>
          <button
            onClick={handleTiltDown}
            className="bg-white p-2 rounded-lg shadow-lg hover:bg-gray-100"
          >
            Tilt ↓
          </button>
        </div>
      </div>
    </div>
  );
};

export default MapboxMap;
