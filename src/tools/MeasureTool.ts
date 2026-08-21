import area from "@turf/area";
import distance from "@turf/distance";

export type Coordinate = [number, number];

export type MeasureMode =
  | "distance"
  | "area";

export function calculateDistance(
  point1: Coordinate,
  point2: Coordinate
): number {
  return distance(
    point1,
    point2,
    {
      units: "meters",
    }
  );
}

export function calculateTotalDistance(
  points: Coordinate[]
): number {
  if (points.length < 2) {
    return 0;
  }

  let total = 0;

  for (
    let i = 1;
    i < points.length;
    i++
  ) {
    total += calculateDistance(
      points[i - 1],
      points[i]
    );
  }

  return total;
}

export function calculateArea(
  points: Coordinate[]
): number {
  if (points.length < 3) {
    return 0;
  }

  const isClosed =
    points.length > 3 &&
    points[0][0] === points[points.length - 1][0] &&
    points[0][1] === points[points.length - 1][1];

  const coordinates = isClosed
    ? points
    : [
        ...points,
        points[0],
      ];

  try {
    return area({
      type: "Feature",

      properties: {},

      geometry: {
        type: "Polygon",

        coordinates: [coordinates],
      },
    });
  } catch {
    return 0;
  }
}

export function isSelfIntersectingPolygon(
  points: Coordinate[]
): boolean {
  const cleanPoints =
    points.length > 3 &&
    points[0][0] === points[points.length - 1][0] &&
    points[0][1] === points[points.length - 1][1]
      ? points.slice(0, -1)
      : points;

  if (cleanPoints.length < 4) {
    return false;
  }

  for (
    let i = 0;
    i < cleanPoints.length;
    i++
  ) {
    const segmentStart =
      cleanPoints[i];

    const segmentEnd =
      cleanPoints[(i + 1) % cleanPoints.length];

    for (
      let j = i + 1;
      j < cleanPoints.length;
      j++
    ) {
      if (
        areAdjacentSegments(
          i,
          j,
          cleanPoints.length
        )
      ) {
        continue;
      }

      const otherSegmentStart =
        cleanPoints[j];

      const otherSegmentEnd =
        cleanPoints[(j + 1) % cleanPoints.length];

      if (
        doSegmentsIntersect(
          segmentStart,
          segmentEnd,
          otherSegmentStart,
          otherSegmentEnd
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

export function formatDistance(
  distance: number
): string {
  if (distance < 1000) {
    return `${distance.toFixed(1)} m`;
  }

  return `${(distance / 1000).toFixed(2)} km`;
}

export function formatArea(
  area: number
): string {
  if (area < 10_000) {
    return `${area.toFixed(1)} m²`;
  }

  if (area < 1_000_000) {
    return `${(area / 10_000).toFixed(2)} ha`;
  }

  return `${(area / 1_000_000).toFixed(2)} km²`;
}

function areAdjacentSegments(
  firstIndex: number,
  secondIndex: number,
  pointCount: number
): boolean {
  return (
    firstIndex === secondIndex ||
    (firstIndex + 1) % pointCount === secondIndex ||
    (secondIndex + 1) % pointCount === firstIndex
  );
}

function doSegmentsIntersect(
  start1: Coordinate,
  end1: Coordinate,
  start2: Coordinate,
  end2: Coordinate
): boolean {
  const direction1 =
    getDirection(start1, end1, start2);

  const direction2 =
    getDirection(start1, end1, end2);

  const direction3 =
    getDirection(start2, end2, start1);

  const direction4 =
    getDirection(start2, end2, end1);

  return (
    direction1 * direction2 < 0 &&
    direction3 * direction4 < 0
  );
}

function getDirection(
  start: Coordinate,
  end: Coordinate,
  point: Coordinate
): number {
  return (
    (end[0] - start[0]) *
    (point[1] - start[1]) -
    (end[1] - start[1]) *
    (point[0] - start[0])
  );
}
