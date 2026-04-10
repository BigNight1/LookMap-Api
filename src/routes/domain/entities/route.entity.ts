/**
 * Route domain entities — pure TypeScript, no framework dependencies.
 */

export interface RouteStep {
  instruction: string;
  distance: number;
}

export interface RouteEntity {
  /** GeoJSON LineString geometry — ready to render on Mapbox GL */
  geojson: object;
  /** Total duration in seconds */
  duration: number;
  /** Total distance in meters */
  distance: number;
  /** Turn-by-turn navigation steps */
  steps: RouteStep[];
}
