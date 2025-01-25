import { point, featureCollection } from "@turf/helpers";
import { default as nearestPoint } from "@turf/nearest-point";
import type { Feature, Point, FeatureCollection } from "geojson";

interface GroceryStore {
  id: string;
  coordinates: [number, number];
  capacity: number;
  properties: Record<string, unknown>;
}

export class SpatialIndex {
  private stores: FeatureCollection<Point>;
  private residents: FeatureCollection<Point>;
  private storeCache = new Map<string, GroceryStore>();

  // DC-specific grid cell size (1km in decimal degrees)
  private static GRID_SIZE = 0.009; // ~1km at DC's latitude

  constructor(stores: Feature<Point>[], residents: Feature<Point>[]) {
    this.stores = featureCollection(stores);
    this.residents = featureCollection(residents);
    this.cacheStores(stores);
  }

  private cacheStores(stores: Feature<Point>[]) {
    stores.forEach((store) => {
      if (!store.properties?.id) return;
      const [lng, lat] = store.geometry.coordinates;
      this.storeCache.set(store.properties.id as string, {
        id: store.properties.id as string,
        coordinates: [lng, lat],
        capacity: (store.properties.capacity as number) || 100,
        properties: store.properties,
      });
    });
  }

  update(stores: Feature<Point>[], residents: Feature<Point>[]) {
    this.stores = featureCollection(stores);
    this.residents = featureCollection(residents);
    this.cacheStores(stores);
  }

  queryNearestStores(
    searchPoint: [number, number],
    radius: number = 1.5
  ): GroceryStore[] {
    const searchFeature = point(searchPoint);

    // Find nearest stores within the bounding box
    const nearestStores = nearestPoint(searchFeature, this.stores);

    if (!nearestStores.properties?.id) return [];

    const store = this.storeCache.get(nearestStores.properties.id as string);
    if (!store) return [];

    const distance = this.calculateDCDistance(searchPoint, store.coordinates);
    if (distance > radius) return [];

    return [store];
  }

  private calculateDCDistance(
    a: [number, number],
    b: [number, number]
  ): number {
    return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2));
  }

  private calculateDCBoundingBox(
    center: [number, number],
    radius: number
  ): [number, number, number, number] {
    const delta = radius * 0.009;
    return [
      center[0] - delta,
      center[1] - delta,
      center[0] + delta,
      center[1] + delta,
    ];
  }
}
